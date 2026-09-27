import { mount } from "@vue/test-utils";
import { expect, test } from "vitest";
import WorkbookFormulaBar from "../../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

test("protection cancels formula drafts while leaving address navigation available", async () => {
  const wrapper = mount(WorkbookFormulaBar, {
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      address: { row: 0, column: 0 },
      addressLabel: "A1",
      inputValue: "12",
    },
  });
  const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
  await input.trigger("focus");
  await input.setValue("=SUM(12,30)");
  await wrapper.setProps({ readOnly: true });
  expect(input.element.readOnly).toBe(true);
  expect(input.element.value).toBe("12");
  await input.setValue("999");
  await input.trigger("keydown", { key: "Enter" });
  await input.trigger("blur");
  expect(wrapper.emitted("commitCell")).toBeUndefined();
  expect(wrapper.vm.hasPendingEdit()).toBe(false);
  await wrapper.get("[data-address-input]").setValue("B2");
  await wrapper.get("[data-address-input]").trigger("keydown", { key: "Enter" });
  expect(wrapper.emitted("navigate")).toEqual([["B2"]]);
  wrapper.unmount();
});
