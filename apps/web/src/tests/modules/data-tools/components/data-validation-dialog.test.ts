import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import DataValidationDialog from "../../../../modules/data-tools/components/DataValidationDialog.vue";
import { createAppI18n } from "../../../../shared/i18n";

describe("DataValidationDialog", () => {
  test("shows the settings fields after opening and only enables Whole validation when complete", async () => {
    const wrapper = mount(DataValidationDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: false },
    });
    await wrapper.setProps({ visible: true });
    await nextTick();
    await nextTick();
    expect(document.body.textContent).toContain("Allow");
    const type = wrapper.findAllComponents({ name: "TSelect" })[0]!;
    expect(type.exists()).toBe(true);
    type.vm.$emit("update:modelValue", "whole");
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain("Minimum");
    expect(document.body.textContent).toContain("Maximum");
    const confirm = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "OK",
    )!;
    expect(confirm.disabled).toBe(true);
    const inputs = [
      ...document.body.querySelectorAll<HTMLInputElement>(".validation-dialog .t-input__inner"),
    ];
    await new DOMWrapper(inputs.at(-2)!).setValue("1");
    await new DOMWrapper(inputs.at(-1)!).setValue("10");
    await wrapper.vm.$nextTick();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    expect(wrapper.emitted("apply")?.[0]?.[0]).toMatchObject({
      type: "whole",
      minimum: "1",
      maximum: "10",
    });
  });

  test("reopens custom source text", async () => {
    const wrapper = mount(DataValidationDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        visible: false,
        initial: { id: "custom", type: "custom", formula1: "=A1>0", allowBlank: true },
      },
    });
    await wrapper.setProps({ visible: true });
    await nextTick();
    await nextTick();
    expect(document.body.textContent).toContain("Source");
    expect(wrapper.findAllComponents({ name: "TInput" }).at(-1)?.props("modelValue")).toBe("=A1>0");
  });
});
