// 未执行：按用户约定仅编写回归测试，待插入与打印功能完成后统一运行。
import { describe, expect, test } from "vitest";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import type { StockStyle } from "@sheetcraft/core/chart-presentation";
import { createChartOption } from "../../../modules/charts/chart-option";

const chart: SheetChart = {
  type: "stock",
  range: null,
  title: "Prices",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: false,
  stacked: false,
  showHidden: false,
};
const categories = ["46001", "46002", "46005", "46006"];
const inputs = [
  {
    style: "hlc",
    names: ["High", "Low", "Close"],
    values: [
      [15, 16, 17, 18],
      [5, 6, 7, 8],
      [10, 11, 12, 13],
    ],
  },
  {
    style: "ohlc",
    names: ["Open", "High", "Low", "Close"],
    values: [
      [8, 13, 12, 11],
      [15, 16, 17, 18],
      [5, 6, 7, 8],
      [10, 11, 12, 13],
    ],
  },
  {
    style: "vhlc",
    names: ["Volume", "High", "Low", "Close"],
    values: [
      [100, 200, 300, 400],
      [15, 16, 17, 18],
      [5, 6, 7, 8],
      [10, 11, 12, 13],
    ],
  },
  {
    style: "vohlc",
    names: ["Volume", "Open", "High", "Low", "Close"],
    values: [
      [100, 200, 300, 400],
      [8, 13, 12, 11],
      [15, 16, 17, 18],
      [5, 6, 7, 8],
      [10, 11, 12, 13],
    ],
  },
] satisfies Array<{ style: StockStyle; names: string[]; values: number[][] }>;
function source(names: string[], values: Array<Array<number | null>>): ChartData {
  return {
    categories: [...categories],
    records: [],
    series: names.map((name, index) => ({ name, values: [...values[index]!] })),
  };
}
function option(style: StockStyle, data: ChartData) {
  return createChartOption({ ...chart, presentation: { stockStyle: style } }, data, {
    width: 640,
    height: 400,
  });
}
function axes(value: ReturnType<typeof option>["yAxis"]) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

type StockNode = {
  type: string;
  shape?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    x1?: number;
    x2?: number;
    y1?: number;
    y2?: number;
  };
  style?: { fill?: string; stroke?: string };
  children?: StockNode[];
};
type StockSeries = {
  type: string;
  data: Array<Array<number | "-">>;
  yAxisIndex?: number;
  renderItem?: (
    params: { dataIndex: number },
    api: { coord: (value: number[]) => number[]; size: (value: number[]) => number[] },
  ) => StockNode | undefined;
};
function plotted(rendered: ReturnType<typeof option>) {
  return rendered.series as unknown as StockSeries[];
}
function paint(series: StockSeries, dataIndex: number) {
  return series.renderItem?.(
    { dataIndex },
    { coord: (value) => [value[0]!, 100 - value[1]!], size: () => [20, 0] },
  );
}
function nodes(node: StockNode | undefined): StockNode[] {
  return node ? [node, ...(node.children ?? []).flatMap(nodes)] : [];
}

describe("stock chart render options", () => {
  test.each(inputs)(
    "$style consumes the required price bands and keeps the source unchanged",
    ({ style, names, values }) => {
      const data = source(names, values);
      const before = structuredClone(data);
      const rendered = option(style, data);
      const plotted = Array.isArray(rendered.series) ? rendered.series : [rendered.series];
      expect(plotted.length).toBeGreaterThan(0);
      expect(
        plotted.some((series) => series?.type === "custom" || series?.type === "candlestick"),
      ).toBe(true);
      const x = Array.isArray(rendered.xAxis) ? rendered.xAxis[0] : rendered.xAxis;
      expect(x?.type).toBe("category");
      expect(x && "data" in x ? x.data : undefined).toEqual(categories);
      expect(data).toEqual(before);
    },
  );

  test.each(inputs)(
    "$style rejects missing and extra physical series",
    ({ style, names, values }) => {
      expect(() => option(style, source(names.slice(0, -1), values.slice(0, -1)))).toThrow();
      expect(() => option(style, source([...names, "Extra"], [...values, [1, 2, 3, 4]]))).toThrow();
    },
  );

  test.each(inputs.filter((input) => input.style.startsWith("v")))(
    "$style puts volume on the left and prices on the right in the same plot",
    ({ style, names, values }) => {
      const rendered = option(style, source(names, values));
      const y = axes(rendered.yAxis);
      expect(y).toHaveLength(2);
      expect(y[0]).toMatchObject({ type: "value", position: "left" });
      expect(y[1]).toMatchObject({ type: "value", position: "right" });
      const plotted = Array.isArray(rendered.series) ? rendered.series : [rendered.series];
      expect(
        plotted.some(
          (series) =>
            (series?.type === "bar" || series?.type === "custom") && series.yAxisIndex === 0,
        ),
      ).toBe(true);
      expect(plotted.some((series) => series?.type === "custom" && series.yAxisIndex === 1)).toBe(
        true,
      );
      expect(Array.isArray(rendered.grid) ? rendered.grid.length : 1).toBe(1);
    },
  );

  test.each([
    { low: 100, high: 103, min: 98.5, max: 103.5, interval: 0.5 },
    { low: 84, high: 100, min: 75, max: 105, interval: 5 },
    { low: 10, high: 20, min: 0, max: 25, interval: 5 },
    { low: -103, high: -100, min: -103.5, max: -98.5, interval: 0.5 },
  ])(
    "HLC automatic price ticks for $low..$high match the WPS sample",
    ({ low, high, min, max, interval }) => {
      const close = (high + low) / 2;
      const data = source(
        ["High", "Low", "Close"],
        [
          [high, high, high, high],
          [low, low, low, low],
          [close, close, close, close],
        ],
      );
      expect(axes(option("hlc", data).yAxis)[0]).toMatchObject({ min, max, interval });
    },
  );

  test("VHLC volume reaches 450 in steps of 50 when its maximum is 400", () => {
    const input = inputs[2]!;
    const y = axes(option("vhlc", source(input.names, input.values)).yAxis);
    expect(y[0]).toMatchObject({ position: "left", min: 0, max: 450, interval: 50 });
  });

  test.each(["hlc", "vhlc"] as const)(
    "%s all-zero series keep a usable 0..1 automatic scale",
    (style) => {
      const input = inputs.find((entry) => entry.style === style)!;
      const zeroes = input.values.map(() => [0, 0, 0, 0]);
      for (const axis of axes(option(style, source(input.names, zeroes)).yAxis))
        expect(axis).toMatchObject({ min: 0, max: 1, interval: 0.1 });
    },
  );

  test("date-formatted categories preserve their actual calendar spacing", () => {
    const base = inputs[0]!;
    const data: ChartData = {
      ...source(base.names, base.values),
      stockDateAxis: {
        values: [46001, 46002, 46005, 46006],
        format: { kind: "date", code: "yyyy-mm-dd" },
        dateSystem: "1900",
      },
    };
    const rendered = option("hlc", data);
    const x = Array.isArray(rendered.xAxis) ? rendered.xAxis[0] : rendered.xAxis;
    expect(x?.type).toBe("time");
    expect(x && "data" in x ? x.data : undefined).toBeUndefined();
    const points = plotted(rendered)[0]!.data;
    const differences = points
      .slice(1)
      .map((point, index) => Number(point[0]) - Number(points[index]![0]));
    expect(differences).toEqual([86_400_000, 3 * 86_400_000, 86_400_000]);
  });

  test("HLC draws the high-low stem and a close tick directed to the right", () => {
    const input = inputs[0]!;
    const result = plotted(option("hlc", source(input.names, input.values)));
    const stem = nodes(paint(result[0]!, 0)).find((node) => node.type === "line")!;
    expect(stem.shape).toMatchObject({ x1: 0, x2: 0, y1: 95, y2: 85 });
    expect(stem.style?.stroke).toBeDefined();
    const close = nodes(paint(result[2]!, 0)).find((node) => node.type === "line")!;
    expect(close.shape?.x1).toBe(0);
    expect(close.shape?.x2).toBeGreaterThan(0);
    expect(close.shape?.y1).toBe(90);
    expect(close.shape?.y2).toBe(90);
  });

  test("a missing high still draws the stem through the remaining low and close prices", () => {
    const input = inputs[0]!;
    const data = source(input.names, input.values);
    data.series[0]!.values[0] = null;
    const result = plotted(option("hlc", data));
    expect(nodes(paint(result[0]!, 0)).find((node) => node.type === "line")?.shape).toMatchObject({
      y1: 95,
      y2: 90,
    });
    expect(nodes(paint(result[2]!, 0)).some((node) => node.type === "line")).toBe(true);
  });

  test("OHLC paints rising and falling bodies, equality as a line, and missing endpoints without a body", () => {
    const input = inputs[1]!;
    const data = source(input.names, input.values);
    const result = plotted(option("ohlc", data));
    const rising = nodes(paint(result[3]!, 0)).find((node) => node.type === "rect")!;
    const falling = nodes(paint(result[3]!, 1)).find((node) => node.type === "rect")!;
    expect(rising.shape).toMatchObject({ y: 90, height: 2 });
    expect(falling.shape).toMatchObject({ y: 87, height: 2 });
    expect(rising.style?.fill).not.toBe(falling.style?.fill);
    expect(nodes(paint(result[3]!, 2)).filter((node) => node.type === "rect")).toHaveLength(0);
    const equal = nodes(paint(result[3]!, 2)).find((node) => node.type === "line")!;
    expect(equal.shape?.y1).toBe(equal.shape?.y2);
    expect(equal.shape!.x2!).toBeGreaterThan(equal.shape!.x1!);

    data.series[0]!.values[0] = null;
    data.series[3]!.values[1] = null;
    const gaps = plotted(option("ohlc", data));
    expect(nodes(paint(gaps[3]!, 0)).filter((node) => node.type === "rect")).toHaveLength(0);
    expect(nodes(paint(gaps[3]!, 1)).filter((node) => node.type === "rect")).toHaveLength(0);
    expect(nodes(paint(gaps[1]!, 0)).some((node) => node.type === "line")).toBe(true);
    expect(nodes(paint(gaps[1]!, 1)).some((node) => node.type === "line")).toBe(true);
  });

  test("the price stem spans all existing price fields even when supplied high and low are reversed", () => {
    const input = inputs[1]!;
    const data = source(input.names, input.values);
    [25, 10, 30, 20].forEach((value, index) => {
      data.series[index]!.values[0] = value;
    });
    const stem = nodes(paint(plotted(option("ohlc", data))[1]!, 0)).find(
      (node) => node.type === "line",
    )!;
    expect(stem.shape).toMatchObject({ y1: 90, y2: 70 });
  });

  test("a missing volume does not remove the corresponding price stem", () => {
    const input = inputs[2]!;
    const data = source(input.names, input.values);
    data.series[0]!.values[0] = null;
    const result = plotted(option("vhlc", data));
    expect(nodes(paint(result[0]!, 0)).filter((node) => node.type === "rect")).toHaveLength(0);
    expect(nodes(paint(result[1]!, 0)).some((node) => node.type === "line")).toBe(true);
    expect(nodes(paint(result[0]!, 1)).find((node) => node.type === "rect")?.shape).toMatchObject({
      y: -100,
      height: 200,
    });
  });
});
