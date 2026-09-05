import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  deserializeWorkbook,
  serializeWorkbook,
  type WorkbookSnapshotV2,
} from "@idea10/core/serialization";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
  setCellValue,
} from "@idea10/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import type { WorkbookStore } from "../../../modules/workbook-persistence/workbookStore";
import { createAppI18n } from "../../../shared/i18n";
import { createTestClipboardEvent } from "../../modules/sheet-grid/components/SheetGrid/clipboard-fixture";

const mounted: Array<{ unmount(): void }> = [];

function createFilteredClipboardSnapshot(): WorkbookSnapshotV2 {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  sheet.freezePanes = { rows: 1, columns: 1 };
  sheet.mergedCells = [{ start: { row: 0, column: 5 }, end: { row: 0, column: 6 } }];
  sheet.filter = {
    range: { start: { row: 0, column: 0 }, end: { row: 4, column: 2 } },
    columns: [{ column: 0, allowedValues: [{ kind: "string", value: "show" }] }],
  };
  setCellValue(sheet, { row: 0, column: 0 }, "Status");
  setCellValue(sheet, { row: 1, column: 0 }, "show");
  setCellValue(sheet, { row: 2, column: 0 }, "hidden");
  setCellValue(sheet, { row: 3, column: 0 }, "show");
  setCellValue(sheet, { row: 4, column: 0 }, "show");
  for (const row of [1, 2, 3, 4]) {
    setCellContent(
      sheet,
      { row, column: 1 },
      {
        kind: "formula",
        formula: { source: `=A${row + 1}` },
      },
    );
  }
  setCellStyle(sheet, { row: 1, column: 1 }, { bold: true, fillColor: "#fde68a" });
  setCellStyle(
    sheet,
    { row: 2, column: 1 },
    {
      borderBottom: { style: "medium", color: "#345678" },
    },
  );
  return serializeWorkbook(workbook);
}

function createMemoryStore(initialSnapshot: WorkbookSnapshotV2) {
  let record = { revision: 1, savedAt: 1, snapshot: initialSnapshot };
  const store = {
    load: vi.fn(async () => record),
    save: vi.fn(async (snapshot: WorkbookSnapshotV2, expectedRevision: number | undefined) => {
      const revision = (expectedRevision ?? 0) + 1;
      record = { revision, savedAt: revision * 10, snapshot };
      return { revision, savedAt: record.savedAt };
    }),
    replace: vi.fn(async (snapshot: WorkbookSnapshotV2) => {
      record = { revision: record.revision + 1, savedAt: record.savedAt + 1, snapshot };
      return { revision: record.revision, savedAt: record.savedAt };
    }),
  } satisfies WorkbookStore;
  return { store, getRecord: () => record };
}

async function mountWorkspace(store: WorkbookStore) {
  const wrapper = mount(SpreadsheetWorkspace, {
    props: { workbookStore: store },
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

async function copyFilteredFormulaColumn(wrapper: Awaited<ReturnType<typeof mountWorkspace>>) {
  await wrapper.get('[data-row="1"][data-column="1"]').trigger("mousedown", { button: 0 });
  await wrapper
    .get('[data-row="4"][data-column="1"]')
    .trigger("mousedown", { button: 0, shiftKey: true });
  const copied = createTestClipboardEvent("copy");
  wrapper.get("textarea.cell-editor").element.dispatchEvent(copied.event);
  await flushPromises();
  return copied;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("filtered clipboard workspace integration", () => {
  test("copies only visible formulas/styles, undoes atomically, and restores the saved filtered document", async () => {
    const memory = createMemoryStore(createFilteredClipboardSnapshot());
    const wrapper = await mountWorkspace(memory.store);
    const copied = await copyFilteredFormulaColumn(wrapper);
    const grid = wrapper.findComponent(SheetGrid);
    const beforePasteRevision = grid.props("workbookRevision") as number;

    expect(copied.data.get("text/plain")).toBe("show\r\nshow\r\nshow");
    await wrapper.get('[data-row="1"][data-column="2"]').trigger("mousedown", { button: 0 });
    wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(createTestClipboardEvent("paste", copied.data).event);
    await flushPromises();

    expect(grid.props("workbookRevision")).toBe(beforePasteRevision + 1);
    expect(wrapper.get('[data-row="1"][data-column="2"]').text()).toContain("show");
    expect(wrapper.get('[data-row="3"][data-column="2"]').text()).toContain("show");
    expect(wrapper.get('[data-row="4"][data-column="2"]').text()).toContain("show");

    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "z", ctrlKey: true });
    await flushPromises();
    expect(wrapper.get('[data-row="1"][data-column="2"]').text()).not.toContain("show");
    expect(wrapper.get('[data-row="3"][data-column="2"]').text()).not.toContain("show");
    await editor.trigger("keydown", { key: "z", ctrlKey: true, shiftKey: true });
    await flushPromises();
    expect(wrapper.get('[data-row="4"][data-column="2"]').text()).toContain("show");

    await editor.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(memory.store.save).toHaveBeenCalledTimes(1);
    wrapper.unmount();

    const restored = await mountWorkspace(memory.store);
    const restoredSheet = getActiveSheet(deserializeWorkbook(memory.getRecord().snapshot));
    expect(getCellContent(restoredSheet, { row: 1, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=B2" },
    });
    expect(getCellContent(restoredSheet, { row: 2, column: 2 })).toBeNull();
    expect(getCellContent(restoredSheet, { row: 3, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=B4" },
    });
    expect(getCellStyle(restoredSheet, { row: 1, column: 2 })).toEqual({
      bold: true,
      fillColor: "#fde68a",
    });
    expect(getCellStyle(restoredSheet, { row: 2, column: 1 })).toEqual({
      borderBottom: { style: "medium", color: "#345678" },
    });
    expect(restoredSheet.filter).toEqual({
      range: { start: { row: 0, column: 0 }, end: { row: 4, column: 2 } },
      columns: [{ column: 0, allowedValues: [{ kind: "string", value: "show" }] }],
    });
    expect(restoredSheet.freezePanes).toEqual({ rows: 1, columns: 1 });
    expect(restoredSheet.mergedCells).toEqual([
      { start: { row: 0, column: 5 }, end: { row: 0, column: 6 } },
    ]);
    expect(restored.get('[data-row="4"][data-column="2"]').text()).toContain("show");
  });

  test("rejects a non-divisible filtered paste without changing revision or scheduling a save", async () => {
    const memory = createMemoryStore(createFilteredClipboardSnapshot());
    const wrapper = await mountWorkspace(memory.store);
    const copied = await copyFilteredFormulaColumn(wrapper);
    const grid = wrapper.findComponent(SheetGrid);
    const beforePasteRevision = grid.props("workbookRevision");

    await wrapper.get('[data-row="1"][data-column="2"]').trigger("mousedown", { button: 0 });
    await wrapper
      .get('[data-row="3"][data-column="2"]')
      .trigger("mousedown", { button: 0, shiftKey: true });
    wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(createTestClipboardEvent("paste", copied.data).event);
    await flushPromises();

    expect(grid.props("workbookRevision")).toBe(beforePasteRevision);
    expect(memory.store.save).not.toHaveBeenCalled();
    expect(wrapper.get(".workbook-status-bar__status").text()).toContain("does not fit");
  });
});
