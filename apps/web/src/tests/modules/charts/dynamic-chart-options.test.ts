// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import type { EChartsOption } from "echarts";
import { getSheetChartData, type ChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  createWorkbook,
  createSheetEvaluator,
  getActiveSheet,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createChartOption } from "../../../modules/charts/chart-option";

const dimensions = { width: 480, height: 300 };
function chart(type: SheetChart["type"]): SheetChart {
  return {
    type,
    range: null,
    title: "Dynamic example",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: true,
    stacked: false,
    showHidden: false,
  };
}
function data(
  values: (number | null)[],
  categories = values.map((_, i) => `Step ${i + 1}`),
): ChartData {
  return { categories, series: [{ name: "Values", values }], records: [] };
}
function firstSeries<T>(option: EChartsOption): T {
  expect(Array.isArray(option.series)).toBe(true);
  return (option.series as unknown as T[])[0]!;
}
type Graphic = {
  type: string;
  shape?: { points?: number[][]; cx?: number; cy?: number; r?: number };
  style?: { text?: string };
  clipPath?: { type: string };
};
function graphics(option: EChartsOption) {
  return option.graphic as unknown as Graphic[];
}
type WaterfallSeries = {
  type: string;
  data: number[][];
  renderItem: (
    params: unknown,
    api: {
      value: (index: number) => number;
      coord: (value: number[]) => number[];
      size: (value: number[]) => number[];
    },
  ) => {
    children: {
      type: string;
      shape?: { x: number; y: number; width: number; height: number };
      style?: { fill: string };
    }[];
  };
};

describe("dynamic chart options", () => {
  test("uses a radius rose series and retains zero while excluding missing and negative slices", () => {
    const source = data([8, null, -2, 0], ["Rose A", "Missing", "Negative", "Zero"]);
    source.series.push({ name: "Unused second series", values: [100, 200, 300, 400] });
    const before = structuredClone(source);
    expect(createChartOption(chart("rose"), source, dimensions)).toMatchObject({
      series: [
        {
          type: "pie",
          roseType: "radius",
          label: { show: true },
          data: [
            { name: "Rose A", value: 8 },
            { name: "Zero", value: 0 },
          ],
        },
      ],
    });
    expect(source).toEqual(before);
  });

  test("creates funnel category/value pairs from the first series without changing source order or values", () => {
    const source = data(
      [100, 40, 20, null, -5, 0],
      ["Visits", "Qualified", "Won", "Missing", "Invalid", "Zero"],
    );
    source.series.push({ name: "Unused", values: [9, 8, 7, 6, 5, 4] });
    const before = structuredClone(source);
    expect(createChartOption(chart("funnel"), source, dimensions)).toMatchObject({
      series: [
        {
          type: "funnel",
          sort: "descending",
          label: { show: true },
          data: [
            { name: "Visits", value: 100 },
            { name: "Qualified", value: 40 },
            { name: "Won", value: 20 },
            { name: "Zero", value: 0 },
          ],
        },
      ],
    });
    expect(source).toEqual(before);
  });

  test.each(["gauge", "liquid"] as const)(
    "reads a percentage-formatted source cell as displayed percentage for %s",
    (type) => {
      const workbook = createWorkbook({ id: "dynamic-percent", sheetId: "data" });
      const sheet = getActiveSheet(workbook);
      for (const [row, column, value] of [
        [0, 0, "Metric"],
        [0, 1, "Value"],
        [1, 0, "Missing"],
        [2, 0, "Completion"],
        [2, 1, 0.425],
      ] as const)
        setCellContent(sheet, { row, column }, { kind: "literal", value });
      setCellStyle(
        sheet,
        { row: 2, column: 1 },
        { numberFormat: { kind: "percent", fractionDigits: 1 } },
      );
      const sourceChart = {
        ...chart(type),
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      };
      const source = getSheetChartData(sheet, sourceChart, createSheetEvaluator(sheet));
      const before = serializeWorkbook(workbook);
      expect(source.series[0]).toMatchObject({
        values: [null, 0.425],
        numberFormat: { kind: "percent" },
      });
      const option = createChartOption(sourceChart, source, dimensions);
      if (type === "gauge") {
        const series = firstSeries<{ data: unknown[]; detail: { formatter: () => string } }>(
          option,
        );
        expect(series.data).toEqual([{ value: 42.5, name: "Completion" }]);
        expect(series.detail.formatter()).toBe("42.5%");
      } else {
        const expected = createChartOption(
          chart(type),
          data([null, 42.5], source.categories),
          dimensions,
        );
        expect(graphics(option).find((entry) => entry.type === "text")?.style?.text).toBe("42.5%");
        expect(graphics(option).find((entry) => entry.type === "polygon")).toEqual(
          graphics(expected).find((entry) => entry.type === "polygon"),
        );
        expect(graphics(option).find((entry) => entry.type === "polygon")?.clipPath?.type).toBe(
          "circle",
        );
      }
      expect(serializeWorkbook(workbook)).toEqual(before);
      expect(source.series[0]!.values).toEqual([null, 0.425]);
    },
  );

  test.each(["gauge", "liquid"] as const)("rejects percentages outside 0 to 100 for %s", (type) => {
    for (const value of [-1, 101])
      expect(() => createChartOption(chart(type), data([value]), dimensions)).toThrow();
    for (const value of [-0.01, 1.01]) {
      const source = data([value]);
      source.series[0]!.numberFormat = { kind: "percent", fractionDigits: 0 };
      expect(() => createChartOption(chart(type), source, dimensions)).toThrow();
    }
  });

  test("waterfall changes retain cumulative endpoints while crossing zero in both directions", () => {
    const source = data([5, -12, 10]);
    const before = structuredClone(source);
    const series = firstSeries<WaterfallSeries>(
      createChartOption(chart("waterfall"), source, dimensions),
    );
    expect(series.type).toBe("custom");
    expect(series.data).toEqual([
      [0, 0, 5, 5],
      [1, 5, -7, -12],
      [2, -7, 3, 10],
    ]);
    const rectangles = series.data.map((step) =>
      series
        .renderItem(
          {},
          {
            value: (index) => step[index]!,
            coord: ([index, value]) => [index! * 100, 100 - value! * 10],
            size: () => [100, 0],
          },
        )
        .children.find((entry) => entry.type === "rect")!,
    );
    const expected = [
      { x: -28, y: 50, width: 56, height: 50 },
      { x: 72, y: 50, width: 56, height: 120 },
      { x: 172, y: 70, width: 56, height: 100 },
    ];
    rectangles.forEach((entry, index) => {
      for (const field of ["x", "y", "width", "height"] as const)
        expect(entry.shape![field]).toBeCloseTo(expected[index]![field]);
    });
    expect(rectangles[0]!.style!.fill).toBe(rectangles[2]!.style!.fill);
    expect(rectangles[1]!.style!.fill).not.toBe(rectangles[0]!.style!.fill);
    expect(source).toEqual(before);
  });

  test("waterfall missing values keep their category gaps without resetting the running total", () => {
    const series = firstSeries<WaterfallSeries>(
      createChartOption(chart("waterfall"), data([4, null, -6, 3]), dimensions),
    );
    expect(series.data).toEqual([
      [0, 0, 4, 4],
      [2, 4, -2, -6],
      [3, -2, 1, 3],
    ]);
  });

  test.each([
    { values: [8, 5, 6], reason: "intersection exceeds the smaller set" },
    { values: [8, 5, -1], reason: "negative intersection" },
    { values: [8, 5, null], reason: "missing intersection" },
    { values: [8, 5, NaN], reason: "non-finite intersection" },
    { values: [8, 5, Infinity], reason: "infinite intersection" },
    { values: [-1, 5, 0], reason: "negative set size" },
  ])("rejects a Venn source with $reason", ({ values }) => {
    expect(() => createChartOption(chart("venn"), data(values), dimensions)).toThrow();
  });

  test.each([0, 5])("accepts a Venn intersection at the legal boundary %s", (intersection) => {
    const option = createChartOption(
      chart("venn"),
      data([8, 5, intersection], ["Set A", "Set B", "Intersection"]),
      dimensions,
    );
    const circles = graphics(option).filter((entry) => entry.type === "circle");
    expect(circles).toHaveLength(2);
    for (const circle of circles) {
      expect([circle.shape!.cx, circle.shape!.cy, circle.shape!.r].every(Number.isFinite)).toBe(
        true,
      );
      expect(circle.shape!.r).toBeGreaterThan(0);
    }
  });
});
