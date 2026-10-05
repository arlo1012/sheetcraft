import { describe, expect, test } from "vitest";
import { buildPivotResult, getPivotTableRange, type SheetPivotTable } from "../../pivot-tables.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { getCellValue, setCellContent, setCellNote } from "../../workbook.js";
import { fixture } from "./fixture.js";

function empty(table: SheetPivotTable): SheetPivotTable {
  return { ...table, rowFields: [], columnFields: [], values: [], filters: [] };
}
describe("empty pivot reports", () => {
  test.each([false, true])(
    "keeps an all-empty report with filters=%s without writing placeholder cells",
    (withFilters) => {
      const f = fixture();
      const table = {
        ...empty(f.table),
        filters: withFilters ? [{ field: 0, values: ["East"] }] : [],
      };
      expect(buildPivotResult(f.workbook, table)).toMatchObject({
        matrix: [],
        dataRows: [],
        subtotalRows: [],
        headerRows: 0,
      });
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, table));
      expect(f.destination.pivotTables).toHaveLength(1);
      expect(f.destination.pivotTables![0]!.outputRange).toBeNull();
      expect(f.destination.cells.size).toBe(0);
      expect(getPivotTableRange(f.destination.pivotTables![0]!)).toEqual({
        start: { row: 2, column: 2 },
        end: { row: 15, column: 4 },
      });
    },
  );
  test("creates, configures, clears, and restores an empty report through history", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, empty(f.table)));
    const blank = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    expect(getCellValue(f.destination, { row: 3, column: 3 })).toBe(30);
    const populated = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, empty(f.destination.pivotTables![0]!)),
    );
    expect(f.destination.cells.size).toBe(0);
    expect(f.destination.pivotTables![0]!.outputRange).toBeNull();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(populated);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(blank);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(blank);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(populated);
    redoWorkbookCommand(f.session);
    expect(f.destination.cells.size).toBe(0);
  });
  test.each(["value", "note", "merged", "pivot"] as const)(
    "rejects reserved-area %s conflicts before mutating cells or metadata",
    (kind) => {
      const f = fixture();
      const table = empty(f.table);
      const corner = { row: 15, column: 4 };
      if (kind === "value")
        setCellContent(f.destination, corner, { kind: "literal", value: "Reserved" });
      if (kind === "note") setCellNote(f.destination, corner, { text: "Reserved" });
      if (kind === "merged")
        f.destination.mergedCells = [{ start: corner, end: { row: 15, column: 5 } }];
      if (kind === "pivot")
        executeWorkbookCommand(
          f.session,
          createSetPivotTableCommand(f.destination.id, {
            ...table,
            id: "other",
            name: "Other",
            anchor: corner,
          }),
        );
      const before = serializeWorkbook(f.workbook);
      expect(() =>
        executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, table)),
      ).toThrow();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
  test("rejects clearing into a newly occupied reserved area atomically", () => {
    const f = fixture();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    setCellContent(f.destination, { row: 15, column: 4 }, { kind: "literal", value: "Keep" });
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, empty(f.destination.pivotTables![0]!)),
      ),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("still lists configured row fields when values are absent", () => {
    const f = fixture();
    expect(buildPivotResult(f.workbook, { ...empty(f.table), rowFields: [0] }).matrix).toEqual([
      ["Region"],
      ["East"],
      ["West"],
    ]);
  });
});
