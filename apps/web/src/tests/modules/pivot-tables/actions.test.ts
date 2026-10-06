import { describe, expect, test } from "vitest";
import {
  createSheet,
  insertSheet,
  getCellValue,
  setCellContent,
  getCellContent,
  setCellNote,
  setCellHyperlink,
  setCellSparkline,
  setCellStyle,
  getCellNote,
  getCellHyperlink,
  getCellSparkline,
  getCellStyle,
} from "@idea10/core/workbook";
import { serializeWorkbook } from "@idea10/core/serialization";
import { undoWorkbookCommand } from "@idea10/core/history";
import { fixture } from "./fixture";

function configured() {
  const f = fixture();
  f.actions.open();
  f.actions.confirm(f.actions.editing.value!);
  f.selectOutput();
  f.actions.update({
    ...f.sheet.pivotTables![0]!,
    rowFields: [0],
    values: [{ field: 2, aggregate: "sum", caption: "Sum Amount" }],
  });
  return f;
}
describe("pivot actions", () => {
  test("overwrites an empty report's reserved cells before field configuration and restores them on undo", () => {
    const f = fixture();
    const address = { row: 18, column: 0 };
    setCellContent(f.source, address, { kind: "literal", value: "Old content" });
    setCellStyle(f.source, address, { bold: true });
    setCellNote(f.source, address, { text: "Old note" });
    setCellHyperlink(f.source, address, { target: "https://example.com" });
    setCellSparkline(f.source, address, {
      type: "line",
      source: { start: { row: 1, column: 2 }, end: { row: 3, column: 2 } },
      color: "#2563eb",
      negativeColor: "#ef4444",
      markers: false,
      axis: false,
      showHidden: false,
      empty: "gap",
    });
    const before = serializeWorkbook(f.workbook);
    f.actions.open();
    f.actions.confirm({
      ...f.actions.editing.value!,
      newSheet: false,
      destination: "'Source Data'!A19",
      overwrite: true,
    });
    expect(f.actions.error.value).toBe(false);
    expect(getCellContent(f.source, address)).toBeNull();
    expect(getCellNote(f.source, address)).toBeUndefined();
    expect(getCellHyperlink(f.source, address)).toBeUndefined();
    expect(getCellSparkline(f.source, address)).toBeUndefined();
    expect(getCellStyle(f.source, address)?.bold).toBe(true);
    const empty = serializeWorkbook(f.workbook);
    expect(
      f.actions.update({
        ...f.source.pivotTables![0]!,
        rowFields: [0],
        values: [{ field: 2, aggregate: "sum", caption: "Amount" }],
      }),
    ).toBe(true);
    expect(getCellValue(f.source, { row: 19, column: 1 })).toBe(30);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(empty);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test.each(["merged", "sourceOverlap", "tableOverlap"] as const)(
    "reports %s conflicts that overwrite cannot bypass",
    (reason) => {
      const f = fixture();
      let destination = "'Source Data'!E1";
      if (reason === "merged")
        f.source.mergedCells = [{ start: { row: 0, column: 4 }, end: { row: 0, column: 5 } }];
      if (reason === "sourceOverlap") destination = "'Source Data'!A1";
      if (reason === "tableOverlap") {
        f.actions.open();
        f.actions.confirm({ ...f.actions.editing.value!, newSheet: false, destination });
        destination = "'Source Data'!E5";
      }
      const before = serializeWorkbook(f.workbook);
      f.actions.open();
      f.actions.confirm({
        ...f.actions.editing.value!,
        newSheet: false,
        destination,
        overwrite: true,
      });
      expect(f.actions.error.value).toBe(true);
      expect(f.actions.errorReason.value).toBe(reason);
      expect(f.actions.editing.value).toBeDefined();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
  test("creates an empty report and optional chart before configuring real output", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    f.actions.open(true);
    const draft = f.actions.editing.value!;
    expect(draft).toMatchObject({
      mode: "create",
      newSheet: true,
      overwrite: false,
      table: { rowFields: [], columnFields: [], values: [], filters: [] },
    });
    f.actions.confirm(draft);
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.sheet.id).not.toBe(f.source.id);
    expect(f.sheet.pivotTables![0]!.outputRange).toBeNull();
    expect(f.sheet.cells.size).toBe(0);
    expect(f.sheet.drawings).toHaveLength(1);
    expect(
      f.actions.update({
        ...f.sheet.pivotTables![0]!,
        rowFields: [0],
        values: [{ field: 2, aggregate: "sum", caption: "Amount" }],
      }),
    ).toBe(true);
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(30);
    expect(getCellValue(f.sheet, { row: 2, column: 1 })).toBe(40);
    undoWorkbookCommand(f.session);
    expect(f.sheet.pivotTables![0]!.outputRange).toBeNull();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("starts another empty create draft even while an existing report is selected", () => {
    const f = configured();
    const id = f.sheet.pivotTables![0]!.id;
    f.actions.open();
    expect(f.actions.editing.value!.existing).toBe(false);
    expect(f.actions.editing.value!.table.id).not.toBe(id);
    expect(f.actions.editing.value!.table.values).toEqual([]);
  });
  test("refreshes configured output from source changes and restores output on undo", () => {
    const f = configured();
    setCellContent(f.source, { row: 1, column: 2 }, { kind: "literal", value: 15 });
    const before = serializeWorkbook(f.workbook);
    f.actions.refresh();
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(35);
    expect(f.onError).not.toHaveBeenCalled();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("source confirmation without changes closes without adding history", () => {
    const f = configured();
    f.actions.source();
    expect(f.actions.editing.value!.mode).toBe("source");
    f.actions.confirm(f.actions.editing.value!);
    expect(f.execute.mock.results.at(-1)?.value).toBe(false);
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.onError).not.toHaveBeenCalled();
    undoWorkbookCommand(f.session);
    expect(f.sheet.pivotTables![0]!.outputRange).toBeNull();
  });
  test("rejects expanded source conflicts atomically and retains the editor", () => {
    const f = configured();
    ["North", "Q1", 50].forEach((value, column) =>
      setCellContent(f.source, { row: 4, column }, { kind: "literal", value }),
    );
    setCellContent(f.sheet, { row: 4, column: 0 }, { kind: "literal", value: "Blocker" });
    f.actions.source();
    const draft = { ...f.actions.editing.value!, source: "'Source Data'!A1:C5" };
    const before = serializeWorkbook(f.workbook);
    f.actions.confirm(draft);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.actions.error.value).toBe(true);
    f.actions.confirm({ ...draft, overwrite: true });
    expect(f.actions.editing.value).toBeUndefined();
    expect(getCellValue(f.sheet, { row: 4, column: 1 })).toBe(120);
  });
  test("retains source field identity when headers are reordered or removed", () => {
    const f = configured();
    const other = createSheet("Reordered", "other");
    insertSheet(f.workbook, other);
    [
      ["Amount", "Region"],
      [10, "East"],
      [40, "West"],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(other, { row: r, column }, { kind: "literal", value }),
      ),
    );
    f.actions.source();
    f.actions.confirm({ ...f.actions.editing.value!, source: "Reordered!A1:B3" });
    expect(f.sheet.pivotTables![0]).toMatchObject({
      sourceSheetId: other.id,
      rowFields: [1],
      values: [{ field: 0 }],
    });
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(10);
  });
  test("moves a selected existing report with a dedicated location draft", () => {
    const f = configured();
    f.actions.move();
    expect(f.actions.editing.value!.mode).toBe("move");
    f.actions.confirm({ ...f.actions.editing.value!, destination: `${f.sheet.name}!E1` });
    expect(f.sheet.pivotTables![0]!.anchor).toEqual({ row: 0, column: 4 });
    expect(getCellValue(f.sheet, { row: 1, column: 5 })).toBe(30);
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBeNull();
  });
  test("clears fields into an empty report and removes it with or without clearing output", () => {
    const f = configured();
    f.actions.clear();
    expect(f.sheet.cells.size).toBe(0);
    expect(f.sheet.pivotTables![0]).toMatchObject({
      rowFields: [],
      columnFields: [],
      values: [],
      filters: [],
      outputRange: null,
    });
    undoWorkbookCommand(f.session);
    f.actions.remove(false);
    expect(f.sheet.pivotTables).toEqual([]);
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(30);
    undoWorkbookCommand(f.session);
    f.actions.remove(true);
    expect(f.sheet.pivotTables).toEqual([]);
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBeNull();
  });
  test("rejects stale workbook and structure-protected creation drafts", () => {
    const f = fixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    f.replaceWorkbook();
    f.actions.confirm(draft);
    expect(f.execute).not.toHaveBeenCalled();
    const protectedFixture = fixture();
    protectedFixture.actions.open();
    protectedFixture.workbook.structureProtected = true;
    protectedFixture.actions.confirm(protectedFixture.actions.editing.value!);
    expect(protectedFixture.execute).not.toHaveBeenCalled();
    expect(protectedFixture.actions.error.value).toBe(true);
  });
  test("blocks source confirmation and immediate updates when pivot permissions change", () => {
    const f = configured();
    f.actions.source();
    const draft = f.actions.editing.value!;
    f.execute.mockClear();
    f.sheet.properties.protected = true;
    f.sheet.protection = { editableRanges: [] };
    f.actions.confirm(draft);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.update(f.sheet.pivotTables![0]!)).toBe(false);
    f.actions.refresh();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
