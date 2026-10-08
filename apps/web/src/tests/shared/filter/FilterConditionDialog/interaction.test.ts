import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { AutoComplete as TAutoComplete } from "tdesign-vue-next/es/auto-complete";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import FilterConditionDialog from "../../../../shared/filter/components/FilterConditionDialog.vue";
import { createAppI18n } from "../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});

function fixture() {
  wrapper = mount(FilterConditionDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      columnLabel: "Score",
      kind: "number",
      action: "custom",
      dateSystem: "1900",
      values: [
        { key: { kind: "number", value: 12 }, label: "12", count: 1 },
        { key: { kind: "string", value: "12*" }, label: "12*", count: 1 },
      ],
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}

describe("FilterConditionDialog", () => {
  test("uses real autocomplete input and suggestions, then confirms a wildcard text equality", async () => {
    const w = fixture();
    const autoComplete = w.findAllComponents(TAutoComplete)[0]!;
    expect(autoComplete.props("options")).toEqual([
      { text: "12", label: "12" },
      { text: "12*", label: "12*" },
    ]);

    const firstInput = new DOMWrapper(document.body).get<HTMLInputElement>(
      '[aria-label="First condition value"] input',
    );
    await firstInput.setValue("12*");
    w.findComponent(Dialog).vm.$emit("confirm");
    expect(w.emitted("apply")).toEqual([[{ kind: "text", operator: "equals", value: "12*" }]]);
  });

  test("combines two dialog rows and resets an unconfirmed edit when reopened", async () => {
    const w = fixture();
    const selects = w.findAllComponents(TSelect);
    selects[0]!.vm.$emit("update:modelValue", "greaterThan");
    selects[1]!.vm.$emit("update:modelValue", "lessThan");
    w.findComponent(TRadioGroup).vm.$emit("update:modelValue", "or");
    const inputs = new DOMWrapper(document.body).findAll<HTMLInputElement>(
      '[aria-label="First condition value"] input, [aria-label="Second condition value"] input',
    );
    await inputs[0]!.setValue("12");
    await inputs[1]!.setValue("20");
    w.findComponent(Dialog).vm.$emit("confirm");
    expect(w.emitted("apply")?.[0]).toEqual([
      {
        kind: "compound",
        operator: "or",
        conditions: [
          { kind: "number", operator: "greaterThan", value: 12 },
          { kind: "number", operator: "lessThan", value: 20 },
        ],
      },
    ]);

    await inputs[0]!.setValue("99");
    w.findComponent(Dialog).vm.$emit("close");
    await w.setProps({ visible: false });
    await w.setProps({ visible: true });
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="First condition value"] input')
        ?.value,
    ).toBe("");
  });
});
