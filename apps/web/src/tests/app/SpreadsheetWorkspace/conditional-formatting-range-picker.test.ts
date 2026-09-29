import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createSheet, createWorkbook, insertSheet } from "@idea10/core/workbook";
import { serializeWorkbook, type WorkbookSnapshot } from "@idea10/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import ConditionalFormatEditorDialog from "../../../modules/conditional-formatting/components/ConditionalFormatEditorDialog.vue";
import ConditionalFormatManagerDialog from "../../../modules/conditional-formatting/components/ConditionalFormatManagerDialog.vue";
import ConditionalFormatQuickDialog from "../../../modules/conditional-formatting/components/ConditionalFormatQuickDialog.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import WorkbookStatusBar from "../../../modules/workbook/components/WorkbookStatusBar.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import RangeReferencePicker from "../../../shared/range-reference/RangeReferencePicker.vue";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../canvas-interaction";
import type { WorkbookStore } from "../../../modules/workbook-persistence/workbookStore";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function createStore(): WorkbookStore {
  const workbook = createWorkbook({
    idFactory: createSequentialIdFactory(),
    sheetName: "Summary",
  });
  insertSheet(workbook, createSheet("Details", "details"));
  let record = { revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) };
  return {
    load: vi.fn(async () => record),
    save: vi.fn(async (snapshot: WorkbookSnapshot, revision: number | undefined) => {
      record = { revision: (revision ?? 0) + 1, savedAt: 2, snapshot };
      return { revision: record.revision, savedAt: record.savedAt };
    }),
    replace: vi.fn(async (snapshot: WorkbookSnapshot) => {
      record = { revision: record.revision + 1, savedAt: 2, snapshot };
      return { revision: record.revision, savedAt: record.savedAt };
    }),
  };
}

async function mountWorkspace() {
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: { workbookStore: createStore() },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function appliesToInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>('[aria-label="Applies to"] input');
  if (!input) throw new Error("Missing conditional-formatting range input.");
  return input;
}

test("confirms a picked current-sheet range and preserves the draft when cancelled", async () => {
  const wrapper = await mountWorkspace();
  wrapper.getComponent(SpreadsheetRibbon).vm.$emit("manageConditionalFormats");
  await flushPromises();

  const manager = wrapper.getComponent(ConditionalFormatManagerDialog);
  const addRule = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === "New conditional formatting rule",
  );
  if (!addRule) throw new Error("Missing new conditional-formatting rule button.");
  await new DOMWrapper(addRule).trigger("click");
  await flushPromises();

  const editor = wrapper.getComponent(ConditionalFormatEditorDialog);
  expect(editor.props("selectReference")).toBeTypeOf("function");
  await editor.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  expect(wrapper.findComponent(ConditionalFormatEditorDialog).isVisible()).toBe(false);

  await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 1, column: 2 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 1, column: 2 }, "mouseup", { button: 0 });
  expect(wrapper.getComponent(RangeReferencePicker).props("reference")).toBe("=Summary!$B$1:$C$2");
  wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
  await flushPromises();
  expect(appliesToInput().value).toBe("B1:C2");

  await editor.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  wrapper.getComponent(RangeReferencePicker).vm.$emit("cancel");
  await flushPromises();
  expect(appliesToInput().value).toBe("B1:C2");
  expect(manager.props("visible")).toBe(true);
});

test("picks an absolute scalar comparison value, cancels without losing it, and saves the original scope", async () => {
  const wrapper = await mountWorkspace();
  wrapper.getComponent(SpreadsheetRibbon).vm.$emit("createConditionalFormat", "greaterThan");
  await flushPromises();
  const dialog = wrapper.getComponent(ConditionalFormatQuickDialog);
  const field = dialog
    .findAllComponents(RangeReferenceInput)
    .find((input) => input.props("label") === "Value")!;
  await field.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  expect(dialog.getComponent(Dialog).props("visible")).toBe(false);
  await triggerCanvasCell(wrapper, { row: 0, column: 3 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 4 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 4 }, "mouseup", { button: 0 });
  expect(wrapper.getComponent(RangeReferencePicker).props("reference")).toBe("=Summary!$D$1");
  wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
  await flushPromises();
  expect(field.get<HTMLInputElement>("input").element.value).toBe("=$D$1");
  expect(dialog.getComponent(Dialog).props("visible")).toBe(true);

  await field.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  wrapper.getComponent(RangeReferencePicker).vm.$emit("cancel");
  await flushPromises();
  expect(field.get<HTMLInputElement>("input").element.value).toBe("=$D$1");
  await field.get("input").trigger("keydown", { key: "Enter", code: "Enter" });
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").conditionalFormats).toEqual([
    expect.objectContaining({
      ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
      condition: { kind: "cellValue", operator: "greaterThan", value: { formula: "=$D$1" } },
    }),
  ]);
});

test("picks a value from another sheet and returns to the rule sheet", async () => {
  const wrapper = await mountWorkspace();
  wrapper.getComponent(SpreadsheetRibbon).vm.$emit("createConditionalFormat", "equal");
  await flushPromises();
  const dialog = wrapper.getComponent(ConditionalFormatQuickDialog);
  const field = dialog
    .findAllComponents(RangeReferenceInput)
    .find((input) => input.props("label") === "Value")!;
  await field.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  wrapper.getComponent(WorkbookStatusBar).vm.$emit("select", "details");
  await flushPromises();
  await triggerCanvasCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 1, column: 1 }, "mouseup", { button: 0 });
  wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").name).toBe("Summary");
  expect(field.get<HTMLInputElement>("input").element.value).toBe("=Details!$B$2");
});
