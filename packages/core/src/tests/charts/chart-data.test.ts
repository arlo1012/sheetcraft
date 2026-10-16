import { describe, expect, test } from "vitest";
import {
  getSheetChartData,
  normalizeChartDataCache,
  normalizeSheetChart,
  type SheetChart,
} from "../../sheet-charts.js";
import { createSheetEvaluator, getActiveSheet, setCellContent } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function chart(patch: Partial<SheetChart> = {}): SheetChart {
  return {
    type: "column",
    range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
    title: "Sales",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
    ...patch,
  };
}
function fixture() {
  const sheet = getActiveSheet(createTestWorkbookSession().workbook);
  const values = [
    ["Region", "Q1", "Q2"],
    ["East", 10, 20],
    ["West", 30, 40],
  ];
  values.forEach((row, r) =>
    row.forEach((value, c) =>
      setCellContent(sheet, { row: r, column: c }, { kind: "literal", value }),
    ),
  );
  const read = (patch: Partial<SheetChart> = {}) =>
    getSheetChartData(sheet, chart(patch), createSheetEvaluator(sheet));
  return { sheet, read };
}
describe("chart data", () => {
  test("independently controls row and column headers", () => {
    const f = fixture();
    expect(f.read({ headerRow: false }).series).toEqual([
      { rangeBand: { seriesBy: "columns", index: 1 }, name: "Series 1", values: [null, 10, 30] },
      { rangeBand: { seriesBy: "columns", index: 2 }, name: "Series 2", values: [null, 20, 40] },
    ]);
    expect(f.read({ headerColumn: false })).toMatchObject({
      categories: ["1", "2"],
      series: [
        { name: "Region", values: [null, null] },
        { name: "Q1", values: [10, 30] },
        { name: "Q2", values: [20, 40] },
      ],
    });
  });

  test("uses first row series names and first column categories", () => {
    expect(fixture().read()).toMatchObject({
      categories: ["East", "West"],
      series: [
        { name: "Q1", values: [10, 30] },
        { name: "Q2", values: [20, 40] },
      ],
    });
  });
  test("switches row series and column categories", () => {
    expect(fixture().read({ seriesBy: "rows" })).toMatchObject({
      categories: ["Q1", "Q2"],
      series: [
        { name: "East", values: [10, 20] },
        { name: "West", values: [30, 40] },
      ],
    });
  });
  test("uses numbered categories and series when headers are disabled", () => {
    const data = fixture().read({ headerRow: false, headerColumn: false });
    expect(data.categories).toEqual(["1", "2", "3"]);
    expect(data.series).toEqual([
      {
        rangeBand: { seriesBy: "columns", index: 0 },
        name: "Series 1",
        values: [null, null, null],
      },
      { rangeBand: { seriesBy: "columns", index: 1 }, name: "Series 2", values: [null, 10, 30] },
      { rangeBand: { seriesBy: "columns", index: 2 }, name: "Series 3", values: [null, 20, 40] },
    ]);
  });
  test.each([
    {
      headerRow: true,
      headerColumn: false,
      categories: ["Region", "Q1", "Q2"],
      series: [
        { name: "Series 1", values: [null, 10, 20] },
        { name: "Series 2", values: [null, 30, 40] },
      ],
    },
    {
      headerRow: false,
      headerColumn: true,
      categories: ["1", "2"],
      series: [
        { name: "Region", values: [null, null] },
        { name: "East", values: [10, 20] },
        { name: "West", values: [30, 40] },
      ],
    },
    {
      headerRow: false,
      headerColumn: false,
      categories: ["1", "2", "3"],
      series: [
        { name: "Series 1", values: [null, null, null] },
        { name: "Series 2", values: [null, 10, 20] },
        { name: "Series 3", values: [null, 30, 40] },
      ],
    },
  ])(
    "row series preserve headerRow=$headerRow/headerColumn=$headerColumn",
    ({ headerRow, headerColumn, categories, series }) => {
      expect(fixture().read({ seriesBy: "rows", headerRow, headerColumn })).toMatchObject({
        categories,
        series,
      });
    },
  );
  test("enabled blank labels stay blank and a headerless numeric one-cell source retains explicit direction", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 0, column: 1 }, null);
    setCellContent(f.sheet, { row: 1, column: 0 }, { kind: "literal", value: "" });
    expect(f.read().categories).toEqual(["", "West"]);
    expect(f.read().series[0]!.name).toBe("");
    const range = { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } };
    const columns = chart({ range, headerRow: false, headerColumn: false });
    const rows = chart({ ...columns, seriesBy: "rows" });
    expect(normalizeSheetChart(columns).seriesBy).toBe("columns");
    expect(normalizeSheetChart(rows).seriesBy).toBe("rows");
    expect(normalizeChartDataCache(f.read(columns))).toEqual(normalizeChartDataCache(f.read(rows)));
    expect(f.read(columns).series[0]!.rangeBand).toEqual({ seriesBy: "columns", index: 1 });
    expect(f.read(rows).series[0]!.rangeBand).toEqual({ seriesBy: "rows", index: 1 });
    expect(f.read(rows)).toMatchObject({
      categories: ["1"],
      series: [{ name: "Series 1", values: [10] }],
    });
  });
  test("omits hidden row and column data unless explicitly enabled", () => {
    const f = fixture();
    f.sheet.hiddenRows = new Set([1]);
    f.sheet.hiddenColumns = new Set([2]);
    expect(f.read()).toMatchObject({
      categories: ["West"],
      series: [{ name: "Q1", values: [30] }],
    });
    expect(f.read({ showHidden: true }).series).toHaveLength(2);
    expect(f.read({ showHidden: true }).categories).toEqual(["East", "West"]);
  });
  test("keeps text, blanks and formula errors as missing values instead of zero", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 1, column: 1 }, { kind: "literal", value: "10" });
    setCellContent(f.sheet, { row: 2, column: 1 }, null);
    setCellContent(
      f.sheet,
      { row: 1, column: 2 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: 0 });
    expect(f.read().series).toEqual([
      { rangeBand: { seriesBy: "columns", index: 1 }, name: "Q1", values: [null, null] },
      { rangeBand: { seriesBy: "columns", index: 2 }, name: "Q2", values: [null, 0] },
    ]);
  });
  test("validates the maximum source size and clones nested source coordinates", () => {
    const original = chart({
      range: { start: { row: 0, column: 0 }, end: { row: 99, column: 99 } },
    });
    const normalized = normalizeSheetChart(original);
    normalized.range!.start.row = 5;
    expect(original.range!.start.row).toBe(0);
    expect(() =>
      normalizeSheetChart(
        chart({ range: { start: { row: 0, column: 0 }, end: { row: 100, column: 99 } } }),
      ),
    ).toThrow(/10,000/);
    expect(fixture().read({ range: null })).toEqual({ categories: [], series: [], records: [] });
  });
});
