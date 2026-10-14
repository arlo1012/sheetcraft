// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import type { ChartFormatSettings } from "@sheetcraft/core/chart-format";
import { createChartSourceFromRange } from "@sheetcraft/core/chart-source";
import * as chartSourceApi from "@sheetcraft/core/chart-source";
import { createWorkbookSession } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  getSheetChartData,
  getSheetChartSourceData,
  type ChartData,
  type ChartType,
} from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
  setCellStyle,
  setCellValue,
  type Sheet,
} from "@sheetcraft/core/workbook";
import {
  ChartClipboardSourceError,
  ChartClipboardSourceErrorReason as Reason,
  cloneChartClipboardDrawingData,
  planChartClipboardSourceForTarget,
} from "../../../modules/charts/chart-clipboard-source";
import {
  assertChartClipboardSourcePrepared,
  assertChartDrawingPreserved,
  captureChartDrawingForest,
  detachChartDrawingForest,
} from "../../../modules/charts/chart-source-ownership";

import { createChartOption } from "../../../modules/charts/chart-option";

const allTypes: ChartType[] = [
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "doughnut",
  "scatter",
  "radar",
  "treemap",
  "sankey",
  "river",
  "wordCloud",
];
const promotableTypes: ChartType[] = ["column", "bar", "line", "area", "radar"];

function format(): ChartFormatSettings {
  return {
    title: { fontFamily: "Arial", fontSize: 24, color: "#AABBCC", bold: true, italic: false },
    plot: { fill: "transparent", stroke: "#654321", strokeWidth: 2 },
    categoryAxis: {
      show: false,
      reverse: true,
      labelAngle: -45,
      title: "Region",
      text: { fontSize: 11, color: "#123456", italic: true },
      line: { stroke: "transparent", strokeWidth: 0 },
    },
    valueAxis: {
      show: true,
      min: 0,
      max: 160,
      majorUnit: 40,
      minorUnit: 10,
      reverse: false,
      title: "Sales",
      text: { fontFamily: "Arial", bold: false, color: "#111111" },
      line: { stroke: "#222222", strokeWidth: 1 },
      numberFormat: { kind: "number", fractionDigits: 1, useGrouping: true },
      linkedToSource: false,
    },
    secondaryValueAxis: {
      show: false,
      min: -40,
      max: 160,
      majorUnit: 40,
      minorUnit: 8,
      reverse: true,
      title: "Dormant axis",
      text: { fontSize: 14, italic: false },
      line: { stroke: "#FFFFFF", strokeWidth: 3 },
      numberFormat: { kind: "custom", code: "0.00%" },
      linkedToSource: true,
    },
    bar: { gapWidth: 50, overlap: -25 },
    series: [
      {
        id: "dormant",
        axis: "secondary",
        color: "#445566",
        strokeWidth: 2,
        smooth: true,
        markers: false,
      },
    ],
  };
}

function drawing(type: ChartType = "column"): SheetChartDrawing {
  return {
    id: "source-chart",
    kind: "chart",
    name: "Sales",
    anchor: { row: 5, column: 4 },
    offsetX: 7,
    offsetY: 9,
    width: 480,
    height: 300,
    text: "",
    shape: "rectangle",
    fill: "#FFFFFF",
    stroke: "#111111",
    strokeWidth: 2,
    color: "#112233",
    fontSize: 14,
    bold: true,
    italic: false,
    rotation: 27,
    chart: {
      type,
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 3 } },
      title: "Sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: true,
      stacked: false,
      showHidden: false,
      elements: {
        titlePosition: "overlay",
        legendPosition: "right",
        legendOverlay: false,
        labelPosition: "outsideEnd",
      },
      format: format(),
    },
  };
}

function fixture(type: ChartType = "column") {
  const workbook = createWorkbook({ id: "chart-clipboard", sheetId: "source" });
  const sourceSheet = getActiveSheet(workbook);
  const targetSheet = createSheet("Target", "target");
  const otherSheet = createSheet("Other", "other");
  insertSheet(workbook, targetSheet);
  insertSheet(workbook, otherSheet);
  for (const sheet of [sourceSheet, targetSheet, otherSheet]) {
    const bonus = sheet === sourceSheet ? 0 : sheet === targetSheet ? 1000 : 2000;
    [
      ["Region", "Apple", "Pear", "Peach"],
      ["East", 10 + bonus, 11 + bonus, 12 + bonus],
      ["West", 20 + bonus, 21 + bonus, 22 + bonus],
      ["North", 30 + bonus, 31 + bonus, 32 + bonus],
    ].forEach((row, r) =>
      row.forEach((value, column) => {
        setCellValue(sheet, { row: r, column }, value);
        setCellStyle(
          sheet,
          { row: r, column },
          {
            numberFormat: { kind: "number", fractionDigits: 2, useGrouping: true },
          },
        );
      }),
    );
  }
  const chartDrawing = drawing(type);
  sourceSheet.drawings = [chartDrawing];
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const resolveSheet = (id: string) => workbook.sheets.get(id);
  const evaluator = createWorkbookEvaluator(workbook, sourceSheet.id);
  const plan = (destination = targetSheet, candidate = chartDrawing) =>
    planChartClipboardSourceForTarget({
      drawing: candidate,
      sourceSheet,
      targetSheet: destination,
      evaluator,
      resolveSheet,
    });
  const before = () => structuredClone({ workbook, history: session.history });
  const read = (sheet: Sheet, value: SheetChartDrawing): ChartData =>
    getSheetChartData(
      sheet,
      value.chart,
      createWorkbookEvaluator(workbook, sheet.id),
      resolveSheet,
    );
  return {
    workbook,
    sourceSheet,
    targetSheet,
    otherSheet,
    chartDrawing,
    session,
    resolveSheet,
    evaluator,
    plan,
    before,
    read,
  };
}

function presentation(data: ChartData) {
  return {
    categories: data.categories,
    series: data.series.map(({ name, values, numberFormat }) => ({ name, values, numberFormat })),
  };
}

function expectReason(action: () => unknown, reason: Reason) {
  try {
    action();
    throw new Error("Expected source planning to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ChartClipboardSourceError);
    expect((error as ChartClipboardSourceError).reason).toBe(reason);
  }
}

describe("pure Chart clipboard source provenance", () => {
  test.each(allTypes)(
    "same-sheet %s payloads, including live PivotCharts, stay unchanged and isolated",
    (type) => {
      const f = fixture(type);
      const getComputedValue = vi.fn(() => {
        throw new Error("Unexpected evaluation");
      });
      for (const pivot of [false, true]) {
        const value = drawing(type);
        if (pivot) value.chart.pivotTableId = "live-pivot";
        const snapshot = structuredClone(value);
        const planned = planChartClipboardSourceForTarget({
          drawing: value,
          sourceSheet: f.sourceSheet,
          targetSheet: f.sourceSheet,
          evaluator: { getComputedValue },
          resolveSheet: f.resolveSheet,
        });
        expect(planned).toEqual(snapshot);
        planned.anchor.row++;
        planned.chart.range!.start.row++;
        planned.chart.elements!.legendOverlay = true;
        planned.chart.format!.title!.color = "#000000";
        planned.chart.format!.plot!.fill = "#000000";
        planned.chart.format!.categoryAxis!.text!.fontSize = 42;
        planned.chart.format!.valueAxis!.line!.strokeWidth = 5;
        planned.chart.format!.secondaryValueAxis!.numberFormat = { kind: "text" };
        planned.chart.format!.bar!.gapWidth = 80;
        planned.chart.format!.series![0]!.id = "changed";
        expect(value).toEqual(snapshot);
      }
      expect(getComputedValue).not.toHaveBeenCalled();
    },
  );

  test.each(allTypes)(
    "cross-sheet cached and broken-range %s payloads never become live sources",
    (type) => {
      const f = fixture(type);
      const noRead = vi.spyOn(f.evaluator, "getComputedValue").mockImplementation(() => {
        throw new Error("Unexpected cached or empty source evaluation");
      });
      f.chartDrawing.chart.range = null;
      f.chartDrawing.chart.dataCache = {
        categories: ["Frozen"],
        series: [
          {
            id: "cached",
            colorIndex: 8,
            name: "Snapshot",
            values: [42],
            numberFormat: { kind: "custom", code: "0.00%" },
          },
        ],
        records: [["Frozen", 42]],
        diagnostics: [{ code: "blank", role: "values", seriesId: "cached", index: 0 }],
      };
      const snapshot = f.before();
      const result = f.plan();
      expect(result).toEqual(f.chartDrawing);
      result.chart.dataCache!.categories[0] = "Changed";
      result.chart.dataCache!.series[0]!.values[0] = 99;
      result.chart.dataCache!.series[0]!.numberFormat = { kind: "text" };
      result.chart.dataCache!.records[0]![0] = "Changed";
      result.chart.dataCache!.diagnostics![0]!.index = 9;
      expect(f.before()).toEqual(snapshot);
      delete f.chartDrawing.chart.dataCache;
      expect(f.plan()).toEqual(f.chartDrawing);
      expect(noRead).not.toHaveBeenCalled();
    },
  );

  test("mixed-sheet absolute sources, stable identities, literals, hidden refs and tombstones transfer unchanged", () => {
    const f = fixture();
    f.chartDrawing.chart.range = null;
    f.chartDrawing.chart.source = {
      kind: "series",
      categories: {
        kind: "range",
        sheetId: f.otherSheet.id,
        range: { start: { row: 1, column: 0 }, end: { row: 3, column: 0 } },
      },
      series: [
        {
          id: "pear",
          colorIndex: 8,
          name: { kind: "cell", sheetId: f.targetSheet.id, cell: { row: 0, column: 2 } },
          values: {
            kind: "range",
            sheetId: f.sourceSheet.id,
            range: { start: { row: 1, column: 2 }, end: { row: 3, column: 2 } },
          },
        },
        {
          id: "bonus",
          colorIndex: 4,
          name: { kind: "literal", text: "Literal" },
          values: { kind: "literal", values: [1, 2, 3] },
        },
        {
          id: "dormant",
          colorIndex: 3,
          name: { kind: "cell", sheetId: "removed", cell: null },
          values: { kind: "range", sheetId: "removed", range: null },
        },
      ],
    };
    f.sourceSheet.hiddenColumns = new Set([2]);
    f.otherSheet.hiddenRows = new Set([2]);
    const noRead = vi.fn(() => {
      throw new Error("Unexpected evaluation");
    });
    const snapshot = f.before();
    const planned = planChartClipboardSourceForTarget({
      drawing: f.chartDrawing,
      sourceSheet: f.sourceSheet,
      targetSheet: f.targetSheet,
      evaluator: { getComputedValue: noRead },
      resolveSheet: f.resolveSheet,
    });
    expect(planned).toEqual(f.chartDrawing);
    expect(noRead).not.toHaveBeenCalled();
    const values = planned.chart.source!.series[0]!.values;
    if (values.kind !== "range") throw new Error("Expected absolute values");
    values.range!.start.row = 2;
    const literal = planned.chart.source!.series[1]!.values;
    if (literal.kind !== "literal") throw new Error("Expected literal values");
    literal.values[0] = 99;
    planned.chart.source!.series.reverse();
    expect(f.before()).toEqual(snapshot);
    f.chartDrawing.chart.source.series = [];
    expect(f.plan()).toEqual(f.chartDrawing);
  });

  test("mixed-sheet live absolute references keep custom IDs and palettes after changing owner", () => {
    const f = fixture("radar");
    f.chartDrawing.chart.range = null;
    f.chartDrawing.chart.source = {
      kind: "series",
      categories: {
        kind: "range",
        sheetId: f.otherSheet.id,
        range: { start: { row: 1, column: 0 }, end: { row: 3, column: 0 } },
      },
      series: [
        {
          id: "live",
          colorIndex: 7,
          name: { kind: "cell", sheetId: f.otherSheet.id, cell: { row: 0, column: 2 } },
          values: {
            kind: "range",
            sheetId: f.sourceSheet.id,
            range: { start: { row: 1, column: 2 }, end: { row: 3, column: 2 } },
          },
        },
        {
          id: "literal",
          colorIndex: 3,
          name: { kind: "literal", text: "Literal" },
          values: { kind: "literal", values: [1, 2, 3] },
        },
      ],
    };
    const planned = f.plan();
    expect(planned).toEqual(f.chartDrawing);
    expect(f.read(f.targetSheet, planned)).toEqual(f.read(f.sourceSheet, f.chartDrawing));
    setCellValue(f.sourceSheet, { row: 2, column: 2 }, 99);
    setCellValue(f.otherSheet, { row: 0, column: 2 }, "Updated pear");
    setCellValue(f.otherSheet, { row: 2, column: 0 }, "Updated West");
    expect(f.read(f.targetSheet, planned)).toMatchObject({
      categories: ["East", "Updated West", "North"],
      series: [
        { id: "live", colorIndex: 7, name: "Updated pear", values: [11, 99, 31] },
        { id: "literal", colorIndex: 3, name: "Literal", values: [1, 2, 3] },
      ],
    });
  });

  test("frozen persisted drawing fields are admitted without modifying the original", () => {
    const f = fixture();
    const freeze = (value: object): void => {
      for (const child of Object.values(value))
        if (child && typeof child === "object") freeze(child);
      Object.freeze(value);
    };
    freeze(f.chartDrawing);
    const snapshot = f.before();
    const result = f.plan();
    expect(result.chart.source).toBeDefined();
    result.chart.format!.categoryAxis!.line!.strokeWidth = 7;
    expect(f.before()).toEqual(snapshot);
  });

  const cases = promotableTypes.flatMap((type) =>
    (["columns", "rows"] as const).flatMap((seriesBy) =>
      [false, true].flatMap((headerRow) =>
        [false, true].flatMap((headerColumn) =>
          [false, true].map((showHidden) => ({
            type,
            seriesBy,
            headerRow,
            headerColumn,
            showHidden,
          })),
        ),
      ),
    ),
  );
  test.each(cases)(
    "promotes $type/$seriesBy headers=$headerRow/$headerColumn hidden=$showHidden losslessly",
    (settings) => {
      const f = fixture(settings.type);
      Object.assign(f.chartDrawing.chart, settings);
      // Includes hidden category-header stripes, transverse series and longitudinal ordinals.
      f.sourceSheet.hiddenRows = new Set([0, 2]);
      f.sourceSheet.hiddenColumns = new Set([0, 2]);
      f.targetSheet.hiddenRows = new Set([1, 3]);
      f.targetSheet.hiddenColumns = new Set([1, 3]);
      const snapshot = f.before();
      const legacy = f.read(f.sourceSheet, f.chartDrawing);
      const planned = f.plan();
      expect(planned.chart.source).toEqual(
        createChartSourceFromRange(f.sourceSheet.id, f.chartDrawing.chart, f.sourceSheet),
      );
      expect(planned.chart.range).toBeNull();
      expect(planned.chart.dataCache).toBeUndefined();
      expect({
        ...planned,
        chart: { ...planned.chart, range: f.chartDrawing.chart.range, source: undefined },
      }).toEqual({ ...f.chartDrawing, chart: { ...f.chartDrawing.chart, source: undefined } });
      const derived = f.read(f.targetSheet, planned);
      expect(presentation(derived)).toEqual(presentation(legacy));
      expect(derived.series.map((entry) => entry.colorIndex)).toEqual(
        legacy.series.map((_, i) => i),
      );
      expect(f.before()).toEqual(snapshot);
    },
  );

  test.each(["columns", "rows"] as const)(
    "promoted %s remain live and keep hidden logical IDs/palette slots",
    (seriesBy) => {
      const f = fixture();
      f.chartDrawing.chart.seriesBy = seriesBy;
      if (seriesBy === "columns") {
        f.chartDrawing.chart.headerRow = false;
        f.sourceSheet.hiddenColumns = new Set([1]);
      } else {
        f.chartDrawing.chart.headerColumn = false;
        f.sourceSheet.hiddenRows = new Set([1]);
      }
      const result = f.plan();
      expect(result.chart.source!.series.map(({ id, colorIndex }) => ({ id, colorIndex }))).toEqual(
        [
          { id: "series-1", colorIndex: 2 },
          { id: "series-2", colorIndex: 0 },
          { id: "series-3", colorIndex: 1 },
        ],
      );
      expect(result.chart.format).toEqual(f.chartDrawing.chart.format);
      setCellValue(f.sourceSheet, { row: 2, column: 2 }, 99);
      const live = f.read(f.targetSheet, result);
      expect(live.series.find((entry) => entry.id === "series-2")!.values).toContain(99);
      f.sourceSheet.hiddenColumns?.clear();
      f.sourceSheet.hiddenRows?.clear();
      expect(f.read(f.targetSheet, result).series.map((entry) => entry.id)).toEqual([
        "series-1",
        "series-2",
        "series-3",
      ]);
    },
  );

  test.each(["columns", "rows"] as const)(
    "single-point %s vectors preserve their transverse hidden axes",
    (seriesBy) => {
      const f = fixture();
      f.chartDrawing.chart.seriesBy = seriesBy;
      f.chartDrawing.chart.range = {
        start: { row: 0, column: 0 },
        end: seriesBy === "columns" ? { row: 1, column: 3 } : { row: 3, column: 1 },
      };
      if (seriesBy === "columns") f.sourceSheet.hiddenColumns = new Set([1]);
      else f.sourceSheet.hiddenRows = new Set([1]);
      expect(presentation(f.read(f.targetSheet, f.plan()))).toEqual(
        presentation(f.read(f.sourceSheet, f.chartDrawing)),
      );
    },
  );

  test("the five-renderer proof admits row/headerless records that have a different unused layout", () => {
    const f = fixture("line");
    f.chartDrawing.chart.seriesBy = "rows";
    f.chartDrawing.chart.headerColumn = false;
    const original = f.read(f.sourceSheet, f.chartDrawing);
    const planned = f.plan();
    const derived = f.read(f.targetSheet, planned);
    expect(derived.records).not.toEqual(original.records);
    expect(presentation(derived)).toEqual(presentation(original));
  });

  test("blank/Boolean/error label gaps and nonuniform numeric formats retain derived presentation", () => {
    const f = fixture();
    setCellValue(f.sourceSheet, { row: 0, column: 1 }, true);
    setCellValue(f.sourceSheet, { row: 1, column: 0 }, false);
    setCellValue(f.sourceSheet, { row: 2, column: 1 }, "text");
    setCellContent(f.sourceSheet, { row: 1, column: 2 }, null);
    setCellContent(
      f.sourceSheet,
      { row: 3, column: 1 },
      {
        kind: "error",
        error: { kind: "formula-error", code: "DIV0" },
      },
    );
    setCellStyle(
      f.sourceSheet,
      { row: 3, column: 2 },
      {
        numberFormat: { kind: "custom", code: "0.0%" },
      },
    );
    expect(presentation(f.read(f.targetSheet, f.plan()))).toEqual(
      presentation(f.read(f.sourceSheet, f.chartDrawing)),
    );
  });

  test.each(promotableTypes)(
    "already empty value vectors in %s can remain empty without a cache",
    (type) => {
      const f = fixture(type);
      f.chartDrawing.chart.range!.end.row = 0;
      const planned = f.plan();
      expect(
        planned.chart.source!.series.every(
          (entry) => entry.values.kind === "literal" && entry.values.values.length === 0,
        ),
      ).toBe(true);
      expect(presentation(f.read(f.targetSheet, planned))).toEqual(
        presentation(f.read(f.sourceSheet, f.chartDrawing)),
      );
    },
  );

  test.each(allTypes.filter((type) => !promotableTypes.includes(type)))(
    "refuses owner-relative live %s without mutation or cache fallback",
    (type) => {
      const f = fixture(type);
      const snapshot = f.before();
      expectReason(() => f.plan(), Reason.UnsupportedLegacySource);
      expect(f.before()).toEqual(snapshot);
    },
  );

  test.each(allTypes)(
    "refuses live cross-sheet Pivot %s even when its current data is empty",
    (type) => {
      const f = fixture(type);
      f.chartDrawing.chart.pivotTableId = "missing-pivot";
      f.chartDrawing.chart.range = null;
      const snapshot = f.before();
      expectReason(() => f.plan(), Reason.UnsupportedPivotSource);
      expect(f.before()).toEqual(snapshot);
    },
  );

  test.each(["series-1", "series-2"])(
    "allocates around dormant format %s, including hidden sources",
    (id) => {
      const f = fixture();
      f.sourceSheet.hiddenColumns = new Set([2]);
      f.chartDrawing.chart.format!.series!.push({ id, color: "#ff0000" });
      const snapshot = f.before();
      const planned = f.plan();
      expect(planned.chart.source!.series.some((entry) => entry.id === id)).toBe(false);
      expect(planned.chart.format).toEqual(f.chartDrawing.chart.format);
      expect(presentation(f.read(f.targetSheet, planned))).toEqual(
        presentation(f.read(f.sourceSheet, f.chartDrawing)),
      );
      expect(f.before()).toEqual(snapshot);
      // The unchanged same-sheet payload never activates dormant identities.
      expect(f.plan(f.sourceSheet)).toEqual(f.chartDrawing);
    },
  );

  test("refuses nonprovable all-hidden/no-series/budget-limited rectangles before any side effects", () => {
    const hidden = fixture();
    hidden.sourceSheet.hiddenColumns = new Set([1, 2, 3]);
    const empty = fixture();
    empty.chartDrawing.chart.range!.end.column = 0;
    const wide = fixture();
    wide.chartDrawing.chart.headerColumn = false;
    wide.chartDrawing.chart.range = { start: { row: 0, column: 0 }, end: { row: 1, column: 256 } };
    const budget = fixture();
    budget.chartDrawing.chart.headerRow = false;
    budget.chartDrawing.chart.headerColumn = false;
    budget.chartDrawing.chart.range = {
      start: { row: 0, column: 0 },
      end: { row: 9999, column: 0 },
    };
    for (const f of [hidden, empty, wide, budget]) {
      const snapshot = f.before();
      expectReason(() => f.plan(), Reason.NonEquivalentSource);
      expect(f.before()).toEqual(snapshot);
    }
  });

  test("evaluation failure or inconsistent values cannot silently yield a cache or partial plan", () => {
    const f = fixture();
    const snapshot = f.before();
    const getComputedValue = vi.fn(() => {
      throw new Error("Calculation unavailable");
    });
    expectReason(
      () =>
        planChartClipboardSourceForTarget({
          drawing: f.chartDrawing,
          sourceSheet: f.sourceSheet,
          targetSheet: f.targetSheet,
          evaluator: { getComputedValue },
          resolveSheet: f.resolveSheet,
        }),
      Reason.NonEquivalentSource,
    );
    let count = 0;
    expectReason(
      () =>
        planChartClipboardSourceForTarget({
          drawing: f.chartDrawing,
          sourceSheet: f.sourceSheet,
          targetSheet: f.targetSheet,
          evaluator: { getComputedValue: () => ++count },
          resolveSheet: f.resolveSheet,
        }),
      Reason.NonEquivalentSource,
    );
    expect(f.before()).toEqual(snapshot);
  });

  test("unknown, stale, same-ID foreign owners and unknown source kinds receive distinct typed refusals", () => {
    const f = fixture();
    const snapshot = f.before();
    const input = {
      drawing: f.chartDrawing,
      sourceSheet: f.sourceSheet,
      targetSheet: f.targetSheet,
      evaluator: f.evaluator,
      resolveSheet: f.resolveSheet,
    };
    expectReason(
      () =>
        planChartClipboardSourceForTarget({ ...input, sourceSheet: undefined as unknown as Sheet }),
      Reason.UnknownSourceSheet,
    );
    expectReason(
      () =>
        planChartClipboardSourceForTarget({ ...input, targetSheet: undefined as unknown as Sheet }),
      Reason.UnknownTargetSheet,
    );
    expectReason(
      () => planChartClipboardSourceForTarget({ ...input, resolveSheet: () => undefined }),
      Reason.UnknownSourceSheet,
    );
    expectReason(
      () =>
        planChartClipboardSourceForTarget({
          ...input,
          targetSheet: createSheet("Foreign", f.sourceSheet.id),
          resolveSheet: undefined,
        }),
      Reason.UnknownSourceSheet,
    );
    expectReason(
      () =>
        planChartClipboardSourceForTarget({
          ...input,
          targetSheet: createSheet("Stale target", f.targetSheet.id),
        }),
      Reason.UnknownTargetSheet,
    );
    const unknown = drawing();
    Object.assign(unknown.chart, { source: { kind: "external-workbook" } });
    expectReason(
      () => planChartClipboardSourceForTarget({ ...input, drawing: unknown }),
      Reason.UnknownChartSource,
    );
    expect(f.before()).toEqual(snapshot);
  });

  test("malformed/accessor/cyclic payloads are refused without invoking caller fields", () => {
    const f = fixture();
    const snapshot = f.before();
    let reads = 0;
    const accessor = drawing();
    Object.defineProperty(accessor.chart, "source", {
      enumerable: true,
      get: () => {
        reads++;
        return { kind: "series" };
      },
    });
    const cyclic = drawing();
    Object.assign(cyclic.chart, { extra: cyclic });
    const invalid = drawing();
    invalid.chart.format!.bar!.gapWidth = 501;
    for (const candidate of [accessor, cyclic, invalid])
      expectReason(() => f.plan(f.targetSheet, candidate), Reason.InvalidChartPayload);
    expect(reads).toBe(0);
    expect(f.before()).toEqual(snapshot);
  });
});

function visibleOptions(value: ReturnType<typeof createChartOption>): unknown {
  type PaintEntry = {
    itemStyle?: Record<string, unknown>;
    lineStyle?: Record<string, unknown>;
    areaStyle?: Record<string, unknown>;
  };
  const option = JSON.parse(
    JSON.stringify(value, (key, entry: unknown) => (key === "id" ? undefined : entry)),
  ) as {
    color: string[];
    series: Array<PaintEntry & { type: string; data?: PaintEntry[] }>;
  };
  // Legacy rectangles let ECharts apply the visible-ordinal palette implicitly.
  // Promotion makes that same palette explicit; compare their effective paint.
  const paint = (entry: PaintEntry, index: number, line: boolean, area: boolean) => {
    const color = option.color[index % option.color.length];
    entry.itemStyle = { color, ...entry.itemStyle };
    if (line) entry.lineStyle = { color, ...entry.lineStyle };
    else delete entry.lineStyle; // ECharts bars do not consume lineStyle.
    if (area) entry.areaStyle = { color, ...entry.areaStyle };
  };
  option.series.forEach((series, index) => {
    if (series.type === "radar")
      series.data?.forEach((entry, ordinal) => paint(entry, ordinal, true, false));
    else paint(series, index, series.type === "line", Object.hasOwn(series, "areaStyle"));
  });
  return option;
}

describe("Chart clipboard bound range identity", () => {
  test.each(
    promotableTypes.flatMap((type) =>
      (["rows", "columns"] as const).flatMap((seriesBy) =>
        [false, true].map((hidden) => ({ type, seriesBy, hidden })),
      ),
    ),
  )(
    "$type/$seriesBy hidden=$hidden transfers bound styles and proves actual renderer color/axis/format",
    ({ type, seriesBy, hidden }) => {
      const f = fixture(type);
      const chart = f.chartDrawing.chart;
      chart.seriesBy = seriesBy;
      const active = [
        { index: 0, id: "header" },
        { index: 1, id: "active-one" },
        { index: 2, id: "active-two" },
      ];
      const inactive = [{ index: 2, id: "inactive" }];
      chart.rectangleSeries =
        seriesBy === "rows"
          ? { rows: active, columns: inactive }
          : { rows: inactive, columns: active };
      chart.format!.series!.push(
        { id: "header", color: "#333333" },
        { id: "inactive", color: "#444444" },
        { id: "active-one", color: "#ff0000", strokeWidth: 3, markers: true, smooth: true },
        { id: "active-two", color: "#00ff00", strokeWidth: 4, markers: false, axis: "secondary" },
        { id: "series-1", color: "#0000ff" },
      );
      if (hidden) {
        if (seriesBy === "rows") f.sourceSheet.hiddenRows = new Set([1]);
        else f.sourceSheet.hiddenColumns = new Set([1]);
      }
      const before = f.before();
      const originalData = f.read(f.sourceSheet, f.chartDrawing);
      expect(f.plan(f.sourceSheet)).toEqual(f.chartDrawing);
      const result = f.plan();
      expect(result.chart.range).toBeNull();
      expect(result.chart.rectangleSeries).toBeUndefined();
      expect(result.chart.format).toEqual(chart.format);
      expect(result.chart.source?.series.map((entry) => entry.id)).toEqual([
        "active-one",
        "active-two",
        "series-2",
      ]);
      expect(
        result.chart.source?.series.some((entry) =>
          ["header", "inactive", "series-1", "dormant"].includes(entry.id),
        ),
      ).toBe(false);
      const promotedData = f.read(f.targetSheet, result);
      expect(presentation(promotedData)).toEqual(presentation(originalData));
      expect(visibleOptions(createChartOption(result.chart, promotedData))).toEqual(
        visibleOptions(createChartOption(chart, originalData)),
      );
      expect(f.before()).toEqual(before);
    },
  );

  test.each(["inactive", "header", "dormant"])(
    "rejects a source planner that activates unrelated %s formatting",
    (id) => {
      const f = fixture();
      const chart = f.chartDrawing.chart;
      chart.rectangleSeries = {
        rows: [{ index: 2, id: "inactive" }],
        columns: [
          { index: 0, id: "header" },
          { index: 1, id: "active" },
        ],
      };
      chart.format!.series!.push(
        { id: "inactive", color: "#112233" },
        { id: "header", color: "#223344" },
        { id: "active", color: "#ff0000" },
      );
      const source = createChartSourceFromRange(f.sourceSheet.id, chart, f.sourceSheet);
      source.series[0]!.id = id;
      const before = f.before();
      const read = vi.spyOn(f.evaluator, "getComputedValue");
      const planner = vi
        .spyOn(chartSourceApi, "createChartSourceFromRange")
        .mockReturnValue(source);
      try {
        expectReason(() => f.plan(), Reason.DormantSeriesIdCollision);
        expect(read).not.toHaveBeenCalled();
        expect(f.before()).toEqual(before);
      } finally {
        planner.mockRestore();
        read.mockRestore();
      }
    },
  );

  test("malformed bound metadata is refused before evaluating or mutating clipboard state", () => {
    const f = fixture();
    Object.assign(f.chartDrawing.chart, {
      rectangleSeries: {
        rows: [],
        columns: [
          { index: 1, id: "duplicate" },
          { index: 2, id: "duplicate" },
        ],
      },
    });
    const read = vi.spyOn(f.evaluator, "getComputedValue");
    const before = f.before();
    expectReason(() => f.plan(), Reason.InvalidChartPayload);
    expect(read).not.toHaveBeenCalled();
    expect(f.before()).toEqual(before);
  });
});

function filteredFixture(type: ChartType = "column", seriesBy: "rows" | "columns" = "columns") {
  const f = fixture(type);
  const chart = f.chartDrawing.chart;
  chart.seriesBy = seriesBy;
  const active = [
    { index: 0, id: "header" },
    { index: 1, id: "active-one" },
    { index: 2, id: "active-two" },
    { index: 3, id: "active-three" },
  ];
  const inactive = [{ index: 2, id: "inactive" }];
  chart.rectangleSeries =
    seriesBy === "rows" ? { rows: active, columns: inactive } : { rows: inactive, columns: active };
  chart.seriesFilter = { hiddenSeriesIds: ["header", "inactive", "retired"] };
  chart.presentation = { palette: ["#101010", "#202020", "#303030"] };
  chart.format!.series!.push(
    { id: "header", color: "#333333" },
    { id: "inactive", color: "#444444" },
    { id: "active-one", color: "#aa0000", strokeWidth: 3, smooth: true, markers: true },
    { id: "active-two", axis: "secondary", strokeWidth: 4, markers: false },
  );
  return f;
}

describe("Chart clipboard source-owned series filters", () => {
  test.each(allTypes)(
    "same-sheet and deleted-range %s keep dormant filters without source reads",
    (type) => {
      const f = fixture(type);
      f.chartDrawing.chart.seriesFilter = { hiddenSeriesIds: ["retired"] };
      const read = vi.spyOn(f.evaluator, "getComputedValue").mockImplementation(() => {
        throw new Error("Unexpected dormant source evaluation");
      });
      const before = f.before();
      expect(f.plan(f.sourceSheet)).toEqual(f.chartDrawing);
      expect(f.before()).toEqual(before);
      f.chartDrawing.chart.range = null;
      expect(f.plan()).toEqual(f.chartDrawing);
      expect(read).not.toHaveBeenCalled();
    },
  );

  test.each(
    promotableTypes.flatMap((type) =>
      (["rows", "columns"] as const).flatMap((seriesBy) =>
        (["first", "middle", "all"] as const).map((selection) => ({ type, seriesBy, selection })),
      ),
    ),
  )(
    "$type/$seriesBy hide=$selection retains definitions, paint, axes and actual options",
    ({ type, seriesBy, selection }) => {
      const f = filteredFixture(type, seriesBy);
      const chart = f.chartDrawing.chart;
      const selected =
        selection === "all"
          ? ["active-one", "active-two", "active-three"]
          : [selection === "first" ? "active-one" : "active-two"];
      chart.seriesFilter!.hiddenSeriesIds.push(...selected);
      const before = f.before();
      const raw = getSheetChartSourceData(f.sourceSheet, chart, f.evaluator, f.resolveSheet);
      const visible = f.read(f.sourceSheet, f.chartDrawing);
      const sameSheet = f.plan(f.sourceSheet);
      expect(sameSheet).toEqual(f.chartDrawing);
      sameSheet.chart.seriesFilter!.hiddenSeriesIds.reverse();
      expect(f.before()).toEqual(before);
      const result = f.plan();
      expect(result.chart.source?.series.map((entry) => entry.id)).toEqual([
        "active-one",
        "active-two",
        "active-three",
      ]);
      expect(result.chart.source?.series.map((entry) => entry.colorIndex)).toEqual([0, 1, 2]);
      expect(result.chart.rectangleSeries).toBeUndefined();
      expect(result.chart.range).toBeNull();
      const { rectangleSeries: _bindings, range: _range, ...retained } = chart;
      const { source: _source, range: _promotedRange, ...promotedRetained } = result.chart;
      expect(promotedRetained).toEqual(retained);
      expect(JSON.stringify(result.chart.seriesFilter)).toBe(JSON.stringify(chart.seriesFilter));
      const derived = f.read(f.targetSheet, result);
      expect(presentation(derived)).toEqual(presentation(visible));
      expect(derived.series.map((entry) => entry.colorIndex)).toEqual(
        raw.series.flatMap((entry, index) => (selected.includes(entry.id!) ? [] : [index])),
      );
      expect(derived.series.every((entry) => entry.numberFormat?.kind === "number")).toBe(true);
      expect(visibleOptions(createChartOption(result.chart, derived))).toEqual(
        visibleOptions(createChartOption(chart, visible)),
      );
      expect(() =>
        assertChartClipboardSourcePrepared(f.chartDrawing, result, f.sourceSheet, f.targetSheet),
      ).not.toThrow();
      if (selection === "all") {
        expect(derived.series).toEqual([]);
        expect(derived.categories).toEqual(raw.categories);
        expect(result.chart.source?.series).toHaveLength(3);
      }
      result.chart.seriesFilter!.hiddenSeriesIds.push("changed");
      expect(f.before()).toEqual(before);
    },
  );

  test.each(["rows", "columns"] as const)(
    "%s promotion reserves every dormant filter ID before assigning new sources",
    (seriesBy) => {
      const f = filteredFixture("line", seriesBy);
      f.chartDrawing.chart.rectangleSeries![seriesBy] = [{ index: 1, id: "active-one" }];
      f.chartDrawing.chart.seriesFilter!.hiddenSeriesIds.push("active-one", "series-1", "series-2");
      const before = f.before();
      const result = f.plan();
      expect(result.chart.source?.series.map((entry) => entry.id)).toEqual([
        "active-one",
        "series-3",
        "series-4",
      ]);
      expect(f.read(f.targetSheet, result).series.map((entry) => entry.id)).toEqual([
        "series-3",
        "series-4",
      ]);
      expect(result.chart.seriesFilter).toEqual(f.chartDrawing.chart.seriesFilter);
      expect(f.before()).toEqual(before);
    },
  );

  test.each([
    { id: "inactive", index: 2 },
    { id: "header", index: 2 },
    { id: "retired", index: 2 },
    { id: "fresh-but-mismatched", index: 0 },
    { id: "active-one", index: 2 },
  ])("refuses planner ID=$id at ordinal=$index before evaluating", ({ id, index }) => {
    const f = filteredFixture();
    f.chartDrawing.chart.rectangleSeries!.columns = [{ index: 1, id: "active-one" }];
    const source = createChartSourceFromRange(
      f.sourceSheet.id,
      f.chartDrawing.chart,
      f.sourceSheet,
    );
    source.series[index]!.id = id;
    const before = f.before();
    const read = vi.spyOn(f.evaluator, "getComputedValue");
    const planner = vi.spyOn(chartSourceApi, "createChartSourceFromRange").mockReturnValue(source);
    try {
      // A duplicate ID remains malformed source data; other identity collisions
      // receive the typed provenance refusal even without a matching style.
      expectReason(
        () => f.plan(),
        id === "active-one" ? Reason.NonEquivalentSource : Reason.DormantSeriesIdCollision,
      );
      expect(read).not.toHaveBeenCalled();
      expect(f.before()).toEqual(before);
    } finally {
      planner.mockRestore();
      read.mockRestore();
    }
  });

  test.each(["broken", "mismatch", "budget", "changed-values"] as const)(
    "all-hidden cannot conceal a promoted source that is $0",
    (defect) => {
      const f = filteredFixture();
      f.chartDrawing.chart.seriesFilter!.hiddenSeriesIds.push(
        "active-one",
        "active-two",
        "active-three",
      );
      const source = createChartSourceFromRange(
        f.sourceSheet.id,
        f.chartDrawing.chart,
        f.sourceSheet,
      );
      if (defect === "broken")
        source.series[0]!.values = { kind: "range", sheetId: "deleted", range: null };
      else if (defect === "mismatch")
        source.series[0]!.values = { kind: "literal", values: [1, 2] };
      else if (defect === "budget")
        source.series[0]!.values = {
          kind: "literal",
          values: Array.from({ length: 10001 }, () => 1),
        };
      else source.series[0]!.values = { kind: "literal", values: [9, 8, 7] };
      const before = f.before();
      const planner = vi
        .spyOn(chartSourceApi, "createChartSourceFromRange")
        .mockReturnValue(source);
      try {
        expectReason(() => f.plan(), Reason.NonEquivalentSource);
        expect(f.before()).toEqual(before);
      } finally {
        planner.mockRestore();
      }
    },
  );

  test("already explicit all-hidden definitions stay detached and retain raw invalid diagnostics", () => {
    const f = filteredFixture();
    const source = createChartSourceFromRange(
      f.sourceSheet.id,
      f.chartDrawing.chart,
      f.sourceSheet,
    );
    delete f.chartDrawing.chart.rectangleSeries;
    f.chartDrawing.chart.range = null;
    f.chartDrawing.chart.source = source;
    f.chartDrawing.chart.seriesFilter!.hiddenSeriesIds.push(
      "active-one",
      "active-two",
      "active-three",
    );
    source.series[0]!.values = { kind: "range", sheetId: "missing", range: null };
    const read = vi.spyOn(f.evaluator, "getComputedValue");
    const before = f.before();
    const result = f.plan();
    expect(result).toEqual(f.chartDrawing);
    expect(read).not.toHaveBeenCalled();
    const data = f.read(f.targetSheet, result);
    expect(data.categories).toEqual([]);
    expect(data.series).toEqual([]);
    expect(data.diagnostics).toContainEqual({
      code: "broken-reference",
      role: "values",
      seriesId: "active-one",
    });
    result.chart.source!.series.reverse();
    result.chart.seriesFilter!.hiddenSeriesIds.reverse();
    expect(f.before()).toEqual(before);
  });

  test("filter accessors, sparse selections and excess budgets fail before getters or evaluation", () => {
    const f = filteredFixture();
    let reads = 0;
    const getter = () => {
      reads++;
      return ["active-one"];
    };
    const candidates = Array.from({ length: 6 }, () => structuredClone(f.chartDrawing));
    Object.defineProperty(candidates[0]!.chart, "seriesFilter", { enumerable: true, get: getter });
    Object.defineProperty(candidates[1]!.chart.seriesFilter!, "hiddenSeriesIds", {
      enumerable: true,
      get: getter,
    });
    Object.defineProperty(candidates[2]!.chart.seriesFilter!.hiddenSeriesIds, "0", {
      enumerable: true,
      get: getter,
    });
    candidates[3]!.chart.seriesFilter!.hiddenSeriesIds = [];
    candidates[3]!.chart.seriesFilter!.hiddenSeriesIds.length = 2;
    candidates[4]!.chart.seriesFilter!.hiddenSeriesIds = Array.from(
      { length: 513 },
      (_, index) => `retired-${index}`,
    );
    candidates[5]!.chart.seriesFilter!.hiddenSeriesIds = ["active-one", "active-one"];
    const read = vi.spyOn(f.evaluator, "getComputedValue");
    const before = f.before();
    for (const candidate of candidates) {
      expectReason(() => f.plan(f.targetSheet, candidate), Reason.InvalidChartPayload);
      if (candidate !== candidates[4] && candidate !== candidates[5])
        expect(() => detachChartDrawingForest([candidate])).toThrow();
    }
    expect(reads).toBe(0);
    expect(read).not.toHaveBeenCalled();
    expect(f.before()).toEqual(before);
  });

  test("clipboard cloning bounds nested extension traversal even on all-hidden charts", () => {
    const f = filteredFixture();
    f.chartDrawing.chart.seriesFilter!.hiddenSeriesIds.push(
      "active-one",
      "active-two",
      "active-three",
    );
    const large = Object.fromEntries(
      Array.from({ length: 52 }, (_, index) => [`field-${index}`, null]),
    );
    Object.assign(f.chartDrawing.chart, { extra: Array.from({ length: 10000 }, () => large) });
    expect(() => cloneChartClipboardDrawingData(f.chartDrawing)).toThrow("too large");
    expectReason(() => f.plan(), Reason.InvalidChartPayload);
  });
});

describe("Chart clipboard source-only host ownership", () => {
  test.each([
    "filter-edit",
    "filter-order",
    "filter-delete",
    "style",
    "geometry",
    "identity",
  ] as const)("source hook cannot include a $0 change", (change) => {
    const f = filteredFixture();
    f.chartDrawing.chart.seriesFilter!.hiddenSeriesIds.push("active-one");
    const expected = structuredClone(f.chartDrawing);
    const candidate = f.plan();
    if (change === "filter-edit") candidate.chart.seriesFilter!.hiddenSeriesIds.push("active-two");
    else if (change === "filter-order") candidate.chart.seriesFilter!.hiddenSeriesIds.reverse();
    else if (change === "filter-delete") delete candidate.chart.seriesFilter;
    else if (change === "style") candidate.chart.format!.series![0]!.color = "#000000";
    else if (change === "geometry") candidate.width++;
    else candidate.chart.source!.series[0]!.id = "changed";
    expect(() =>
      assertChartClipboardSourcePrepared(expected, candidate, f.sourceSheet, f.targetSheet),
    ).toThrow();
    expect(f.chartDrawing).toEqual(expected);
  });

  test("same-sheet copies retain explicit empty filters and exact-assert snapshots are detached", () => {
    const f = filteredFixture();
    f.chartDrawing.chart.seriesFilter = { hiddenSeriesIds: [] };
    const snapshots = captureChartDrawingForest([f.chartDrawing]);
    const candidate = f.plan(f.sourceSheet);
    expect(() =>
      assertChartClipboardSourcePrepared(snapshots[0]!, candidate, f.sourceSheet, f.sourceSheet),
    ).not.toThrow();
    delete candidate.chart.seriesFilter;
    expect(() => assertChartDrawingPreserved(snapshots[0]!, candidate)).toThrow();
    f.chartDrawing.chart.seriesFilter.hiddenSeriesIds.push("active-one");
    expect((snapshots[0] as SheetChartDrawing).chart.seriesFilter?.hiddenSeriesIds).toEqual([]);
  });

  test("source-only preparation rejects a filter getter before it can run", () => {
    const f = filteredFixture();
    const candidate = f.plan();
    let reads = 0;
    Object.defineProperty(f.chartDrawing.chart.seriesFilter!, "hiddenSeriesIds", {
      enumerable: true,
      get: () => {
        reads++;
        return [];
      },
    });
    expect(() =>
      assertChartClipboardSourcePrepared(f.chartDrawing, candidate, f.sourceSheet, f.targetSheet),
    ).toThrow();
    expect(() => captureChartDrawingForest([f.chartDrawing])).toThrow();
    expect(reads).toBe(0);
  });
});
