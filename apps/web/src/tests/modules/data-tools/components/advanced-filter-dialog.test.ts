import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { defineComponent, h, ref } from "vue";
import AdvancedFilterDialog from "../../../../modules/data-tools/components/AdvancedFilterDialog.vue";
import type { AdvancedFilterDraft } from "../../../../modules/data-tools/data-tools-types";
import { createAppI18n } from "../../../../shared/i18n";

const initial = {
  mode: "inPlace" as const,
  listRange: "A1:C10",
  criteriaRange: "E1:F2",
  destination: "",
  uniqueOnly: false,
  overwrite: false,
};
const mounted: Array<{ unmount: () => void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});
describe("AdvancedFilterDialog", () => {
  test("requires ranges, disables copy destination in place, and emits a copy draft", async () => {
    const wrapper = mount(AdvancedFilterDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, initial },
    });
    mounted.push(wrapper);
    const inputs = wrapper.findAllComponents({ name: "TInput" });
    expect(inputs[2]!.props("disabled")).toBe(true);
    wrapper.findComponent({ name: "TRadioGroup" }).vm.$emit("update:modelValue", "copy");
    await wrapper.vm.$nextTick();
    expect(inputs[2]!.props("disabled")).toBe(false);
    const nativeInputs = [
      ...document.body.querySelectorAll<HTMLInputElement>(
        ".advanced-filter-dialog .t-input__inner",
      ),
    ];
    await new DOMWrapper(nativeInputs.at(-1)!).setValue("H1");
    await wrapper.vm.$nextTick();
    wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    expect(wrapper.emitted("apply")?.[0]?.[0]).toMatchObject({ mode: "copy", destination: "H1" });
  });
  test("emits its exact range picker field and hides while picking", async () => {
    const wrapper = mount(AdvancedFilterDialog, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, initial },
    });
    mounted.push(wrapper);
    await wrapper.get('[aria-label="Select range：List range"]').trigger("click");
    expect(wrapper.emitted("pickRange")?.[0]).toEqual(["listRange"]);
    await wrapper.setProps({ picking: "criteriaRange" });
    expect(wrapper.findComponent({ name: "TDialog" }).props("visible")).toBe(false);
  });

  test("mirrors a controlled draft without recursive updates and allows unique-only filtering", async () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          const draft = ref<AdvancedFilterDraft>({ ...initial, criteriaRange: "" });
          return () =>
            h(AdvancedFilterDialog, {
              visible: true,
              initial: draft.value,
              onDraftChange: (next) => {
                draft.value = { ...next };
              },
            });
        },
      }),
      { global: { plugins: [createAppI18n("en-US")] } },
    );
    mounted.push(wrapper);
    const dialog = wrapper.getComponent(AdvancedFilterDialog);
    const confirm = () => dialog.findComponent({ name: "TDialog" }).props("confirmBtn");
    expect(confirm()).toMatchObject({ disabled: false });
    dialog.findAllComponents({ name: "TCheckbox" })[0]!.vm.$emit("update:modelValue", true);
    await wrapper.vm.$nextTick();
    expect(dialog.emitted("draftChange")).toHaveLength(1);
    expect(dialog.props("initial").uniqueOnly).toBe(true);
    dialog.findComponent({ name: "TRadioGroup" }).vm.$emit("update:modelValue", "copy");
    await wrapper.vm.$nextTick();
    expect(confirm()).toMatchObject({ disabled: true });
    dialog.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    expect(dialog.emitted("apply")).toBeUndefined();
  });
});
