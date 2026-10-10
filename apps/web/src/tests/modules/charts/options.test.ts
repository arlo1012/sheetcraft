import { describe, expect, test } from "vitest";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { createChartOption } from "../../../modules/charts/chart-option";
const chart: SheetChart = {
  type: "column",
  range: null,
  title: "Sales",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: false,
  stacked: false,
  showHidden: false,
};
const data: ChartData = {
  categories: ["A", "B", "C"],
  series: [{ name: "Sales", values: [2, null, 0] }],
  records: [],
};
describe("chart options", () => {
  test("renders standard column data without filling missing values with zero", () => {
    expect(createChartOption(chart, data)).toMatchObject({
      title: { text: "Sales" },
      xAxis: { type: "category", data: data.categories },
      yAxis: { type: "value" },
      series: [{ type: "bar", name: "Sales", data: [2, null, 0] }],
    });
  });
  test("retains blank/duplicate labels and all-null series without inventing names or zero points", () => {
    expect(
      createChartOption(chart, {
        categories: ["", "same", "same"],
        series: [
          { name: "", values: [null, null, null] },
          { name: "", values: [0, null, -5] },
        ],
        records: [],
      }),
    ).toMatchObject({
      xAxis: { data: ["", "same", "same"] },
      series: [
        { name: "", data: [null, null, null] },
        { name: "", data: [0, null, -5] },
      ],
    });
  });
  test("preserves missing line points and disables connections across gaps", () => {
    expect(createChartOption({ ...chart, type: "line" }, data)).toMatchObject({
      series: [{ type: "line", data: [2, null, 0], connectNulls: false }],
    });
  });
  test("pairs scatter values with the first numeric series as X and omits incomplete pairs", () => {
    const xy = {
      ...data,
      series: [
        { name: "X", values: [1, null, 3] },
        { name: "Y", values: [10, 20, null] },
        { name: "Z", values: [0, 4, 5] },
      ],
    };
    expect(createChartOption({ ...chart, type: "scatter" }, xy)).toMatchObject({
      xAxis: { type: "value" },
      series: [
        { type: "scatter", name: "Y", data: [[1, 10]] },
        {
          type: "scatter",
          name: "Z",
          data: [
            [1, 0],
            [3, 5],
          ],
        },
      ],
    });
  });
  test("omits negative and missing pie slices while retaining zero", () => {
    expect(
      createChartOption(
        { ...chart, type: "pie" },
        { ...data, series: [{ name: "Sales", values: [-2, null, 0] }] },
      ),
    ).toMatchObject({ series: [{ type: "pie", data: [{ name: "C", value: 0 }] }] });
  });
  test("rejects cyclic Sankey links and preserves a valid directed graph", () => {
    expect(() =>
      createChartOption(
        { ...chart, type: "sankey" },
        {
          ...data,
          records: [
            ["A", "B", 2],
            ["B", "C", 3],
            ["C", "A", 1],
          ],
        },
      ),
    ).toThrow(/cycle/);
    expect(
      createChartOption(
        { ...chart, type: "sankey" },
        {
          ...data,
          records: [
            ["A", "B", 2],
            ["B", "C", 3],
          ],
        },
      ),
    ).toMatchObject({
      series: [
        {
          type: "sankey",
          links: [
            { source: "A", target: "B", value: 2 },
            { source: "B", target: "C", value: 3 },
          ],
        },
      ],
    });
  });
});
