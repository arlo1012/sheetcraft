import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select } from "tdesign-vue-next/es/select";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createSheet, createWorkbook, insertSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook, type WorkbookSnapshot } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import ConditionalFormatEditorDialog from "../../../modules/conditional-formatting/components/ConditionalFormatEditorDialog.vue";
import ConditionalFormatManagerDialog from "../../../modules/conditional-formatting/components/ConditionalFormatManagerDialog.vue";
import ConditionalFormatQuickDialog from "../../../modules/conditional-formatting/components/ConditionalFormatQuickDialog.vue";
import ConditionalFormatContainingCriteria from "../../../modules/conditional-formatting/components/ConditionalFormatContainingCriteria.vue";
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
  const addRule = document.body.querySelector<HTMLButtonElement>('[data-cf-action="new"]');
  if (!addRule) throw new Error("Missing new conditional-formatting rule button.");
  await new DOMWrapper(addRule).trigger("click");
  await flushPromises();

  const editor = wrapper.getComponent(ConditionalFormatEditorDialog);
  expect(editor.props("selectReference")).toBeTypeOf("function");
  await editor.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  expect(editor.getComponent(Dialog).props("visible")).toBe(false);

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

test("keeps a full multi-cell comparison reference through cancellation but rejects it on save", async () => {
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
  expect(wrapper.getComponent(RangeReferencePicker).props("reference")).toBe("=Summary!$D$1:$E$3");
  wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
  await flushPromises();
  expect(field.get<HTMLInputElement>("input").element.value).toBe("=$D$1:$E$3");
  expect(dialog.getComponent(Dialog).props("visible")).toBe(true);

  await field.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  wrapper.getComponent(RangeReferencePicker).vm.$emit("cancel");
  await flushPromises();
  expect(field.get<HTMLInputElement>("input").element.value).toBe("=$D$1:$E$3");
  await field.get("input").trigger("keydown", { key: "Enter", code: "Enter" });
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").conditionalFormats).toEqual([]);
  expect(document.body.textContent).toMatch(/single-cell reference/i);
});

test("preserves a same-sheet multi-cell text pick, rejects it bare, and saves an aggregate formula", async () => {
  const wrapper = await mountWorkspace();
  wrapper.getComponent(SpreadsheetRibbon).vm.$emit("createConditionalFormat", "contains");
  await flushPromises();
  const quick = wrapper.getComponent(ConditionalFormatQuickDialog);
  const field = quick.getComponent(RangeReferenceInput);
  await field.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  await triggerCanvasCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 2 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 2 }, "mouseup", { button: 0 });
  expect(wrapper.getComponent(RangeReferencePicker).props("reference")).toBe("=Summary!$B$2:$C$3");
  wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
  await flushPromises();
  expect(field.get<HTMLInputElement>("input").element.value).toBe("=$B$2:$C$3");
  quick.getComponent(Dialog).vm.$emit("confirm");
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").conditionalFormats).toEqual([]);
  expect(document.body.textContent).toMatch(/single-cell reference/i);

  await field.get("input").setValue("=CONCAT($B$2:$C$3)");
  quick.getComponent(Dialog).vm.$emit("confirm");
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").conditionalFormats).toEqual([
    expect.objectContaining({
      condition: {
        kind: "text",
        operator: "contains",
        text: { formula: "=CONCAT($B$2:$C$3)" },
      },
    }),
  ]);

  wrapper.getComponent(SpreadsheetRibbon).vm.$emit("manageConditionalFormats");
  await flushPromises();
  const manager = wrapper.getComponent(ConditionalFormatManagerDialog);
  expect(manager.get("[data-cf-scope]")).toBeDefined();
  manager.getComponent(Select).vm.$emit("update:modelValue", "sheet");
  await flushPromises();
  const edit = manager.get('[data-cf-action="edit"]');
  await edit.trigger("click");
  await flushPromises();
  const criteria = wrapper.getComponent(ConditionalFormatContainingCriteria);
  expect(criteria.props("type")).toBe("text");
  expect(criteria.props("value")).toBe("=CONCAT($B$2:$C$3)");
});

test("saves a cross-sheet single-cell text reference and returns to the rule sheet", async () => {
  const wrapper = await mountWorkspace();
  wrapper.getComponent(SpreadsheetRibbon).vm.$emit("createConditionalFormat", "contains");
  await flushPromises();
  const quick = wrapper.getComponent(ConditionalFormatQuickDialog);
  const field = quick.getComponent(RangeReferenceInput);
  await field.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  wrapper.getComponent(WorkbookStatusBar).vm.$emit("select", "details");
  await flushPromises();
  await triggerCanvasCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 1, column: 1 }, "mouseup", { button: 0 });
  expect(wrapper.getComponent(RangeReferencePicker).props("reference")).toBe("=Details!$B$2");
  wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").name).toBe("Summary");
  expect(field.get<HTMLInputElement>("input").element.value).toBe("=Details!$B$2");
  quick.getComponent(Dialog).vm.$emit("confirm");
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").conditionalFormats).toEqual([
    expect.objectContaining({
      condition: {
        kind: "text",
        operator: "contains",
        text: { formula: "=Details!$B$2" },
      },
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

test("edits a Details rule in place, restores Summary after picking, and saves only Details", async () => {
  const wrapper = await mountWorkspace();
  wrapper.getComponent(SpreadsheetRibbon).vm.$emit("manageConditionalFormats");
  await flushPromises();

  const manager = wrapper.getComponent(ConditionalFormatManagerDialog);
  manager.getComponent(Select).vm.$emit("update:modelValue", "sheet:details");
  await flushPromises();
  await manager.get('[data-cf-action="new"]').trigger("click");
  await flushPromises();

  const editor = wrapper.getComponent(ConditionalFormatEditorDialog);
  await editor.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").name).toBe("Details");
  expect(wrapper.getComponent(RangeReferencePicker).props("reference")).toBe("A1");
  wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").name).toBe("Summary");

  editor.vm.$emit("save", {
    id: "details-rule",
    ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
    anchor: { row: 0, column: 0 },
    condition: { kind: "cellValue", operator: "greaterThan", value: 1 },
    style: { fillColor: "#FDE2E1" },
  });
  await flushPromises();
  manager.getComponent(Dialog).vm.$emit("confirm");
  await flushPromises();

  expect(wrapper.getComponent(SheetGrid).props("sheet").conditionalFormats).toEqual([]);
  wrapper.getComponent(WorkbookStatusBar).vm.$emit("select", "details");
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").conditionalFormats).toEqual([
    expect.objectContaining({ id: "details-rule" }),
  ]);
});
