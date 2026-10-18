// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { ChartSeriesSource } from "@sheetcraft/core/chart-source";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing, SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createSheet,
  createSheetEvaluator,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import {
  assertChartPrintConsumer,
  capturePrintChartPass,
  ChartPrintUnavailableError,
  getPrintableChartRoots,
  getPrintChartContentExtent,
} from "../../../modules/page-layout/page-print-charts";

function seriesSource(): ChartSeriesSource {
  return {
    kind: "series",
    categories: { kind: "generated" },
    series: [
      {
        id: "stable-late",
        colorIndex: 7,
        name: { kind: "literal", text: "Later" },
        values: { kind: "literal", values: [1, 0, -3] },
      },
      {
        id: "stable-early",
        colorIndex: 2,
        name: { kind: "literal", text: "Earlier" },
        values: { kind: "literal", values: [4, 5, 6] },
      },
    ],
  };
}

function chart(id = "chart", changes: Partial<SheetChart> = {}): SheetChartDrawing {
  return {
    id,
    name: "Chart",
    kind: "chart",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 192,
    height: 48,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 0,
    color: "#000000",
    fontSize: 11,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: null,
      source: seriesSource(),
      title: "Sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      ...changes,
    },
  };
}

function cachedChart(id: string, dataCache: ChartData): SheetChartDrawing {
  const drawing = chart(id, { dataCache });
  delete drawing.chart.source;
  return drawing;
}

function fixture(drawings: Sheet["drawings"] = [chart()]) {
  const sheet = createSheet("Chart print", "sheet");
  sheet.drawings = drawings;
  const evaluator = createSheetEvaluator(sheet);
  const metrics = createPictureSheetMetrics(sheet);
  const capture = () => capturePrintChartPass({ sheet, metrics, evaluator, revision: 17 });
  return { sheet, metrics, evaluator, capture };
}

function vector(column: number, length = 3): CellRange {
  return { start: { row: 1, column }, end: { row: length, column } };
}

function rangeChart(sheetId: string): SheetChartDrawing {
  return chart("live", {
    source: {
      kind: "series",
      categories: { kind: "range", sheetId, range: vector(0) },
      series: [
        {
          id: "live-series",
          colorIndex: 6,
          name: { kind: "cell", sheetId, cell: { row: 0, column: 1 } },
          values: { kind: "range", sheetId, range: vector(1) },
        },
      ],
    },
  });
}

function populate(sheet: Sheet) {
  [
    ["Region", "Revenue"],
    ["East", 10],
    ["West", 0],
    ["North", -2],
  ].forEach((row, rowIndex) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: rowIndex, column }, { kind: "literal", value }),
    ),
  );
}

test("Combo print capture retains detached physical series bands and dormant routing", () => {
  const root = chart("combo", {
    type: "combo",
    range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
    rectangleSeries: { rows: [], columns: [{ index: 1, id: "revenue" }] },
    format: { series: [{ id: "revenue", drawType: "line", axis: "secondary", markers: false }] },
  });
  delete root.chart.source;
  const f = fixture([root]);
  populate(f.sheet);
  const before = JSON.stringify(root),
    pass = f.capture();
  expect(pass.entries[0]?.data.series[0]).toMatchObject({
    id: "revenue",
    rangeBand: { seriesBy: "columns", index: 1 },
    values: [10, 0, -2],
  });
  expect(Object.isFrozen(pass.entries[0]?.data.series[0]?.rangeBand)).toBe(true);
  expect(pass.entries[0]?.drawing.chart.format).toEqual(root.chart.format);
  expect(JSON.stringify(root)).toBe(before);
  pass.assertCurrent();
});

function crossSheetFixture() {
  const workbook = createWorkbook({ id: "print", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const source = createSheet("Source", "source");
  workbook.sheets.set(source.id, source);
  populate(source);
  sheet.drawings = [rangeChart(source.id)];
  const metrics = createPictureSheetMetrics(sheet);
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  const resolveSheet = (id: string) => workbook.sheets.get(id);
  const capture = () => capturePrintChartPass({ sheet, metrics, evaluator, resolveSheet });
  return { workbook, sheet, source, metrics, evaluator, resolveSheet, capture };
}

test("an empty chart pass does not retain or scan worksheet cells", () => {
  const f = fixture([]);
  const cells = vi.spyOn(f.sheet.cells, Symbol.iterator).mockImplementation(() => {
    throw new Error("Chart snapshots must not walk empty-chart sheet cells");
  });
  const pass = f.capture();
  pass.assertCurrent();
  expect(pass.entries).toHaveLength(0);
  expect(cells).not.toHaveBeenCalled();
});

describe("validated Chart print capture", () => {
  test("retains real owners, complete drawing order, stable IDs and palette positions", () => {
    const first = chart("first"),
      second = chart("second");
    const { chart: _chart, ...shapeBase } = chart("shape");
    const shape: SheetDrawing = { ...shapeBase, kind: "shape" };
    const f = fixture([shape, first, second]);
    const before = JSON.stringify(f.sheet.drawings);
    const pass = f.capture();
    expect(getPrintableChartRoots(f.sheet)).toEqual([first, second]);
    expect(pass.entries.map(({ order }) => order)).toEqual([1, 2]);
    expect(pass.entries[0]!.sourceRoot).toBe(first);
    expect(pass.entries[0]!.drawing).not.toBe(first);
    expect(pass.entries[0]!.drawing.chart.source).not.toBe(first.chart.source);
    expect(pass.entries[0]!.data).toEqual({
      categories: ["1", "2", "3"],
      series: [
        { id: "stable-late", colorIndex: 7, name: "Later", values: [1, 0, -3] },
        { id: "stable-early", colorIndex: 2, name: "Earlier", values: [4, 5, 6] },
      ],
      records: [
        ["1", 1, 4],
        ["2", 0, 5],
        ["3", -3, 6],
      ],
    });
    expect(pass.revision).toBe(17);
    expect(pass.key).toBe(f.capture().key);
    expect(() => pass.assertCurrent()).not.toThrow();
    expect(JSON.stringify(f.sheet.drawings)).toBe(before);
    expect(Object.isFrozen(first)).toBe(false);
  });

  test("print consumer gate remains explicit even for valid empty-series charts", () => {
    const drawing = chart("empty", {
      source: { kind: "series", categories: { kind: "generated" }, series: [] },
    });
    const f = fixture([drawing]);
    expect(f.capture().entries[0]!.data).toEqual({ categories: [], series: [], records: [] });
    expect(() => assertChartPrintConsumer(f.sheet)).toThrow(ChartPrintUnavailableError);
    expect(() => assertChartPrintConsumer(f.sheet, true)).not.toThrow();
    expect(() => assertChartPrintConsumer(createSheet("No charts", "no-charts"))).not.toThrow();
  });

  test("accepts a valid static cache with null gaps and preserves its numeric format", () => {
    const cache: ChartData = {
      categories: ["A", "B"],
      series: [{ name: "Rate", values: [0, null], numberFormat: { kind: "custom", code: "0%" } }],
      records: [
        ["A", 0],
        ["B", null],
      ],
    };
    const pass = fixture([cachedChart("cached", cache)]).capture();
    expect(pass.entries[0]!.data).toEqual(cache);
    expect(pass.entries[0]!.data.series[0]!.values).not.toBe(cache.series[0]!.values);
    expect(pass.entries[0]!.data.series[0]!.numberFormat).not.toBe(cache.series[0]!.numberFormat);
  });

  test("captures a live rectangular source without inventing explicit-series identity", () => {
    const drawing = chart("rectangular", {
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
    });
    delete drawing.chart.source;
    const f = fixture([drawing]);
    populate(f.sheet);
    const pass = f.capture();
    expect(pass.entries[0]!.data).toEqual({
      categories: ["East", "West", "North"],
      series: [
        { name: "Revenue", values: [10, 0, -2], rangeBand: { seriesBy: "columns", index: 1 } },
      ],
      records: [
        ["East", 10],
        ["West", 0],
        ["North", -2],
      ],
    });
    expect(pass.entries[0]!.data.series[0]?.id).toBeUndefined();
    expect(pass.entries[0]!.drawing.chart.range).toEqual(drawing.chart.range);
    expect(pass.entries[0]!.drawing.chart.range).not.toBe(drawing.chart.range);
    expect(pass.entries[0]!.drawing.chart.source).toBeUndefined();
  });

  test("keeps text, blank and formula-error diagnostics without turning missing values into zero", () => {
    const drawing = rangeChart("sheet"),
      f = fixture([drawing]);
    populate(f.sheet);
    setCellContent(f.sheet, { row: 1, column: 1 }, { kind: "literal", value: "10" });
    setCellContent(f.sheet, { row: 2, column: 1 }, null);
    setCellContent(
      f.sheet,
      { row: 3, column: 1 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    const pass = f.capture();
    expect(pass.entries[0]!.data.series[0]).toMatchObject({
      id: "live-series",
      colorIndex: 6,
      values: [null, null, null],
    });
    expect(pass.entries[0]!.data.diagnostics).toEqual([
      { code: "text", role: "values", seriesId: "live-series", index: 0 },
      { code: "blank", role: "values", seriesId: "live-series", index: 1 },
      { code: "error", role: "values", seriesId: "live-series", index: 2 },
    ]);
  });

  test("a detached print payload cannot be silently changed after validation", () => {
    const f = fixture(),
      pass = f.capture(),
      entry = pass.entries[0]!;
    const before = JSON.stringify(f.sheet.drawings);
    expect(Object.isFrozen(pass)).toBe(true);
    expect(Object.isFrozen(pass.entries)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.drawing)).toBe(true);
    expect(Object.isFrozen(entry.drawing.chart.source!.series)).toBe(true);
    expect(Object.isFrozen(entry.data)).toBe(true);
    expect(Object.isFrozen(entry.data.series[0]!.values)).toBe(true);
    expect(Object.isFrozen(entry.data.records[0])).toBe(true);
    for (const mutate of [
      () => {
        entry.data.series[0]!.values[0] = 999;
      },
      () => {
        entry.drawing.chart.title = "Injected title";
      },
    ]) {
      try {
        mutate();
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
      }
    }
    if (entry.data.series[0]!.values[0] === 999 || entry.drawing.chart.title === "Injected title")
      expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
    else expect(() => pass.assertCurrent()).not.toThrow();
    expect(JSON.stringify(f.sheet.drawings)).toBe(before);
  });
});

describe("stale Chart sources and owners", () => {
  test.each([
    [
      "literal values",
      (drawing: SheetChartDrawing) => {
        const values = drawing.chart.source!.series[0]!.values;
        if (values.kind === "literal") values.values[0] = 20;
      },
    ],
    [
      "series identity",
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[0]!.id = "replaced-id";
      },
    ],
    [
      "palette slot",
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[0]!.colorIndex = 9;
      },
    ],
    [
      "title",
      (drawing: SheetChartDrawing) => {
        drawing.chart.title = "New title";
      },
    ],
    [
      "size",
      (drawing: SheetChartDrawing) => {
        drawing.width += 1;
      },
    ],
    [
      "rotation",
      (drawing: SheetChartDrawing) => {
        drawing.rotation = 15;
      },
    ],
  ])("rejects a later change to %s", (_name, mutate) => {
    const drawing = chart(),
      f = fixture([drawing]),
      pass = f.capture();
    mutate(drawing);
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
    expect(() => getPrintChartContentExtent(pass, f.metrics)).toThrow(ChartPrintUnavailableError);
  });

  test.each([
    [
      "replace the forest",
      (sheet: Sheet) => {
        sheet.drawings = [...sheet.drawings!];
      },
    ],
    [
      "replace an equal chart owner",
      (sheet: Sheet) => {
        sheet.drawings![0] = structuredClone(sheet.drawings![0]!);
      },
    ],
    [
      "reorder chart owners",
      (sheet: Sheet) => {
        sheet.drawings!.reverse();
      },
    ],
    [
      "remove a chart owner",
      (sheet: Sheet) => {
        sheet.drawings!.splice(0, 1);
      },
    ],
    [
      "append a chart owner",
      (sheet: Sheet) => {
        sheet.drawings!.push(chart("third"));
      },
    ],
  ])("rejects owner edits that %s", (_name, mutate) => {
    const f = fixture([chart("first"), chart("second")]),
      pass = f.capture();
    mutate(f.sheet);
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
  });

  test("rejects a chart kind change on the same root identity", () => {
    const drawing = chart(),
      f = fixture([drawing]),
      pass = f.capture();
    Object.assign(drawing, { kind: "shape" });
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
  });

  test.each([
    [
      "row size",
      (sheet: Sheet) => {
        sheet.rowHeights.set(50, 40);
      },
    ],
    [
      "column size",
      (sheet: Sheet) => {
        sheet.columnWidths.set(50, 120);
      },
    ],
    [
      "default column width",
      (sheet: Sheet) => {
        sheet.defaultColumnWidth = 88;
      },
    ],
    [
      "default row height",
      (sheet: Sheet) => {
        sheet.defaultRowHeight = 20;
      },
    ],
    [
      "hidden row in place",
      (sheet: Sheet) => {
        sheet.hiddenRows!.add(0);
      },
    ],
    [
      "hidden column in place",
      (sheet: Sheet) => {
        sheet.hiddenColumns!.add(0);
      },
    ],
    [
      "hidden row set replacement",
      (sheet: Sheet) => {
        sheet.hiddenRows = new Set([0]);
      },
    ],
    [
      "hidden column set replacement",
      (sheet: Sheet) => {
        sheet.hiddenColumns = new Set([0]);
      },
    ],
  ])("rejects a worksheet geometry change to %s even for literal data", (_name, mutate) => {
    const f = fixture(),
      pass = f.capture();
    mutate(f.sheet);
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
  });

  test("detects cell edits despite the capture evaluator's memoized calculation cycle", () => {
    const drawing = rangeChart("sheet"),
      f = fixture([drawing]);
    populate(f.sheet);
    const pass = f.capture();
    expect(pass.entries[0]!.data.series[0]!.values[0]).toBe(10);
    setCellContent(f.sheet, { row: 1, column: 1 }, { kind: "literal", value: 99 });
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
    expect(pass.entries[0]!.data.series[0]!.values[0]).toBe(10);
  });

  test("detects evaluated value changes even when the persisted cells are unchanged", () => {
    const drawing = rangeChart("sheet"),
      f = fixture([drawing]);
    populate(f.sheet);
    let current = 10;
    const evaluator: SheetEvaluator = {
      getComputedValue: (address) =>
        address.row === 1 && address.column === 1
          ? current
          : createSheetEvaluator(f.sheet).getComputedValue(address),
    };
    const pass = capturePrintChartPass({ sheet: f.sheet, metrics: f.metrics, evaluator });
    current = 11;
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
  });

  test.each([
    [
      "replace the cell map",
      (sheet: Sheet) => {
        sheet.cells = new Map(sheet.cells);
      },
    ],
    [
      "add a cell",
      (sheet: Sheet) => {
        setCellContent(sheet, { row: 9, column: 9 }, { kind: "literal", value: 1 });
      },
    ],
    [
      "remove a cell",
      (sheet: Sheet) => {
        setCellContent(sheet, { row: 1, column: 1 }, null);
      },
    ],
  ])("guards the source calculation-cycle snapshot when edits %s", (_name, mutate) => {
    const f = fixture([rangeChart("sheet")]);
    populate(f.sheet);
    const pass = f.capture();
    mutate(f.sheet);
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
  });

  test("host calculation-cycle lease is checked before returning the initial pass", () => {
    const f = fixture();
    expect(() =>
      capturePrintChartPass({
        sheet: f.sheet,
        metrics: f.metrics,
        evaluator: f.evaluator,
        isCurrent: () => false,
      }),
    ).toThrow(ChartPrintUnavailableError);
  });

  test("detects cached data edits without mutating the captured cache", () => {
    const drawing = cachedChart("cache", {
      categories: ["A"],
      series: [{ name: "S", values: [1] }],
      records: [["A", 1]],
    });
    const f = fixture([drawing]),
      pass = f.capture();
    drawing.chart.dataCache!.series[0]!.values[0] = 2;
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
    expect(pass.entries[0]!.data.series[0]!.values).toEqual([1]);
  });
});

describe("cross-sheet Chart dependencies", () => {
  test("captures live names, categories and values from the resolved sheet", () => {
    const f = crossSheetFixture(),
      pass = f.capture();
    expect(pass.entries[0]!.data).toEqual({
      categories: ["East", "West", "North"],
      series: [{ id: "live-series", colorIndex: 6, name: "Revenue", values: [10, 0, -2] }],
      records: [
        ["East", 10],
        ["West", 0],
        ["North", -2],
      ],
    });
    expect(() => pass.assertCurrent()).not.toThrow();
  });

  test("unavailable cross-sheet resolution fails closed rather than yielding an empty chart", () => {
    const f = crossSheetFixture();
    expect(() =>
      capturePrintChartPass({ sheet: f.sheet, metrics: f.metrics, evaluator: f.evaluator }),
    ).toThrow(ChartPrintUnavailableError);
    expect(() =>
      capturePrintChartPass({
        sheet: f.sheet,
        metrics: f.metrics,
        evaluator: f.evaluator,
        resolveSheet: () => f.sheet,
      }),
    ).toThrow(ChartPrintUnavailableError);
    expect(() =>
      capturePrintChartPass({
        sheet: f.sheet,
        metrics: f.metrics,
        evaluator: { getComputedValue: f.evaluator.getComputedValue },
        resolveSheet: f.resolveSheet,
      }),
    ).toThrow(ChartPrintUnavailableError);
  });

  test.each([
    ["value", { row: 1, column: 1 }, 77],
    ["category", { row: 1, column: 0 }, "Revised region"],
    ["series name", { row: 0, column: 1 }, "Revised measure"],
  ] as const)(
    "a later %s edit invalidates the captured cross-sheet data",
    (_role, address, value) => {
      const f = crossSheetFixture(),
        pass = f.capture();
      setCellContent(f.source, address, { kind: "literal", value });
      expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
    },
  );

  test("removing a referenced sheet invalidates the captured pass", () => {
    const f = crossSheetFixture(),
      pass = f.capture();
    f.workbook.sheets.delete(f.source.id);
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
  });

  test("replacing an equal referenced sheet rejects its new owner identity", () => {
    const f = crossSheetFixture(),
      pass = f.capture();
    f.workbook.sheets.set(f.source.id, { ...f.source });
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
  });

  test("the real host revision lease catches indirect formula dependencies outside direct chart references", () => {
    const f = crossSheetFixture(),
      driver = createSheet("Driver", "driver");
    f.workbook.sheets.set(driver.id, driver);
    setCellContent(driver, { row: 0, column: 0 }, { kind: "literal", value: 10 });
    setCellContent(
      f.source,
      { row: 1, column: 1 },
      { kind: "formula", formula: { source: "=Driver!A1" } },
    );
    let revision = 42;
    const capturedRevision = revision;
    const evaluator = createWorkbookEvaluator(f.workbook, f.sheet.id);
    const pass = capturePrintChartPass({
      sheet: f.sheet,
      metrics: f.metrics,
      evaluator,
      resolveSheet: f.resolveSheet,
      revision: capturedRevision,
      isCurrent: () => revision === capturedRevision,
    });
    expect(pass.entries[0]!.data.series[0]!.values[0]).toBe(10);
    expect(() => pass.assertCurrent()).not.toThrow();
    setCellContent(driver, { row: 0, column: 0 }, { kind: "literal", value: 30 });
    revision += 1;
    expect(evaluator.forSheet!(f.source.id).getComputedValue({ row: 1, column: 1 })).toBe(10);
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
    expect(() => getPrintChartContentExtent(pass, f.metrics)).toThrow(ChartPrintUnavailableError);
  });

  test("one cross-sheet hidden-axis mask retains stable source identity and colors", () => {
    const f = crossSheetFixture();
    f.source.hiddenRows!.add(2);
    const pass = f.capture();
    expect(pass.entries[0]!.data.categories).toEqual(["East", "North"]);
    expect(pass.entries[0]!.data.series).toEqual([
      { id: "live-series", colorIndex: 6, name: "Revenue", values: [10, -2] },
    ]);
    f.source.hiddenRows!.clear();
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
  });
});

describe("Chart layout and print content extent", () => {
  test("empty chart passes do not enlarge cell pagination", () => {
    const f = fixture([]),
      pass = f.capture();
    expect(pass.entries).toEqual([]);
    expect(getPrintChartContentExtent(pass, f.metrics)).toEqual({ rowCount: 0, columnCount: 0 });
  });

  test("chart-only placement includes free pixel offsets beyond cell boundaries", () => {
    const drawing = chart();
    Object.assign(drawing, { anchor: { row: 2, column: 3 }, offsetX: 5, offsetY: 7 });
    const f = fixture([drawing]),
      pass = f.capture();
    expect(pass.entries[0]!.rect).toEqual({ x: 293, y: 55, width: 192, height: 48 });
    expect(pass.entries[0]!.bounds).toEqual({ left: 293, top: 55, right: 485, bottom: 103 });
    expect(getPrintChartContentExtent(pass, f.metrics)).toEqual({ rowCount: 5, columnCount: 6 });
  });

  test.each([90, -90])("rotation %s uses the rotated visual bounds for pagination", (rotation) => {
    const drawing = chart();
    Object.assign(drawing, { anchor: { row: 10, column: 10 }, rotation });
    const f = fixture([drawing]),
      pass = f.capture(),
      entry = pass.entries[0]!;
    expect(entry.rotation).toBe(rotation === 90 ? 90 : 270);
    expect(entry.rect).toEqual({ x: 960, y: 240, width: 192, height: 48 });
    expect(entry.bounds.left).toBeCloseTo(1032);
    expect(entry.bounds.top).toBeCloseTo(168);
    expect(entry.bounds.right).toBeCloseTo(1080);
    expect(entry.bounds.bottom).toBeCloseTo(360);
    expect(getPrintChartContentExtent(pass, f.metrics)).toEqual({ rowCount: 15, columnCount: 12 });
  });

  test("a full-turn rotation shares the unrotated visual extent", () => {
    const drawing = chart();
    drawing.rotation = 360;
    const f = fixture([drawing]),
      pass = f.capture();
    expect(pass.entries[0]!.rotation).toBe(0);
    expect(getPrintChartContentExtent(pass, f.metrics)).toEqual({ rowCount: 2, columnCount: 2 });
  });

  test("hidden axes compress chart placement and extent without changing its stored owner", () => {
    const drawing = chart();
    Object.assign(drawing, { anchor: { row: 3, column: 3 }, width: 96, height: 24 });
    const f = fixture([drawing]);
    f.sheet.hiddenRows = new Set([0, 1]);
    f.sheet.hiddenColumns = new Set([0, 1]);
    const metrics = createPictureSheetMetrics(f.sheet);
    const before = JSON.stringify(drawing);
    const pass = capturePrintChartPass({ sheet: f.sheet, metrics, evaluator: f.evaluator });
    expect(pass.entries[0]!.rect).toEqual({ x: 96, y: 24, width: 96, height: 24 });
    expect(getPrintChartContentExtent(pass, metrics)).toEqual({ rowCount: 4, columnCount: 4 });
    expect(JSON.stringify(drawing)).toBe(before);
  });

  test("manual row and column sizes participate in placement and boundary counting", () => {
    const drawing = chart();
    Object.assign(drawing, { anchor: { row: 1, column: 1 }, width: 96, height: 24 });
    const f = fixture([drawing]);
    f.sheet.rowHeights.set(0, 40);
    f.sheet.columnWidths.set(0, 120);
    const metrics = createPictureSheetMetrics(f.sheet);
    const pass = capturePrintChartPass({ sheet: f.sheet, metrics, evaluator: f.evaluator });
    expect(pass.entries[0]!.rect).toEqual({ x: 120, y: 40, width: 96, height: 24 });
    expect(getPrintChartContentExtent(pass, metrics)).toEqual({ rowCount: 2, columnCount: 2 });
  });
});

describe("Chart print input and resource limits", () => {
  test.each([
    [
      "source-less",
      (drawing: SheetChartDrawing) => {
        delete drawing.chart.source;
      },
    ],
    [
      "missing PivotTable",
      (drawing: SheetChartDrawing) => {
        delete drawing.chart.source;
        drawing.chart.pivotTableId = "missing-pivot";
      },
    ],
    [
      "duplicate stable IDs",
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[1]!.id = drawing.chart.source!.series[0]!.id;
      },
    ],
    [
      "invalid palette index",
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[0]!.colorIndex = -1;
      },
    ],
    [
      "nonfinite literal values",
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[0]!.values = { kind: "literal", values: [Infinity] };
      },
    ],
    [
      "inconsistent vector lengths",
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[0]!.values = { kind: "literal", values: [1] };
      },
    ],
    [
      "deleted values reference",
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[0]!.values = { kind: "range", sheetId: "sheet", range: null };
      },
    ],
    [
      "deleted name reference",
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[0]!.name = { kind: "cell", sheetId: "sheet", cell: null };
      },
    ],
    [
      "zero size",
      (drawing: SheetChartDrawing) => {
        drawing.width = 0;
      },
    ],
    [
      "nonfinite rotation",
      (drawing: SheetChartDrawing) => {
        drawing.rotation = NaN;
      },
    ],
  ])("%s is an explicit Chart print failure with the actual owner ID", (_name, mutate) => {
    const drawing = chart("unavailable");
    mutate(drawing);
    const f = fixture([drawing]),
      before = JSON.stringify(drawing);
    expect(f.capture).toThrow(ChartPrintUnavailableError);
    try {
      f.capture();
    } catch (error) {
      expect(error).toBeInstanceOf(ChartPrintUnavailableError);
      expect((error as ChartPrintUnavailableError).drawingIds).toEqual(["unavailable"]);
      expect((error as Error).message).toMatch(/workbook is unchanged/i);
    }
    expect(JSON.stringify(drawing)).toBe(before);
  });

  test.each([NaN, Infinity, -Infinity])(
    "nonfinite cached data %s cannot enter a prepared pass",
    (value) => {
      const cache: ChartData = {
        categories: ["A"],
        series: [{ name: "S", values: [value] }],
        records: [["A", value]],
      };
      expect(fixture([cachedChart("invalid-cache", cache)]).capture).toThrow(
        ChartPrintUnavailableError,
      );
    },
  );

  test("missing or unequal cached vector lengths cannot masquerade as blank charts", () => {
    const cache: ChartData = {
      categories: ["A"],
      series: [{ name: "S", values: [] }],
      records: [],
    };
    expect(fixture([cachedChart("invalid-cache", cache)]).capture).toThrow(
      ChartPrintUnavailableError,
    );
  });

  test("rejects a sparse drawing forest instead of silently treating holes as printable emptiness", () => {
    const forest: SheetDrawing[] = [];
    forest.length = 1;
    expect(fixture(forest).capture).toThrow(ChartPrintUnavailableError);
  });

  test("duplicate real drawing IDs cannot enter a print ownership pass", () => {
    expect(fixture([chart("duplicate"), chart("duplicate")]).capture).toThrow(
      ChartPrintUnavailableError,
    );
  });

  test("rejects caller-owned forest methods without executing them", () => {
    const forest: SheetDrawing[] = [chart()];
    const filter = vi.fn(() => []);
    Object.defineProperty(forest, "filter", { value: filter });
    expect(fixture(forest).capture).toThrow(ChartPrintUnavailableError);
    expect(filter).not.toHaveBeenCalled();
  });

  test("rejects an accessor drawing kind without invoking it", () => {
    const drawing = chart(),
      getter = vi.fn(() => "chart");
    Object.defineProperty(drawing, "kind", { get: getter });
    expect(fixture([drawing]).capture).toThrow(ChartPrintUnavailableError);
    expect(getter).not.toHaveBeenCalled();
  });

  test("rejects an accessor chart payload without invoking it", () => {
    const drawing = chart(),
      payload = drawing.chart,
      getter = vi.fn(() => payload);
    Object.defineProperty(drawing, "chart", { get: getter });
    expect(fixture([drawing]).capture).toThrow(ChartPrintUnavailableError);
    expect(getter).not.toHaveBeenCalled();
  });

  test("rejects accessor source array entries without invoking them", () => {
    const drawing = chart(),
      series = drawing.chart.source!.series,
      entry = series[0]!,
      getter = vi.fn(() => entry);
    Object.defineProperty(series, "0", { get: getter });
    expect(fixture([drawing]).capture).toThrow(ChartPrintUnavailableError);
    expect(getter).not.toHaveBeenCalled();
  });

  test("rejects accessor source fields without invoking them", () => {
    const drawing = chart(),
      getter = vi.fn(() => seriesSource());
    Object.defineProperty(drawing.chart, "source", { get: getter });
    expect(fixture([drawing]).capture).toThrow(ChartPrintUnavailableError);
    expect(getter).not.toHaveBeenCalled();
  });

  test("invalid nonfinite geometry metrics fail closed", () => {
    const f = fixture();
    const metrics = { ...f.metrics, rows: { ...f.metrics.rows, visiblePrefix: () => NaN } };
    expect(() =>
      capturePrintChartPass({ sheet: f.sheet, metrics, evaluator: f.evaluator }),
    ).toThrow(ChartPrintUnavailableError);
  });

  test("up to 128 valid chart roots are accepted; the next root is an explicit failure", () => {
    const drawings = Array.from({ length: 128 }, (_, index) =>
      chart(`chart-${index}`, {
        source: { kind: "series", categories: { kind: "generated" }, series: [] },
      }),
    );
    expect(fixture(drawings).capture().entries).toHaveLength(128);
    drawings.push(chart("chart-128"));
    expect(fixture(drawings).capture).toThrow(/128 charts/);
  });

  test("a 4096-character label is valid and the next character is rejected", () => {
    const data = (length: number): ChartData => ({
      categories: ["x".repeat(length)],
      series: [],
      records: [],
    });
    expect(fixture([cachedChart("bounded-label", data(4096))]).capture().entries).toHaveLength(1);
    expect(fixture([cachedChart("large-label", data(4097))]).capture).toThrow(/4096/);
  });

  test("chart and batch text budgets reject large collections of individually valid labels", () => {
    const data = (count: number): ChartData => ({
      categories: Array.from({ length: count }, () => "x".repeat(4096)),
      series: [],
      records: [],
    });
    const drawings = Array.from({ length: 4 }, (_, index) =>
      cachedChart(`text-${index}`, data(64)),
    );
    for (const drawing of drawings) drawing.chart.title = "";
    expect(fixture(drawings).capture().entries).toHaveLength(4);
    const perChart = cachedChart("per-chart-text", data(65));
    perChart.chart.title = "";
    expect(fixture([perChart]).capture).toThrow(/text or value budget/);
    const fifth = cachedChart("batch-text", data(64));
    fifth.chart.title = "";
    expect(fixture([...drawings, fifth]).capture).toThrow(/text or value budget/);
  });

  test("batch value budget counts records as well as series values", () => {
    const data: ChartData = {
      categories: Array.from({ length: 5000 }, () => ""),
      series: [{ name: "", values: Array.from({ length: 5000 }, () => 1) }],
      records: Array.from({ length: 5000 }, () => [1]),
    };
    const drawings = Array.from({ length: 10 }, (_, index) => cachedChart(`values-${index}`, data));
    expect(fixture(drawings).capture().entries).toHaveLength(10);
    expect(fixture([...drawings, cachedChart("values-overflow", data)]).capture).toThrow(
      /text or value budget/,
    );
  });
});

test("printing rejects disguised chart payload instead of dropping it from a non-chart root", () => {
  const drawing: SheetDrawing = { ...chart("disguised"), kind: "shape" };
  const f = fixture([drawing]);
  const before = JSON.stringify(f.sheet.drawings);
  expect(() => f.capture()).toThrow(/Chart payloads require an own chart drawing kind/);
  expect(JSON.stringify(f.sheet.drawings)).toBe(before);
});

describe("source-owned visibility print leases", () => {
  test("all-hidden captures an empty projection with original source and stable identity", () => {
    const drawing = chart();
    drawing.chart.seriesFilter = { hiddenSeriesIds: ["stable-late", "stable-early"] };
    const f = fixture([drawing]),
      before = JSON.stringify(drawing),
      pass = f.capture();
    expect(pass.entries[0]!.data.series).toEqual([]);
    expect(pass.entries[0]!.drawing.chart.source!.series).toHaveLength(2);
    expect(pass.entries[0]!.drawing.chart.seriesFilter).toEqual(drawing.chart.seriesFilter);
    pass.assertCurrent();
    expect(JSON.stringify(drawing)).toBe(before);
  });
  test("a hidden literal value remains part of the immutable print source lease", () => {
    const drawing = chart();
    drawing.chart.seriesFilter = { hiddenSeriesIds: ["stable-late"] };
    const f = fixture([drawing]),
      pass = f.capture();
    expect(pass.entries[0]!.data.series.map((entry) => entry.id)).toEqual(["stable-early"]);
    const values = drawing.chart.source!.series[0]!.values;
    if (values.kind !== "literal") throw new Error("Missing literal fixture");
    values.values[0] = 999;
    expect(() => pass.assertCurrent()).toThrow(ChartPrintUnavailableError);
  });
  test("a hidden broken reference never becomes a valid print", () => {
    const drawing = chart();
    drawing.chart.source!.series[0]!.values = { kind: "range", sheetId: "deleted", range: null };
    drawing.chart.seriesFilter = { hiddenSeriesIds: ["stable-late"] };
    expect(fixture([drawing]).capture).toThrow(/unavailable or inconsistent/);
  });
  test("hiding excess series does not bypass complete data table source admission", () => {
    const drawing = chart();
    const source = drawing.chart.source!;
    source.series = Array.from({ length: 9 }, (_, index) => ({
      id: `s${index}`,
      colorIndex: index,
      name: { kind: "literal", text: `Series${index}` },
      values: { kind: "literal", values: [1, 2, 3] },
    }));
    drawing.chart.seriesFilter = {
      hiddenSeriesIds: source.series.slice(1).map((entry) => entry.id),
    };
    drawing.chart.elements = { dataTable: "withLegendKeys" };
    expect(fixture([drawing]).capture).toThrow(/complete source budget/);
  });
  test("all-hidden large sources still count against the batch value budget", () => {
    const drawings = Array.from({ length: 12 }, (_, index) => {
      const drawing = chart(`large-${index}`);
      drawing.chart.source = {
        kind: "series",
        categories: { kind: "generated" },
        series: [
          {
            id: "large",
            colorIndex: 0,
            name: { kind: "literal", text: "" },
            values: { kind: "literal", values: Array.from({ length: 5000 }, () => 1) },
          },
        ],
      };
      drawing.chart.seriesFilter = { hiddenSeriesIds: ["large"] };
      return drawing;
    });
    expect(fixture(drawings.slice(0, 5)).capture().entries).toHaveLength(5);
    expect(fixture(drawings).capture).toThrow(/text or value budget/);
  });
});

test("print capture freezes theme bindings and rejects a changed theme", () => {
  const f = fixture();
  const theme = createWorkbook({ id: "font-theme", sheetId: "font-sheet" }).theme;
  const pass = capturePrintChartPass({ ...f, theme });
  expect(pass.theme).toEqual(theme);
  expect(pass.theme).not.toBe(theme);
  expect(Object.isFrozen(pass.theme)).toBe(true);
  theme.bodyFont = "Arial";
  expect(() => pass.assertCurrent()).toThrow(/theme changed/);
  const next = capturePrintChartPass({ ...f, theme });
  expect(next.key).not.toBe(pass.key);
});
