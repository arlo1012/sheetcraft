import { describe, expect, test } from "vitest";
import {
  buildPivotResult,
  getPivotDetails,
  normalizePivotTable,
  type SheetPivotTable,
} from "../../pivot-tables.js";
import {
  createPivotDetailsSheetCommand,
  createSetPivotTableCommand,
} from "../../commands/pivot-tables.js";
import { createInsertSheetAxisCommand, createSetCellContentCommand } from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { createFormulaError } from "../../formula/types.js";
import {
  getCellContent,
  getCellValue,
  getCellStyle,
  setCellContent,
  setCellStyle,
  type CellAddress,
} from "../../workbook.js";
import { fixture, records } from "./fixture.js";

function installed(patch: Partial<SheetPivotTable> = {}) {
  const f = fixture();
  executeWorkbookCommand(
    f.session,
    createSetPivotTableCommand(f.destination.id, { ...f.table, ...patch }),
  );
  return { ...f, current: () => f.destination.pivotTables![0]! };
}
function address(table: SheetPivotTable, row: number, column: number): CellAddress {
  return { row: table.anchor.row + row, column: table.anchor.column + column };
}

describe("pivot cached record details", () => {
  test("returns all original source columns for a leaf intersection, row total, column total, and grand total", () => {
    const f = installed();
    const table = f.current();
    expect(getPivotDetails(f.workbook, table, address(table, 1, 1))).toEqual({
      headers: records[0],
      records: records.slice(1, 3),
    });
    expect(getPivotDetails(f.workbook, table, address(table, 1, 3)).records).toEqual(
      records.slice(1, 4),
    );
    expect(getPivotDetails(f.workbook, table, address(table, 3, 1)).records).toEqual([
      records[1],
      records[2],
      records[4],
    ]);
    expect(getPivotDetails(f.workbook, table, address(table, 3, 3)).records).toEqual(
      records.slice(1),
    );
    expect(getPivotDetails(f.workbook, table, address(table, 2, 2)).records).toEqual([]);
  });

  test("uses the refresh cache after source edits until the next refresh", () => {
    const f = installed();
    const table = f.current();
    const previousMatrix = buildPivotResult(f.workbook, table, { useCache: true }).matrix;
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        f.source.id,
        { row: 1, column: 2 },
        { kind: "literal", value: 1000 },
      ),
    );
    expect(buildPivotResult(f.workbook, table, { useCache: true }).matrix).toEqual(previousMatrix);
    expect(buildPivotResult(f.workbook, table).matrix[1]![1]).toBe(1020);
    expect(getPivotDetails(f.workbook, table, address(table, 1, 1)).records).toEqual(
      records.slice(1, 3),
    );
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, table));
    expect(
      getPivotDetails(f.workbook, f.current(), address(f.current(), 1, 1)).records.map(
        (row) => row[2],
      ),
    ).toEqual([1000, 20]);
  });

  test("applies page selections and row/column label and aggregate filters to details", () => {
    const f = installed({
      filters: [{ field: 3, values: [2, 3, 5] }],
      axisFilters: [
        {
          axis: "rows",
          field: 0,
          values: ["East", "West"],
          valueCondition: {
            measure: 0,
            condition: { kind: "number", operator: "greaterThan", value: 35 },
          },
        },
        {
          axis: "columns",
          field: 1,
          labelCondition: { kind: "text", operator: "equals", value: "Q1" },
        },
      ],
    });
    const table = f.current();
    const result = buildPivotResult(f.workbook, table, { useCache: true });
    expect(result.rowLabels).toEqual(["West"]);
    expect(
      getPivotDetails(f.workbook, table, address(table, result.totalRow!, result.totalColumnStart!))
        .records,
    ).toEqual([records[4]]);
  });

  test.each(["compact", "outline", "tabular"] as const)(
    "matches %s hierarchy subtotals without relying on repeated displayed labels",
    (layout) => {
      const f = fixture([
        ["Region", "Team", "Amount"],
        ["East", "A", 10],
        ["East", "A", 20],
        ["East", "B", 30],
        ["West", "A", 40],
      ]);
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, {
          ...f.table,
          rowFields: [0, 1],
          columnFields: [],
          presentation: {
            layout,
            subtotals: "bottom",
            repeatLabels: false,
            blankRows: true,
            rowHeaders: true,
            columnHeaders: true,
            bandedRows: false,
            bandedColumns: false,
          },
        }),
      );
      const table = f.destination.pivotTables![0]!;
      const result = buildPivotResult(f.workbook, table, { useCache: true });
      const details = getPivotDetails(
        f.workbook,
        table,
        address(table, result.subtotalRows[0]!, result.rowLabelColumns),
      );
      expect(details.records).toEqual([
        ["East", "A", 10],
        ["East", "A", 20],
        ["East", "B", 30],
      ]);
      const secondLeaf = getPivotDetails(
        f.workbook,
        table,
        address(table, result.dataRows[1]!, result.rowLabelColumns),
      );
      expect(secondLeaf.records).toEqual([["East", "B", 30]]);
    },
  );

  test("copies cached error and computed formula values into one reversible literal details sheet", () => {
    const f = fixture();
    setCellContent(
      f.source,
      { row: 1, column: 2 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    setCellContent(
      f.source,
      { row: 2, column: 2 },
      { kind: "formula", formula: { source: "=2+3" } },
    );
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const table = f.destination.pivotTables![0]!;
    const result = buildPivotResult(f.workbook, table, { useCache: true });
    const before = serializeWorkbook(f.workbook);
    const undoCount = f.session.history.undoStack.length;
    const command = createPivotDetailsSheetCommand(
      f.workbook,
      f.destination.id,
      table.id,
      address(table, result.totalRow!, result.totalColumnStart!),
      { id: "details", name: "Sales details" },
    );
    expect(command.type).toBe("addSheet");
    expect(executeWorkbookCommand(f.session, command)).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(undoCount + 1);
    const sheet = f.workbook.sheets.get("details")!;
    expect(sheet.name).toBe("Sales details");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("Region");
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({
      kind: "error",
      error: createFormulaError("DIV0"),
    });
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({ kind: "literal", value: 5 });
    expect(getCellValue(sheet, { row: 4, column: 0 })).toBe("West");
    const after = serializeWorkbook(f.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });

  test("keeps cached date and currency values literal while copying current source field formats", () => {
    const f = fixture(
      [
        ["Region", "Quarter", "Amount", "Units", "Date", "Text"],
        ["East", "Q1", 12.5, 2, 45366, "=1+1"],
        ["East", "Q1", 25, 3, 45367, "unchanged"],
      ],
      { row: 4, column: 3 },
    );
    setCellContent(
      f.source,
      { row: 6, column: 5 },
      {
        kind: "formula",
        formula: { source: "=2+3" },
      },
    );
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const currency = { kind: "currency", currency: "USD", fractionDigits: 2 } as const;
    const date = { kind: "date", code: "yyyy/mm/dd" } as const;
    // Formats are read when extracting; cached record values stay as last refreshed.
    setCellStyle(f.source, { row: 5, column: 5 }, { numberFormat: currency });
    setCellStyle(f.source, { row: 5, column: 7 }, { numberFormat: date });
    setCellStyle(f.source, { row: 5, column: 8 }, { numberFormat: currency });
    setCellContent(f.source, { row: 5, column: 7 }, { kind: "literal", value: 50000 });
    const table = f.destination.pivotTables![0]!;
    executeWorkbookCommand(
      f.session,
      createPivotDetailsSheetCommand(f.workbook, f.destination.id, table.id, address(table, 1, 1), {
        id: "formatted-details",
      }),
    );
    const sheet = f.workbook.sheets.get("formatted-details")!;
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({ kind: "literal", value: 12.5 });
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({ kind: "literal", value: 5 });
    expect(getCellStyle(sheet, { row: 1, column: 2 })?.numberFormat).toEqual(currency);
    expect(getCellStyle(sheet, { row: 2, column: 2 })?.numberFormat).toEqual(currency);
    expect(getCellContent(sheet, { row: 1, column: 4 })).toEqual({ kind: "literal", value: 45366 });
    expect(getCellContent(sheet, { row: 2, column: 4 })).toEqual({ kind: "literal", value: 45367 });
    expect(getCellStyle(sheet, { row: 1, column: 4 })?.numberFormat).toEqual(date);
    expect(getCellStyle(sheet, { row: 2, column: 4 })?.numberFormat).toEqual(date);
    expect(getCellContent(sheet, { row: 1, column: 5 })).toEqual({
      kind: "literal",
      value: "=1+1",
    });
    expect(getCellStyle(sheet, { row: 1, column: 5 })?.numberFormat).toBeUndefined();
  });

  test.each([
    { row: 0, column: 1 },
    { row: 1, column: 0 },
    { row: -1, column: 1 },
    { row: 100, column: 100 },
  ])("rejects headers, labels, and outside addresses %# without creating a sheet", (offset) => {
    const f = installed();
    const table = f.current();
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      getPivotDetails(f.workbook, table, address(table, offset.row, offset.column)),
    ).toThrow(RangeError);
    expect(() =>
      createPivotDetailsSheetCommand(
        f.workbook,
        f.destination.id,
        table.id,
        address(table, offset.row, offset.column),
        { id: "invalid-details" },
      ),
    ).toThrow(RangeError);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("requires a refresh cache and clones cached records deeply", () => {
    const f = installed();
    const table = f.current();
    const uncached = { ...table, dataCache: undefined };
    expect(() => getPivotDetails(f.workbook, uncached, address(table, 1, 1))).toThrow(RangeError);
    const clone = normalizePivotTable(table);
    clone.dataCache!.headers[0] = "Changed";
    clone.dataCache!.records[0]![0] = "Changed";
    expect(table.dataCache!.headers[0]).toBe("Region");
    expect(table.dataCache!.records[0]![0]).toBe("East");
  });

  test("persists cached details in V39 and rejects a cache smuggled into a V38 snapshot", () => {
    const f = installed();
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(40);
    const restored = deserializeWorkbook(snapshot);
    expect(serializeWorkbook(restored)).toEqual(snapshot);
    const table = restored.sheets.get(f.destination.id)!.pivotTables![0]!;
    expect(getPivotDetails(restored, table, address(table, 1, 1)).records).toEqual(
      records.slice(1, 3),
    );
    expect(() => deserializeWorkbook({ ...snapshot, version: 38 })).toThrow();
  });

  test("invalidates a cache after source column schema changes and restores it on undo", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, "column", 1, 1));
    expect(f.current().dataCache).toBeUndefined();
    expect(() => getPivotDetails(f.workbook, f.current(), address(f.current(), 1, 1))).toThrow(
      RangeError,
    );
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
});
