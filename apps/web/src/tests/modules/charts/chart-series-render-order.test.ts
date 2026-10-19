// @vitest-environment node
import { expect, test } from "vitest";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { createChartOption } from "../../../modules/charts/chart-option";
import { init } from "../../../modules/charts/chart-runtime";
import { getChartFormatClickTarget } from "../../../modules/charts/chart-format-selection";
import { chartSeriesSlotIndex } from "../../../modules/charts/chart-series-render-order";

const chart: SheetChart = {
  type: "bar",
  range: { start: { row: 0, column: 0 }, end: { row: 3, column: 3 } },
  title: "",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: true,
  stacked: false,
  showHidden: false,
};
const data: ChartData = {
  categories: ["east", "north", "south"],
  records: [],
  series: [
    {
      name: "apple",
      colorIndex: 0,
      rangeBand: { seriesBy: "columns", index: 1 },
      values: [60, -100, 120],
    },
    {
      name: "pear",
      colorIndex: 1,
      rangeBand: { seriesBy: "columns", index: 2 },
      values: [70, 80, 90],
    },
    {
      name: "third",
      colorIndex: 2,
      rangeBand: { seriesBy: "columns", index: 3 },
      values: [50, 60, 70],
    },
  ],
};
test.each([data.series, [data.series[2]!, data.series[0]!], [data.series[1]!]])(
  "grouped bars follow WPS bottom-to-top source slots with stable values, paint and click targets",
  (...entries) => {
    const source = { ...data, series: entries };
    const before = structuredClone(source);
    const option = createChartOption(chart, source, { width: 640, height: 400 });
    const instance = init(null, undefined, { renderer: "svg", ssr: true, width: 640, height: 400 });
    try {
      instance.setOption(option);
      const model = (
        instance as unknown as {
          getModel(): {
            getSeries(): Array<{
              getData(): {
                getItemLayout(index: number): { y: number };
                getRawDataItem(index: number): unknown;
                getVisual(key: string): { fill: string };
              };
            }>;
          };
        }
      ).getModel();
      const rendered = model.getSeries();
      for (let index = 0; index < entries.length; index++) {
        const sourceIndex = chartSeriesSlotIndex(chart, entries.length, index);
        const expected = entries[sourceIndex]!;
        expect(rendered[index]!.getData().getRawDataItem(0)).toBe(expected.values[0]);
        expect(rendered[index]!.getData().getVisual("style").fill).toBe(
          ["#2563eb", "#16a34a", "#f59e0b"][expected.colorIndex!],
        );
        expect(
          getChartFormatClickTarget({ componentType: "series", seriesIndex: index }, chart, source),
        ).toMatchObject({ kind: "series", rangeBand: expected.rangeBand });
        if (index > 0)
          for (const category of [0, 1, 2])
            expect(rendered[index]!.getData().getItemLayout(category).y).toBeGreaterThan(
              rendered[index - 1]!.getData().getItemLayout(category).y,
            );
      }
      expect(instance.renderToSVGString()).toContain("east");
      expect(source).toEqual(before);
    } finally {
      instance.dispose();
    }
  },
);
test.each([
  { type: "column" },
  { type: "line" },
  { stacked: true },
  { format: { bar: { overlap: 20 } } },
  { stacked: true, presentation: { percentStacked: true } },
  { format: { categoryAxis: { reverse: true } } },
  { format: { series: [{ id: "secondary", axis: "secondary" }] } },
] as Partial<SheetChart>[])(
  "preserves existing slot order outside ordinary grouped bars %j",
  (change) => {
    const next = { ...chart, ...change };
    const option = createChartOption(next, data);
    if (!change.presentation?.percentStacked)
      expect(
        Array.isArray(option.series) &&
          option.series.map((series) =>
            series.type === "bar" || series.type === "line" ? series.data : [],
          ),
      ).toEqual(data.series.map((series) => series.values));
    const reference = createChartOption({ ...chart, type: "column" }, data);
    expect(Array.isArray(option.series) && option.series.map((s) => s.name)).toEqual(
      Array.isArray(reference.series) && reference.series.map((s) => s.name),
    );
    expect(chartSeriesSlotIndex(next, 3, 0)).toBe(0);
  },
);
test("invalid event indices cannot select a series", () => {
  for (const index of [-1, 3, 0.5, NaN]) expect(chartSeriesSlotIndex(chart, 3, index)).toBe(-1);
});
