import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  setCellValue,
  getCellContent,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook, type WorkbookSnapshot } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import DataToolbar from "../../../modules/data-tools/components/DataToolbar.vue";
import LookupFillDialog from "../../../modules/data-tools/components/LookupFillDialog.vue";
import ConsolidateDialog from "../../../modules/data-tools/components/ConsolidateDialog.vue";
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
  setCellValue(summary, { row: 0, column: 0 }, "x");
  const details = createSheet("Details", "details");
  setCellValue(details, { row: 0, column: 0 }, "x");
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

test("picks a lookup source across sheets, preserves the target and fills through Core", async () => {
  const wrapper = await mountWorkspace();
  await wrapper
    .getComponent(SpreadsheetRibbon)
    .get('[data-ribbon-category="data"]')
    .trigger("click");
  await wrapper.getComponent(DataToolbar).get('[data-data-action="lookup-fill"]').trigger("click");
  await flushPromises();
  const dialog = wrapper.getComponent(LookupFillDialog);
  dialog.vm.$emit("draftChange", {
    ...dialog.props("initial"),
    targetRange: "Summary!A1:B1",
    hasHeader: false,
  });
  await flushPromises();
  dialog.vm.$emit("pickRange", "sourceRange");
  await flushPromises();
  expect(dialog.props("picking")).toBe(true);
  wrapper.getComponent(WorkbookStatusBar).vm.$emit("select", "details");
  await flushPromises();
  await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mouseup", { button: 0 });
  expect(wrapper.getComponent(RangeReferencePicker).props("reference")).toBe("=Details!$A$1:$B$1");
  await wrapper.trigger("keydown", { key: "Enter" });
  await flushPromises();
  expect(dialog.props("picking")).toBe(false);
  expect(dialog.props("initial").targetRange).toBe("Summary!A1:B1");
  const draft = {
    ...dialog.props("initial"),
    matchFields: [{ sourceColumn: 0, targetColumn: 0 }],
    fillFields: [{ sourceColumn: 1, targetColumn: 1 }],
  };
  dialog.vm.$emit("draftChange", draft);
  await flushPromises();
  expect(dialog.props("preview")).toMatchObject({ matchedRows: 1, writeCount: 1 });
  dialog.vm.$emit("apply", draft);
  await flushPromises();
  expect(dialog.props("visible")).toBe(false);
  wrapper.getComponent(WorkbookStatusBar).vm.$emit(
    "select",
    wrapper
      .getComponent(WorkbookStatusBar)
      .props("sheets")
      .find((sheet: { name: string }) => sheet.name === "Summary")!.id,
  );
  await flushPromises();
  expect(
    getCellContent(wrapper.getComponent(SheetGrid).props("sheet"), { row: 0, column: 1 }),
  ).toEqual({ kind: "literal", value: 8 });
});

test("picks a consolidation destination as one cell and applies the previewed result", async () => {
  const wrapper = await mountWorkspace();
  await wrapper
    .getComponent(SpreadsheetRibbon)
    .get('[data-ribbon-category="data"]')
    .trigger("click");
  await wrapper.getComponent(DataToolbar).get('[data-data-action="consolidate"]').trigger("click");
  await flushPromises();
  const dialog = wrapper.getComponent(ConsolidateDialog);
  dialog.vm.$emit("draftChange", {
    ...dialog.props("initial"),
    sources: ["Details!B1", "Details!B1"],
  });
  await flushPromises();
  dialog.vm.$emit("pickRange", "destination");
  await flushPromises();
  await triggerCanvasCell(wrapper, { row: 0, column: 2 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 4 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 4 }, "mouseup", { button: 0 });
  expect(wrapper.getComponent(RangeReferencePicker).props("reference")).toBe("=Summary!$C$1");
  wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
  await flushPromises();
  expect(dialog.props("preview")).toMatchObject({ rows: 1, columns: 1, sample: [[16]] });
  dialog.vm.$emit("apply", dialog.props("initial"));
  await flushPromises();
  expect(dialog.props("visible")).toBe(false);
  expect(
    getCellContent(wrapper.getComponent(SheetGrid).props("sheet"), { row: 0, column: 2 }),
  ).toEqual({ kind: "literal", value: 16 });
});

test("stages a cross-sheet consolidation reference without changing the source list", async () => {
  const wrapper = await mountWorkspace();
  await wrapper
    .getComponent(SpreadsheetRibbon)
    .get('[data-ribbon-category="data"]')
    .trigger("click");
  await wrapper.getComponent(DataToolbar).get('[data-data-action="consolidate"]').trigger("click");
  await flushPromises();
  const dialog = wrapper.getComponent(ConsolidateDialog);
  const initialSources = [...dialog.props("initial").sources];
  const pending = dialog.props("selectSourceReference")!("Summary!A1");
  await flushPromises();
  expect(dialog.props("picking")).toBe(true);
  wrapper.getComponent(WorkbookStatusBar).vm.$emit("select", "details");
  await flushPromises();
  await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mouseup", { button: 0 });
  wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
  expect(await pending).toBe("=Details!$A$1:$B$1");
  await flushPromises();
  expect(dialog.props("picking")).toBe(false);
  expect(dialog.props("initial").sources).toEqual(initialSources);
});
