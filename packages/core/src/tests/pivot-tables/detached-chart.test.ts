import { describe, expect, test } from "vitest";
import {
  createRemovePivotTableCommand,
  createSetPivotTableCommand,
} from "../../commands/pivot-tables.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { getSheetChartData, normalizeSheetChart, type ChartData } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { createSheetEvaluator, setCellContent } from "../../workbook.js";
import {
  deserializeWorkbook,
  serializeWorkbook,
  deserializeSheet,
  serializeSheet,
} from "../../serialization.js";
import { fixture } from "./fixture.js";

const currency = { kind: "currency", currency: "USD", fractionDigits: 2 } as const;
function installed() {
  const f = fixture();
  executeWorkbookCommand(
    f.session,
    createSetPivotTableCommand(
      f.destination.id,
      {
        ...f.table,
        rowFields: [0, 1],
        columnFields: [],
        values: [{ ...f.table.values[0]!, numberFormat: currency }],
        presentation: {
          layout: "outline",
          subtotals: "bottom",
          repeatLabels: false,
          blankRows: true,
          rowHeaders: true,
          columnHeaders: true,
          bandedRows: true,
          bandedColumns: false,
        },
      },
      { chartId: "retained-chart" },
    ),
  );
  const drawing = () => f.destination.drawings![0] as SheetChartDrawing;
  const read = () =>
    getSheetChartData(f.destination, drawing().chart, createSheetEvaluator(f.destination));
  return { ...f, drawing, read };
}

describe("retained charts after removing a pivot report", () => {
  test.each([false, true])(
    "detaches an exact formatted leaf-data view with clearOutput=%s and restores it through history",
    (clearOutput) => {
      const f = installed();
      const chartData = f.read();
      expect(chartData.categories).toEqual(["East / Q1", "East / Q2", "West / Q1"]);
      expect(chartData.series).toEqual([
        { name: "Amount", values: [30, 30, 40], numberFormat: currency },
      ]);
      expect(chartData.records).toEqual([
        ["East / Q1", 30],
        ["East / Q2", 30],
        ["West / Q1", 40],
      ]);
      const before = serializeWorkbook(f.workbook);
      executeWorkbookCommand(
        f.session,
        createRemovePivotTableCommand(f.destination.id, f.table.id, clearOutput),
      );
      expect(f.destination.pivotTables ?? []).toEqual([]);
      expect(f.drawing().chart.pivotTableId).toBeUndefined();
      expect(f.drawing().chart.dataCache).toEqual(chartData);
      expect(f.read()).toEqual(chartData);
      const after = serializeWorkbook(f.workbook);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.read()).toEqual(chartData);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(after);
      expect(f.read()).toEqual(chartData);
    },
  );

  test("retained charts ignore later source and output-cell edits", () => {
    const f = installed();
    const before = f.read();
    executeWorkbookCommand(
      f.session,
      createRemovePivotTableCommand(f.destination.id, f.table.id, false),
    );
    setCellContent(f.source, { row: 1, column: 2 }, { kind: "literal", value: 999 });
    for (let row = 2; row < 15; row++) {
      setCellContent(f.destination, { row, column: 2 }, { kind: "literal", value: "Changed" });
      setCellContent(f.destination, { row, column: 4 }, { kind: "literal", value: 999 });
    }
    expect(f.read()).toEqual(before);
  });

  test("round trips the retained view in V42 and rejects its drawing cache under V41", () => {
    const f = installed();
    executeWorkbookCommand(
      f.session,
      createRemovePivotTableCommand(f.destination.id, f.table.id, true),
    );
    const before = f.read();
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(42);
    const restored = deserializeWorkbook(snapshot);
    expect(serializeWorkbook(restored)).toEqual(snapshot);
    const sheet = restored.sheets.get(f.destination.id)!;
    const drawing = sheet.drawings![0] as SheetChartDrawing;
    expect(getSheetChartData(sheet, drawing.chart, createSheetEvaluator(sheet))).toEqual(before);
    expect(() => deserializeWorkbook({ ...snapshot, version: 41 })).toThrow();
  });

  test("infers V42 for a standalone retained drawing without pivot metadata or a source range", () => {
    const f = installed();
    executeWorkbookCommand(
      f.session,
      createRemovePivotTableCommand(f.destination.id, f.table.id, true),
    );
    const expected = f.read();
    f.drawing().chart.range = null;
    const serialized = serializeSheet(f.destination);
    const { pivotTables: _pivots, filter: _filter, ...standalone } = serialized;
    const restored = deserializeSheet(standalone);
    const drawing = restored.drawings![0] as SheetChartDrawing;
    expect(drawing.chart.range).toBeNull();
    expect(drawing.chart.pivotTableId).toBeUndefined();
    expect(drawing.chart.dataCache).toEqual(expected);
    expect(getSheetChartData(restored, drawing.chart, createSheetEvaluator(restored))).toEqual(
      expected,
    );
    expect(serializeSheet(deserializeSheet(serializeSheet(restored)))).toEqual(
      serializeSheet(restored),
    );
  });

  test("normalization and chart reads clone cache arrays and nested formats", () => {
    const f = installed();
    executeWorkbookCommand(f.session, createRemovePivotTableCommand(f.destination.id, f.table.id));
    const before = f.read();
    const normalized = normalizeSheetChart(f.drawing().chart);
    normalized.dataCache!.categories[0] = "Changed";
    normalized.dataCache!.series[0]!.values[0] = 999;
    normalized.dataCache!.records[0]![1] = 999;
    const format = normalized.dataCache!.series[0]!.numberFormat!;
    if (format.kind === "currency") format.currency = "EUR";
    expect(f.read()).toEqual(before);
    const read = f.read();
    read.categories[0] = "Changed again";
    read.series[0]!.values[0] = 1000;
    read.records[0]![0] = "Changed record";
    expect(f.read()).toEqual(before);
  });

  test.each([
    { categories: ["A"], series: [{ name: "Bad", values: [Number.NaN] }], records: [["A", 1]] },
    {
      categories: ["A"],
      series: [{ name: "Bad", values: [Number.POSITIVE_INFINITY] }],
      records: [["A", 1]],
    },
    {
      categories: ["x".repeat(32768)],
      series: [{ name: "Bad", values: [1] }],
      records: [["A", 1]],
    },
  ] as ChartData[])(
    "rejects invalid retained cache %# without changing the workbook",
    (dataCache) => {
      const f = installed();
      const before = serializeWorkbook(f.workbook);
      expect(() =>
        executeWorkbookCommand(
          f.session,
          createSetSheetDrawingsCommand(f.destination.id, [
            {
              ...f.drawing(),
              chart: { ...f.drawing().chart, pivotTableId: undefined, dataCache },
            },
          ]),
        ),
      ).toThrow();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
});
