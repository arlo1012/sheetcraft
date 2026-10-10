import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { RadioGroup } from "tdesign-vue-next/es/radio";
import CreateTableDialog from "../../../modules/table-styles/components/CreateTableDialog.vue";
import type { CreateTableDraft } from "../../../modules/table-styles/table-ui-types";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { createAppI18n } from "../../../shared/i18n";

const initial: CreateTableDraft = {
  range: "=Sheet1!$A$1:$D$7",
  mode: "table",
  headerRows: 1,
  hasHeaders: true,
  filterButton: true,
};
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function fixture(props: Partial<InstanceType<typeof CreateTableDialog>["$props"]> = {}) {
  const wrapper = mount(CreateTableDialog, {
    attachTo: document.body,
    props: { initial, ...props },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("table dialog entry intent", () => {
  test("Insert shows only the source and editable header/filter controls", async () => {
    const wrapper = fixture({ intent: "insert" });
    const dialog = wrapper.getComponent(Dialog);
    expect(dialog.props("header")).toBe("Create table");
    expect(wrapper.findComponent(RadioGroup).exists()).toBe(false);
    expect(wrapper.findComponent(InputNumber).exists()).toBe(false);
    expect(wrapper.getComponent(RangeReferenceInput).props("modelValue")).toBe(initial.range);
    const checkboxes = wrapper.findAllComponents(Checkbox);
    expect(checkboxes).toHaveLength(2);
    for (const checkbox of checkboxes) {
      expect(checkbox.props("modelValue")).toBe(true);
      expect(checkbox.props("disabled")).toBe(false);
      await checkbox.vm.$emit("update:modelValue", false);
    }
    expect(wrapper.text()).not.toContain("When unchecked");
    await dialog.vm.$emit("confirm");
    expect(wrapper.emitted("confirm")).toEqual([
      [{ ...initial, hasHeaders: false, filterButton: false }],
    ]);
  });

  test("Insert ignores a legacy appearance-mode initial draft while honoring empty headers", async () => {
    const empty = {
      ...initial,
      range: "=Sheet1!$A$1",
      mode: "styleOnly" as const,
      hasHeaders: false,
    };
    const wrapper = fixture({ intent: "insert", initial: empty });
    const checkboxes = wrapper.findAllComponents(Checkbox);
    expect(checkboxes[0]!.props("modelValue")).toBe(false);
    expect(checkboxes[0]!.props("disabled")).toBe(false);
    expect(checkboxes[1]!.props("modelValue")).toBe(true);
    await wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")).toEqual([[{ ...empty, mode: "table" }]]);
  });

  test("the style gallery and legacy callers retain both appearance and table modes", async () => {
    for (const intent of [undefined, "applyStyle"] as const) {
      const wrapper = fixture({ intent });
      expect(wrapper.getComponent(Dialog).props("header")).toBe("Apply table style");
      const modes = wrapper.getComponent(RadioGroup);
      expect(modes.props("modelValue")).toBe("table");
      const headerCount = wrapper.getComponent(InputNumber);
      expect(headerCount.props("disabled")).toBe(true);
      await modes.vm.$emit("update:modelValue", "styleOnly");
      expect(headerCount.props("disabled")).toBe(false);
      for (const checkbox of wrapper.findAllComponents(Checkbox))
        expect(checkbox.props("disabled")).toBe(true);
      await headerCount.vm.$emit("update:modelValue", 2);
      await wrapper.getComponent(Dialog).vm.$emit("confirm");
      expect(wrapper.emitted("confirm")).toEqual([
        [{ ...initial, mode: "styleOnly", headerRows: 2 }],
      ]);
    }
  });

  test("range picking and suspension retain overrides, while Cancel never confirms", async () => {
    const selectReference = vi.fn(async () => "=Sheet1!$E$1:$F$3");
    const wrapper = fixture({ intent: "insert", selectReference });
    await wrapper.findAllComponents(Checkbox)[0]!.vm.$emit("update:modelValue", false);
    const input = wrapper.getComponent(RangeReferenceInput);
    await input.get("[data-select-formula-reference]").trigger("click");
    expect(selectReference).toHaveBeenCalledWith(initial.range);
    expect(input.props("modelValue")).toBe("=Sheet1!$E$1:$F$3");
    await wrapper.setProps({ suspended: true, initial: { ...initial, hasHeaders: true } });
    expect(wrapper.getComponent(Dialog).props("visible")).toBe(false);
    await wrapper.setProps({ suspended: false });
    expect(wrapper.findAllComponents(Checkbox)[0]!.props("modelValue")).toBe(false);
    expect(input.props("modelValue")).toBe("=Sheet1!$E$1:$F$3");
    await wrapper.getComponent(Dialog).vm.$emit("close");
    expect(wrapper.emitted("cancel")).toEqual([[]]);
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });
});
