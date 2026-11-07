// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { createChartOption } from "../../../modules/charts/chart-option";
import { displayedSeriesName } from "./chart-render-labels";

const chart: SheetChart = {
  type: "bubble",
  range: null,
  title: "Bubble",
  headerRow: true,
  headerColumn: false,
  seriesBy: "columns",
  legend: true,
  labels: false,
  stacked: false,
  showHidden: false,
  presentation: { palette: ["#123456", "#654321"] },
};
function data(names: string[], values: Array<Array<number | null>>): ChartData {
  return {
    categories: values[0]!.map((_, i) => `P${i + 1}`),
    records: [],
    series: names.map((name, i) => ({ name, values: values[i]! })),
  };
}
type BubbleSeries = {
  type: string;
  name: string;
  data: number[][];
  symbolSize: (value: number[]) => number;
  itemStyle: { color: string | { type: string; colorStops: Array<{ color: string }> } };
};
function series(option: ReturnType<typeof createChartOption>) {
  return option.series as unknown as BubbleSeries[];
}

describe("bubble chart options", () => {
  test.each([
    {
      names: ["Y1"],
      values: [[10, 20]],
      points: [
        [
          [1, 10, 1],
          [2, 20, 1],
        ],
      ],
      labels: ["Y1"],
    },
    {
      names: ["Y1", "Size1"],
      values: [
        [10, 20],
        [4, 9],
      ],
      points: [
        [
          [1, 10, 4],
          [2, 20, 9],
        ],
      ],
      labels: ["Y1"],
    },
    {
      names: ["Y1", "Size1", "Y2", "Size2"],
      values: [
        [10, 20],
        [4, 9],
        [30, 40],
        [16, 25],
      ],
      points: [
        [
          [1, 10, 4],
          [2, 20, 9],
        ],
        [
          [1, 30, 16],
          [2, 40, 25],
        ],
      ],
      labels: ["Y1", "Y2"],
    },
    {
      names: ["X", "Y1", "Size1"],
      values: [
        [2, 8],
        [10, 20],
        [4, 9],
      ],
      points: [
        [
          [2, 10, 4],
          [8, 20, 9],
        ],
      ],
      labels: ["Y1"],
    },
    {
      names: ["X", "Y1", "Size1", "Y2", "Size2"],
      values: [
        [2, 8],
        [10, 20],
        [4, 9],
        [30, 40],
        [16, 25],
      ],
      points: [
        [
          [2, 10, 4],
          [8, 20, 9],
        ],
        [
          [2, 30, 16],
          [8, 40, 25],
        ],
      ],
      labels: ["Y1", "Y2"],
    },
  ])(
    "pairs $names into bubbles with numeric axes and Y-only legend entries",
    ({ names, values, points, labels }) => {
      const source = data(names, values);
      const before = structuredClone(source);
      const option = createChartOption(chart, source, { width: 640, height: 400 });
      const plotted = series(option);
      expect(plotted.map((entry) => entry.type)).toEqual(labels.map(() => "scatter"));
      expect(plotted.map((entry) => entry.data)).toEqual(points);
      const xAxis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis;
      const yAxis = Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis;
      expect(xAxis?.type).toBe("value");
      expect(yAxis?.type).toBe("value");
      const legend = Array.isArray(option.legend) ? option.legend[0]! : option.legend!;
      expect(
        legend.data!.map((entry) =>
          displayedSeriesName(option, typeof entry === "string" ? entry : entry.name!),
        ),
      ).toEqual(labels);
      expect(source).toEqual(before);
    },
  );

  test("skips missing X/Y and nonpositive or missing sizes without shifting paired points", () => {
    const source = data(
      ["X", "Y", "Size"],
      [
        [1, 2, null, 4, 5, 6, 7, 8],
        [10, null, 30, 40, 50, 60, 70, 80],
        [4, 9, 16, 0, -1, null, null, 25],
      ],
    );
    expect(series(createChartOption(chart, source))[0]!.data).toEqual([
      [1, 10, 4],
      [8, 80, 25],
    ]);
  });

  test("bubble area scales with size using one scale across Y/size pairs", () => {
    const source = data(
      ["Y1", "Size1", "Y2", "Size2"],
      [
        [10, 20],
        [4, 16],
        [30, 40],
        [16, 64],
      ],
    );
    const [first, second] = series(createChartOption(chart, source));
    const small = first!.symbolSize(first!.data[0]!);
    const medium = first!.symbolSize(first!.data[1]!);
    const otherMedium = second!.symbolSize(second!.data[0]!);
    const large = second!.symbolSize(second!.data[1]!);
    expect(small).toBeGreaterThan(0);
    expect(medium).toBeCloseTo(otherMedium);
    expect(medium ** 2 / small ** 2).toBeCloseTo(4);
    expect(large ** 2 / medium ** 2).toBeCloseTo(4);
  });

  test("three-dimensional shading uses a radial fill without changing bubble coordinates or area scaling", () => {
    const source = data(
      ["Y", "Size"],
      [
        [10, 20],
        [4, 16],
      ],
    );
    const plain = series(createChartOption(chart, source))[0]!;
    const shaded = series(
      createChartOption(
        { ...chart, presentation: { ...chart.presentation, bubbleShading: true } },
        source,
      ),
    )[0]!;
    expect(plain.itemStyle.color).toBe("#123456");
    expect(shaded.itemStyle.color).toMatchObject({ type: "radial" });
    expect(
      (shaded.itemStyle.color as { colorStops: unknown[] }).colorStops.length,
    ).toBeGreaterThanOrEqual(2);
    expect(shaded.data).toEqual(plain.data);
    expect(shaded.symbolSize(shaded.data[0]!)).toBeCloseTo(plain.symbolSize(plain.data[0]!));
  });
});
