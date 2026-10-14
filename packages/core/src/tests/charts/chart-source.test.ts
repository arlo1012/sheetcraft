import { describe, expect, test } from "vitest";
import {
  createChartSourceFromRange,
  getChartSourceApplicability,
  normalizeChartSource,
} from "../../chart-source.js";
import { getSheetChartData, normalizeSheetChart, type SheetChart } from "../../sheet-charts.js";
import {
  createSheet,
  createSheetEvaluator,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  setCellValue,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { elementChart } from "./chart-elements-fixture.js";
import { seriesSource, sourceDrawing, vectorRange } from "./chart-source-fixture.js";

function fixture() {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook),
    other = createSheet("Sheet2", "other");
  session.workbook.sheets.set(other.id, other);
  [
    ["Region", "apple", "pear"],
    ["East", 10, 20],
    ["North", 30, 40],
    ["South", 50, 60],
  ].forEach((row, r) =>
    row.forEach((value, c) => setCellValue(sheet, { row: r, column: c }, value)),
  );
  [
    ["Category", "extra"],
    ["red", 15],
    ["green", 25],
    ["blue", 35],
  ].forEach((row, r) =>
    row.forEach((value, c) => setCellValue(other, { row: r, column: c }, value)),
  );
  const chart = sourceDrawing(sheet.id).chart;
  const read = () =>
    getSheetChartData(sheet, chart, createWorkbookEvaluator(session.workbook, sheet.id), (id) =>
      session.workbook.sheets.get(id),
    );
  return { session, sheet, other, chart, read };
}
describe("strict ordered chart source and authoritative derived data", () => {
  test("promotes original headers, categories and every hidden series without converting live refs to literals", () => {
    const f = fixture();
    f.sheet.hiddenRows = new Set([2]);
    f.sheet.hiddenColumns = new Set([2]);
    const source = createChartSourceFromRange(f.sheet.id, elementChart());
    expect(source.series).toHaveLength(2);
    expect(source.series[1]).toMatchObject({
      id: "series-2",
      colorIndex: 1,
      name: { kind: "cell", sheetId: f.sheet.id, cell: { row: 0, column: 2 } },
      values: { kind: "range", sheetId: f.sheet.id, range: vectorRange(2) },
    });
    expect(source.categories).toEqual({
      kind: "range",
      sheetId: f.sheet.id,
      range: vectorRange(0),
    });
    const rowSource = createChartSourceFromRange(f.sheet.id, {
      ...elementChart(),
      seriesBy: "rows",
    });
    expect(rowSource.series).toHaveLength(3);
    expect(rowSource.series[0]!.name).toEqual({
      kind: "cell",
      sheetId: f.sheet.id,
      cell: { row: 1, column: 0 },
    });
    expect(rowSource.categories).toEqual({
      kind: "range",
      sheetId: f.sheet.id,
      range: { start: { row: 0, column: 1 }, end: { row: 0, column: 2 } },
    });
  });
  test("headerless hidden promotion retains compressed generated categories and unfiltered source vectors", () => {
    const f = fixture();
    f.sheet.hiddenRows = new Set([2]);
    const rectangular = { ...elementChart(), headerColumn: false };
    const legacy = getSheetChartData(f.sheet, rectangular, createSheetEvaluator(f.sheet));
    const explicit = {
      ...rectangular,
      range: null,
      source: createChartSourceFromRange(f.sheet.id, rectangular),
    };
    const derived = getSheetChartData(f.sheet, explicit, createSheetEvaluator(f.sheet));
    expect(derived.categories).toEqual(legacy.categories);
    expect(derived.series.map(({ name, values }) => ({ name, values }))).toEqual(
      legacy.series.map(({ name, values }) => ({ name, values })),
    );
    expect(explicit.source.series).toHaveLength(3);
  });
  test("first promotion preserves visible headerless names and palette slots with hidden-first vectors", () => {
    const f = fixture();
    f.sheet.hiddenColumns = new Set([1]);
    const rectangular = { ...elementChart(), headerRow: false };
    const legacy = getSheetChartData(f.sheet, rectangular, createSheetEvaluator(f.sheet));
    const source = createChartSourceFromRange(f.sheet.id, rectangular, f.sheet);
    expect(source.series.map(({ id, colorIndex, name }) => ({ id, colorIndex, name }))).toEqual([
      { id: "series-1", colorIndex: 1, name: { kind: "literal", text: "2" } },
      { id: "series-2", colorIndex: 0, name: { kind: "literal", text: "1" } },
    ]);
    const explicit = { ...rectangular, range: null, source };
    const read = () => getSheetChartData(f.sheet, explicit, createSheetEvaluator(f.sheet));
    expect(read().series.map(({ name, values }) => ({ name, values }))).toEqual(
      legacy.series.map(({ name, values }) => ({ name, values })),
    );
    expect(read().series[0]).toMatchObject({ id: "series-2", colorIndex: 0 });
    source.series[1]!.name = { kind: "literal", text: "revised" };
    expect(read().series[0]).toMatchObject({ name: "revised", colorIndex: 0 });
    source.series.reverse();
    expect(read().series[0]).toMatchObject({ id: "series-2", colorIndex: 0 });
    f.sheet.hiddenColumns.clear();
    expect(read().series.map(({ id, colorIndex }) => ({ id, colorIndex }))).toEqual([
      { id: "series-2", colorIndex: 0 },
      { id: "series-1", colorIndex: 1 },
    ]);
    f.sheet.hiddenColumns.add(1);
    const headers = createChartSourceFromRange(f.sheet.id, elementChart(), f.sheet);
    expect(headers.series[1]).toMatchObject({
      colorIndex: 0,
      name: { kind: "cell", sheetId: f.sheet.id, cell: { row: 0, column: 2 } },
    });
    expect(
      createChartSourceFromRange(
        f.sheet.id,
        { ...rectangular, showHidden: true },
        f.sheet,
      ).series.map(({ colorIndex }) => colorIndex),
    ).toEqual([0, 1]);
    expect(() => createChartSourceFromRange(f.sheet.id, rectangular, f.other)).toThrow(
      /referenced sheet/,
    );
  });
  test("one-category row promotion treats hidden source rows as transverse series axes", () => {
    const f = fixture();
    f.sheet.hiddenRows = new Set([1]);
    const rectangular = {
      ...elementChart(),
      seriesBy: "rows" as const,
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
    };
    const legacy = getSheetChartData(f.sheet, rectangular, createSheetEvaluator(f.sheet));
    const source = createChartSourceFromRange(f.sheet.id, rectangular, f.sheet);
    const explicit = { ...rectangular, range: null, source };
    const read = () => getSheetChartData(f.sheet, explicit, createSheetEvaluator(f.sheet));
    expect(read().categories).toEqual(legacy.categories);
    expect(read().series.map(({ name, values }) => ({ name, values }))).toEqual(
      legacy.series.map(({ name, values }) => ({ name, values })),
    );
    expect(read().series[0]).toMatchObject({ id: "series-2", colorIndex: 0, values: [30] });
    expect(read().diagnostics).toEqual([{ code: "hidden", role: "values", seriesId: "series-1" }]);
    source.series[1]!.name = { kind: "literal", text: "revised" };
    source.series.reverse();
    expect(read().series[0]).toMatchObject({ colorIndex: 0, name: "revised", values: [30] });
    f.sheet.hiddenRows.clear();
    expect(read().series.map(({ colorIndex }) => colorIndex)).toEqual([0, 1]);
  });
  test.each(["columns", "rows"] as const)(
    "promotion reads hidden %s category-header stripes like the original rectangle",
    (seriesBy) => {
      const f = fixture();
      if (seriesBy === "columns") f.sheet.hiddenColumns = new Set([0]);
      else f.sheet.hiddenRows = new Set([0]);
      const rectangular = { ...elementChart(), seriesBy };
      const legacy = getSheetChartData(f.sheet, rectangular, createSheetEvaluator(f.sheet));
      const source = createChartSourceFromRange(f.sheet.id, rectangular, f.sheet);
      const explicit = getSheetChartData(
        f.sheet,
        { ...rectangular, range: null, source },
        createSheetEvaluator(f.sheet),
      );
      expect(explicit.categories).toEqual(legacy.categories);
      expect(explicit.series.map(({ name, values }) => ({ name, values }))).toEqual(
        legacy.series.map(({ name, values }) => ({ name, values })),
      );
      expect(
        explicit.diagnostics?.some(
          ({ role, code }) => role === "categories" && code === "hidden",
        ) ?? false,
      ).toBe(false);
    },
  );
  test("promotion preserves unsupported Boolean label gaps and raw records with text diagnostics", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 0, column: 1 }, true);
    setCellValue(f.sheet, { row: 1, column: 0 }, false);
    const rectangular = elementChart(),
      legacy = getSheetChartData(f.sheet, rectangular, createSheetEvaluator(f.sheet));
    const source = createChartSourceFromRange(f.sheet.id, rectangular, f.sheet);
    const explicit = getSheetChartData(
      f.sheet,
      { ...rectangular, range: null, source },
      createSheetEvaluator(f.sheet),
    );
    expect(explicit.categories).toEqual(legacy.categories);
    expect(explicit.series.map(({ name, values }) => ({ name, values }))).toEqual(
      legacy.series.map(({ name, values }) => ({ name, values })),
    );
    expect(explicit.records).toEqual(legacy.records);
    expect(explicit.diagnostics).toEqual([
      { code: "text", role: "name", seriesId: "series-1" },
      { code: "text", role: "categories", index: 0 },
    ]);
  });
  test("normalizes only bounded complete own data, finite literals, distinct IDs and isolated clones", () => {
    const input = seriesSource();
    const clone = normalizeChartSource(input);
    if (clone.series[0]!.values.kind !== "range") throw Error("Expected range");
    clone.series[0]!.values.range!.start.row = 2;
    expect(input.series[0]!.values).toEqual({
      kind: "range",
      sheetId: "source",
      range: vectorRange(1),
    });
    for (const value of [
      undefined,
      null,
      { ...input, kind: "formula" },
      { ...input, extra: true },
      { ...input, series: [input.series[0], input.series[0]] },
      { ...input, series: [{ ...input.series[0], colorIndex: -1 }] },
      {
        ...input,
        series: [{ ...input.series[0], values: { kind: "literal", values: [Infinity] } }],
      },
      {
        ...input,
        categories: {
          kind: "range",
          sheetId: "source",
          range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
        },
      },
      {
        ...input,
        series: Array.from({ length: 257 }, (_, index) => ({
          ...input.series[0],
          id: String(index),
        })),
      },
      {
        ...input,
        series: [{ ...input.series[0], values: { kind: "literal", values: Array(10000).fill(1) } }],
      },
    ])
      expect(() => normalizeChartSource(value)).toThrow();
    let calls = 0;
    const accessor = Object.defineProperty({ ...input }, "categories", {
      get: () => {
        calls++;
        return input.categories;
      },
    });
    expect(() => normalizeChartSource(accessor)).toThrow();
    const inherited = Object.create({ categories: input.categories }) as object;
    Object.assign(inherited, { kind: "series", series: input.series });
    expect(() => normalizeChartSource(inherited)).toThrow();
    expect(calls).toBe(0);
    const ownArray = [...input.series];
    Object.defineProperty(ownArray, "0", {
      get: () => {
        calls++;
        return input.series[0];
      },
    });
    expect(() => normalizeChartSource({ ...input, series: ownArray })).toThrow();
    expect(calls).toBe(0);
  });
  test("source presence is strict and mutually exclusive; legacy applicability remains repairable", () => {
    const chart = sourceDrawing().chart;
    for (const patch of [
      { range: vectorRange(1) },
      { pivotTableId: "p" },
      { dataCache: { categories: [], series: [], records: [] } },
      { type: "pie" },
      { source: undefined },
    ])
      expect(() => normalizeSheetChart({ ...chart, ...patch } as SheetChart)).toThrow();
    let calls = 0;
    const accessor = Object.defineProperty({ ...chart }, "source", {
      get: () => {
        calls++;
        return chart.source;
      },
    });
    expect(() => normalizeSheetChart(accessor)).toThrow();
    expect(calls).toBe(0);
    expect(() =>
      createChartSourceFromRange("source", {
        ...elementChart(),
        range: { start: { row: 0, column: 0 }, end: { row: 1_000_000, column: 1000 } },
      }),
    ).toThrow();
    expect(getChartSourceApplicability(chart)).toBe("editable");
    expect(getChartSourceApplicability({ ...elementChart(), range: null })).toBe("broken-range");
    expect(getChartSourceApplicability({ ...elementChart(), type: "pie" })).toBe(
      "unsupported-type",
    );
  });
  test("live cross-sheet names/categories/values and literal vectors retain stable ordering and palette", () => {
    const f = fixture(),
      source = f.chart.source!;
    source.categories = { kind: "range", sheetId: f.other.id, range: vectorRange(0) };
    source.series.push({
      id: "extra",
      colorIndex: 2,
      name: { kind: "cell", sheetId: f.other.id, cell: { row: 0, column: 1 } },
      values: { kind: "range", sheetId: f.other.id, range: vectorRange(1) },
    });
    expect(f.read()).toMatchObject({
      categories: ["red", "green", "blue"],
      series: [
        { id: "apple", colorIndex: 4, name: "apple", values: [10, 30, 50] },
        { id: "pear", colorIndex: 8, values: [20, 40, 60] },
        { id: "extra", colorIndex: 2, name: "extra", values: [15, 25, 35] },
      ],
    });
    source.series = [source.series[2]!, source.series[0]!, source.series[1]!];
    setCellValue(f.other, { row: 0, column: 1 }, "revised");
    setCellValue(f.other, { row: 2, column: 1 }, 99);
    setCellValue(f.other, { row: 2, column: 0 }, "lime");
    expect(f.read().categories).toEqual(["red", "lime", "blue"]);
    expect(f.read().series[0]).toMatchObject({
      id: "extra",
      colorIndex: 2,
      name: "revised",
      values: [15, 99, 35],
    });
    source.series[0]!.values = { kind: "literal", values: [0, 2, -4] };
    source.series[0]!.name = { kind: "literal", text: "bonus" };
    expect(f.read().series[0]).toMatchObject({ name: "bonus", values: [0, 2, -4] });
  });
  test("blank/text/error are distinct gaps and zero remains numeric; refs never fallback", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 1, column: 1 }, null);
    setCellValue(f.sheet, { row: 2, column: 1 }, "text");
    setCellContent(
      f.sheet,
      { row: 3, column: 1 },
      { kind: "error", error: { kind: "formula-error", code: "DIV0" } },
    );
    setCellValue(f.sheet, { row: 1, column: 2 }, 0);
    expect(f.read()).toMatchObject({
      series: [{ values: [null, null, null] }, { values: [0, 40, 60] }],
      diagnostics: [
        { code: "blank", role: "values", seriesId: "apple", index: 0 },
        { code: "text", role: "values", seriesId: "apple", index: 1 },
        { code: "error", role: "values", seriesId: "apple", index: 2 },
      ],
    });
    f.chart.source!.series[0]!.values = { kind: "range", sheetId: f.sheet.id, range: null };
    expect(f.read()).toEqual({
      categories: [],
      series: [],
      records: [],
      diagnostics: [{ code: "broken-reference", role: "values", seriesId: "apple" }],
    });
    f.chart.source!.series[0]!.values = { kind: "literal", values: [1, 2] };
    expect(f.read()).toMatchObject({
      categories: [],
      series: [],
      diagnostics: [{ code: "length-mismatch", role: "values", seriesId: "apple" }],
    });
  });
  test("one shared hidden ordinal mask pairs mixed row/column vectors; transverse-hidden values omit only their series", () => {
    const f = fixture();
    f.chart.source!.categories = { kind: "range", sheetId: f.other.id, range: vectorRange(0) };
    f.chart.source!.series[1]!.values = {
      kind: "range",
      sheetId: f.other.id,
      range: { start: { row: 5, column: 1 }, end: { row: 5, column: 3 } },
    };
    [21, 41, 61].forEach((value, index) =>
      setCellValue(f.other, { row: 5, column: 1 + index }, value),
    );
    f.sheet.hiddenRows = new Set([2]);
    expect(f.read()).toMatchObject({
      categories: ["red", "blue"],
      series: [{ values: [10, 50] }, { values: [21, 61] }],
    });
    f.other.hiddenColumns = new Set([3]);
    expect(f.read()).toMatchObject({
      categories: ["red"],
      series: [{ values: [10] }, { values: [21] }],
    });
    f.other.hiddenRows = new Set([5]);
    expect(f.read()).toMatchObject({
      categories: ["red", "blue"],
      series: [{ id: "apple", values: [10, 50] }],
      diagnostics: [{ code: "hidden", role: "values", seriesId: "pear" }],
    });
    f.other.hiddenColumns = new Set([0]);
    expect(f.read()).toMatchObject({
      categories: ["red", "blue"],
      series: [{ id: "apple", values: [10, 50] }],
      diagnostics: [{ code: "hidden", role: "values", seriesId: "pear" }],
    });
    f.chart.showHidden = true;
    expect(f.read().categories).toEqual(["red", "green", "blue"]);
  });
  test("zero-series valid; generated categories retain legacy visible numbering; missing resolver/evaluator reports broken refs", () => {
    const f = fixture();
    f.chart.source!.categories = { kind: "generated" };
    f.sheet.hiddenRows = new Set([2]);
    expect(f.read().categories).toEqual(["1", "2"]);
    f.chart.source!.series[0]!.values = {
      kind: "range",
      sheetId: f.other.id,
      range: vectorRange(1),
    };
    expect(getSheetChartData(f.sheet, f.chart, createSheetEvaluator(f.sheet))).toMatchObject({
      categories: [],
      diagnostics: [{ code: "broken-reference", role: "values", seriesId: "apple" }],
    });
    f.chart.source!.series = [];
    expect(normalizeSheetChart(f.chart).source!.series).toEqual([]);
    expect(f.read()).toEqual({ categories: [], series: [], records: [] });
  });
});
