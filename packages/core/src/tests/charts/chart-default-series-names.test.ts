import { describe, expect, test } from "vitest";
import { createChartSourceFromRange } from "../../chart-source.js";
import { getSheetChartData, type SheetChart } from "../../sheet-charts.js";
import { createSheetEvaluator, getActiveSheet, setCellValue } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
function fixture() {
  const sheet = getActiveSheet(createTestWorkbookSession().workbook);
  [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ].forEach((row, r) =>
    row.forEach((value, column) => setCellValue(sheet, { row: r, column }, value)),
  );
  const chart: SheetChart = {
    type: "column",
    range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
    title: "Chart Title",
    headerRow: false,
    headerColumn: false,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
  };
  const read = (value = chart) => getSheetChartData(sheet, value, createSheetEvaluator(sheet));
  return { sheet, chart, read };
}
describe("default headerless chart series names", () => {
  test.each(["columns", "rows"] as const)(
    "%s use explicit Series names while categories remain ordinal",
    (seriesBy) => {
      const f = fixture();
      f.chart.seriesBy = seriesBy;
      expect(f.read().series.map((s) => s.name)).toEqual(["Series 1", "Series 2", "Series 3"]);
      expect(f.read().categories).toEqual(["1", "2", "3"]);
    },
  );
  test.each(["columns", "rows"] as const)("%s preserve real numeric header names", (seriesBy) => {
    const f = fixture();
    f.chart.seriesBy = seriesBy;
    f.chart.headerRow = seriesBy === "columns";
    f.chart.headerColumn = seriesBy === "rows";
    expect(f.read().series.map((s) => s.name)).toEqual(
      seriesBy === "columns" ? ["1", "2", "3"] : ["1", "4", "7"],
    );
  });
  test.each(["columns", "rows"] as const)(
    "%s promotion and dynamic explicit source edits preserve names",
    (seriesBy) => {
      const f = fixture();
      f.chart.seriesBy = seriesBy;
      const source = createChartSourceFromRange(f.sheet.id, f.chart, f.sheet);
      const promoted = { ...f.chart, range: null, source };
      expect(f.read(promoted).series.map((s) => s.name)).toEqual(
        f.read().series.map((s) => s.name),
      );
      source.series.splice(0, 1);
      expect(f.read(promoted).series.map((s) => s.name)).toEqual(["Series 2", "Series 3"]);
      source.series.push({
        id: "user-added",
        colorIndex: 3,
        name: { kind: "literal", text: "1" },
        values: { kind: "literal", values: [10, 20, 30] },
      });
      expect(f.read(promoted).series.map((s) => s.name)).toEqual(["Series 2", "Series 3", "1"]);
    },
  );
  test("range expansion and shrink regenerate only implicit names", () => {
    const f = fixture();
    f.chart.range!.end.column = 0;
    expect(f.read().series.map((s) => s.name)).toEqual(["Series 1"]);
    f.chart.range!.end.column = 2;
    expect(f.read().series.map((s) => s.name)).toEqual(["Series 1", "Series 2", "Series 3"]);
    f.chart.range!.end.column = 1;
    expect(f.read().series.map((s) => s.name)).toEqual(["Series 1", "Series 2"]);
  });
});
