import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import EditableRangesDialog from "../../../modules/review-tools/components/EditableRangesDialog.vue";
import EditableRangeEditorDialog from "../../../modules/review-tools/components/EditableRangeEditorDialog.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import RangeReferencePicker from "../../../shared/range-reference/RangeReferencePicker.vue";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../canvas-interaction";

let wrapper: ReturnType<typeof mount>;
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});
test("picks an editable range, preserves the draft on cancellation, and saves only on confirmation", async () => {
  wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => undefined,
        save: async () => ({ revision: 1, savedAt: 1 }),
        replace: async () => ({ revision: 1, savedAt: 1 }),
      },
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  await flushPromises();
  await wrapper.get('[data-ribbon-category="review"]').trigger("click");
  await wrapper.get('[data-review-action="editable-ranges"]').trigger("click");
  const manager = wrapper.getComponent(EditableRangesDialog);
  await manager.get('[data-range-action="add"]').trigger("click");
  const editor = wrapper.getComponent(EditableRangeEditorDialog);
  const input = editor.getComponent(RangeReferenceInput);
  await input.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  expect(editor.props("suspended")).toBe(true);
  await triggerCanvasCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 3, column: 2 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 3, column: 2 }, "mouseup", { button: 0 });
  wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
  await flushPromises();
  expect(editor.props("suspended")).toBe(false);
  expect(input.props("modelValue")).toBe("B2:C4");
  await input.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  await triggerCanvasCell(wrapper, { row: 5, column: 5 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 5, column: 5 }, "mouseup", { button: 0 });
  wrapper.getComponent(RangeReferencePicker).vm.$emit("cancel");
  await flushPromises();
  expect(input.props("modelValue")).toBe("B2:C4");
  editor.getComponent(TDialog).vm.$emit("confirm");
  await flushPromises();
  const sheet = wrapper.getComponent(SheetGrid).props("sheet");
  expect(sheet.protection?.editableRanges ?? []).toEqual([]);
  manager.getComponent(TDialog).vm.$emit("confirm");
  await flushPromises();
  expect(sheet.protection?.editableRanges).toEqual([
    { name: "Range1", range: { start: { row: 1, column: 1 }, end: { row: 3, column: 2 } } },
  ]);
});
