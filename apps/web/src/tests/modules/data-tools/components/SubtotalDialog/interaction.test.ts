import { DOMWrapper, mount } from "@vue/test-utils";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { afterEach, expect, test } from "vitest";
import SubtotalDialog from "../../../../../modules/data-tools/components/SubtotalDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});
function open() {
  wrapper = mount(SubtotalDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      hasSubtotals: true,
      columns: [
        { column: 7, label: "H", header: "Category" },
        { column: 8, label: "I", header: "Amount" },
      ],
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}
function confirm() {
  return new DOMWrapper(document.body).findAll("button").find((button) => button.text() === "OK")!;
}
test("submits the product function and all three subtotal choices", async () => {
  const dialog = open();
  const select = dialog.findAllComponents(TSelect)[1]!;
  expect(select.props("options")).toContainEqual({ label: "Product", value: "product" });
  select.vm.$emit("update:modelValue", "product");
  const checks = dialog.findAllComponents(TCheckbox);
  const replace = checks.find((check) => check.text() === "Replace current subtotals")!;
  const pageBreaks = checks.find((check) => check.text() === "Page break between groups")!;
  const below = checks.find((check) => check.text() === "Summary below data")!;
  replace.vm.$emit("update:modelValue", false);
  pageBreaks.vm.$emit("update:modelValue", true);
  below.vm.$emit("update:modelValue", false);
  await dialog.vm.$nextTick();
  await confirm().trigger("click");
  expect(dialog.emitted("apply")?.[0]?.[0]).toEqual({
    groupColumn: 7,
    function: "product",
    valueColumns: [8],
    replaceExisting: false,
    pageBreaks: true,
    summaryBelow: false,
  });
});
test("uses WPS defaults on reopen and retains Remove All", async () => {
  const dialog = open();
  await confirm().trigger("click");
  expect(dialog.emitted("apply")?.[0]?.[0]).toMatchObject({
    replaceExisting: true,
    pageBreaks: false,
    summaryBelow: true,
  });
  dialog
    .findAllComponents(TCheckbox)
    .find((check) => check.text() === "Summary below data")!
    .vm.$emit("update:modelValue", false);
  await dialog.setProps({ visible: false });
  await dialog.setProps({ visible: true });
  await confirm().trigger("click");
  expect(dialog.emitted("apply")?.at(-1)?.[0]).toMatchObject({ summaryBelow: true });
  const remove = new DOMWrapper(document.body)
    .findAll("button")
    .find((button) => button.text() === "Remove All")!;
  await remove.trigger("click");
  expect(dialog.emitted("removeAll")).toHaveLength(1);
});
