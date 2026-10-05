import { describe, expect, test } from "vitest";
import {
  createSetPivotTableCommand,
  createPivotSheetCommand,
  createRemovePivotTableCommand,
} from "../../commands/pivot-tables.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import {
  getCellContent,
  getCellValue,
  setCellContent,
  createSheetEvaluator,
} from "../../workbook.js";
import { getSheetChartData } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { fixture } from "./fixture.js";

describe("pivot commands", () => {
  test("writes genuine styled cells and a pivot chart in one reversible action", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.table, { chartId: "pivot-chart" }),
    );
    expect(f.destination.pivotTables).toHaveLength(1);
    expect(f.destination.pivotTables![0]!.outputRange).toEqual({
      start: { row: 2, column: 2 },
      end: { row: 5, column: 5 },
    });
    expect(getCellValue(f.destination, { row: 3, column: 3 })).toBe(30);
    const drawing = f.destination.drawings![0] as SheetChartDrawing;
    expect(drawing.chart.pivotTableId).toBe(f.table.id);
    expect(
      getSheetChartData(f.destination, drawing.chart, createSheetEvaluator(f.destination)),
    ).toMatchObject({
      categories: ["East", "West"],
      series: [
        { name: "Q1 / Amount", values: [30, 40] },
        { name: "Q2 / Amount", values: [30, 0] },
      ],
    });
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(getCellValue(f.destination, { row: 3, column: 3 })).toBe(30);
  });
  test("rejects conflicting destinations without mutating output, charts, or definitions", () => {
    const f = fixture();
    setCellContent(f.destination, f.table.anchor, { kind: "literal", value: "Reserved" });
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, f.table, { chartId: "chart" }),
      ),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.table, { overwrite: true }),
    );
    expect(getCellValue(f.destination, f.table.anchor)).toBe("Region");
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("plans refresh expansion atomically and requires overwrite for new occupied cells", () => {
    const f = fixture();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    ["North", "Q1", 50, 6].forEach((value, column) =>
      setCellContent(f.source, { row: 5, column }, { kind: "literal", value }),
    );
    const expanded = {
      ...f.destination.pivotTables![0]!,
      source: { start: { row: 0, column: 0 }, end: { row: 5, column: 3 } },
    };
    setCellContent(f.destination, { row: 6, column: 2 }, { kind: "literal", value: "Blocker" });
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, expanded)),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, expanded, { overwrite: true }),
    );
    expect(f.destination.pivotTables![0]!.outputRange!.end.row).toBe(6);
    expect(getCellValue(f.destination, { row: 5, column: 2 })).toBe("North");
    expect(getCellValue(f.destination, { row: 6, column: 5 })).toBe(150);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("clears obsolete output cells when a refresh shrinks its groups", () => {
    const f = fixture();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const filtered = {
      ...f.destination.pivotTables![0]!,
      filters: [{ field: 0, values: ["East"] }],
    };
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, filtered));
    expect(f.destination.pivotTables![0]!.outputRange!.end.row).toBe(4);
    expect(getCellContent(f.destination, { row: 5, column: 2 })).toBeNull();
    undoWorkbookCommand(f.session);
    expect(getCellValue(f.destination, { row: 5, column: 2 })).toBe("Grand Total");
  });
  test("creates a populated new sheet and removes it completely on undo", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createPivotSheetCommand(f.workbook, f.table, {
        id: "new-pivot",
        name: "New Pivot",
        chartId: "new-chart",
      }),
    );
    const sheet = f.workbook.sheets.get("new-pivot")!;
    expect(sheet.pivotTables).toHaveLength(1);
    expect(sheet.drawings).toHaveLength(1);
    expect(getCellValue(sheet, { row: 3, column: 3 })).toBe(30);
    undoWorkbookCommand(f.session);
    expect(f.workbook.sheets.has("new-pivot")).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("blocks creation on protected sheets and permits only authorized existing refreshes", () => {
    const f = fixture();
    f.destination.properties.protected = true;
    f.destination.protection = { pivotTables: true, editableRanges: [] };
    expect(() =>
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table)),
    ).toThrow();
    f.destination.properties.protected = false;
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    f.destination.properties.protected = true;
    f.destination.protection = { editableRanges: [] };
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table)),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    f.destination.protection = { pivotTables: true, editableRanges: [] };
    expect(() =>
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table)),
    ).not.toThrow();
  });
  test("removes a definition while preserving values and detaching its chart, with undo", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.table, { chartId: "chart" }),
    );
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createRemovePivotTableCommand(f.destination.id, f.table.id));
    expect(f.destination.pivotTables).toEqual([]);
    expect(getCellValue(f.destination, { row: 3, column: 3 })).toBe(30);
    expect((f.destination.drawings![0] as SheetChartDrawing).chart.pivotTableId).toBeUndefined();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("rejects merged output and source-overlapping destinations atomically", () => {
    const f = fixture();
    f.destination.mergedCells = [{ start: { row: 2, column: 2 }, end: { row: 2, column: 3 } }];
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table)),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(
          f.source.id,
          { ...f.table, anchor: { row: 0, column: 0 } },
          { overwrite: true },
        ),
      ),
    ).toThrow();
  });
});
