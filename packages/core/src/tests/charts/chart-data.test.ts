import { describe, expect, test } from "vitest";
import { getSheetChartData, normalizeSheetChart, type SheetChart } from "../../sheet-charts.js";
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
      { name: "1", values: [null, 10, 30] },
      { name: "2", values: [null, 20, 40] },
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
      { name: "1", values: [null, null, null] },
      { name: "2", values: [null, 10, 30] },
      { name: "3", values: [null, 20, 40] },
    ]);
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
      { name: "Q1", values: [null, null] },
      { name: "Q2", values: [null, 0] },
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
