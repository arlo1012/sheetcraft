import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  setCellValue,
} from "@idea10/core/workbook";
import { serializeWorkbook, type WorkbookSnapshot } from "@idea10/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import DataToolbar from "../../../modules/data-tools/components/DataToolbar.vue";
import DataValidationDialog from "../../../modules/data-tools/components/DataValidationDialog.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import WorkbookStatusBar from "../../../modules/workbook/components/WorkbookStatusBar.vue";
import RangeReferencePicker from "../../../shared/range-reference/RangeReferencePicker.vue";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../canvas-interaction";
import type { WorkbookStore } from "../../../modules/workbook-persistence/workbookStore";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

function createSnapshot(): WorkbookSnapshot {
  const workbook = createWorkbook({
    idFactory: createSequentialIdFactory(),
    sheetName: "Summary",
  });
  const summary = getActiveSheet(workbook);
  setCellValue(summary, { row: 0, column: 1 }, 2);
  const details = createSheet("Details", "details");
  setCellValue(details, { row: 0, column: 1 }, 8);
  insertSheet(workbook, details);
  return serializeWorkbook(workbook);
}

function createStore(snapshot = createSnapshot()): WorkbookStore {
  let record = { revision: 1, savedAt: 1, snapshot };
  return {
    load: vi.fn(async () => record),
    save: vi.fn(async (next: WorkbookSnapshot, revision: number | undefined) => {
      record = { revision: (revision ?? 0) + 1, savedAt: 2, snapshot: next };
      return { revision: record.revision, savedAt: record.savedAt };
    }),
    replace: vi.fn(async (next: WorkbookSnapshot) => {
      record = { revision: record.revision + 1, savedAt: 2, snapshot: next };
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

async function openWholeValidation(wrapper: Awaited<ReturnType<typeof mountWorkspace>>) {
  await wrapper
    .getComponent(SpreadsheetRibbon)
    .get('[data-ribbon-category="data"]')
    .trigger("click");
  await flushPromises();
  wrapper.getComponent(DataToolbar).vm.$emit("openValidation");
  await flushPromises();
  const dialog = wrapper.getComponent(DataValidationDialog);
  const type = dialog.findAllComponents({ name: "TSelect" })[0]!;
  type.vm.$emit("update:modelValue", "whole");
  await flushPromises();
  return dialog;
}

function boundInput(index: 0 | 1): HTMLInputElement {
  const input = [
    ...document.body.querySelectorAll<HTMLInputElement>(".validation-dialog .t-input__inner"),
  ].at(-(2 - index));
  if (!input) throw new Error(`Missing validation bound input ${index}.`);
  return input;
}

test("uses a picked cell as a validation bound without changing the validation target", async () => {
  const wrapper = await mountWorkspace();
  const dialog = await openWholeValidation(wrapper);
  await new DOMWrapper(boundInput(1)).setValue("10");
  await flushPromises();

  await dialog.get('[aria-label="Select minimum cell"]').trigger("click");
  await flushPromises();
  expect(dialog.props("suspended")).toBe(true);
  await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 1, column: 2 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 1, column: 2 }, "mouseup", { button: 0 });
  const picker = wrapper.getComponent(RangeReferencePicker);
  expect(picker.props("reference")).toBe("=Summary!$B$1");
  picker.vm.$emit("confirm");
  await flushPromises();

  expect(dialog.props("suspended")).toBe(false);
  expect(boundInput(0).value).toBe("=Summary!$B$1");
  expect(boundInput(1).value).toBe("10");
  expect(wrapper.getComponent(SheetGrid).props("sheet").dataValidations ?? []).toEqual([]);

  const confirm = [
    ...document.body.querySelectorAll<HTMLButtonElement>(".data-validation-dialog button"),
  ].find((button) => button.textContent?.trim() === "OK");
  expect(confirm?.disabled).toBe(false);
  await new DOMWrapper(confirm!).trigger("click");
  await flushPromises();

  const sheet = wrapper.getComponent(SheetGrid).props("sheet");
  expect(sheet.dataValidations).toEqual([
    expect.objectContaining({
      range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      type: "whole",
      formula1: "=Summary!$B$1",
      formula2: "10",
    }),
  ]);
});

test("cancels a validation bound pick and returns from another sheet before confirming", async () => {
  const wrapper = await mountWorkspace();
  const dialog = await openWholeValidation(wrapper);
  await dialog.get('[aria-label="Select minimum cell"]').trigger("click");
  await flushPromises();
  wrapper.getComponent(WorkbookStatusBar).vm.$emit("select", "details");
  await flushPromises();
  await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mouseup", { button: 0 });
  const picker = wrapper.getComponent(RangeReferencePicker);
  expect(picker.props("reference")).toBe("=Details!$B$1");
  picker.vm.$emit("confirm");
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).props("sheet").name).toBe("Summary");
  expect(boundInput(0).value).toBe("=Details!$B$1");

  await dialog.get('[aria-label="Select minimum cell"]').trigger("click");
  await flushPromises();
  await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "mouseup", { button: 0 });
  wrapper.getComponent(RangeReferencePicker).vm.$emit("cancel");
  await flushPromises();
  expect(boundInput(0).value).toBe("=Details!$B$1");
});
