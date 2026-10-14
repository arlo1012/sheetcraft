import { describe, expect, test } from "vitest";
import type {
  EChartsOption,
  SeriesOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import type { ChartFormatSettings, ChartValueAxisFormat } from "@sheetcraft/core/chart-format";
import type { ChartData, ChartSeries, SheetChart } from "@sheetcraft/core/sheet-charts";
import type { CellNumberFormat } from "@sheetcraft/core/style";
import { init, type EChartsType } from "../../../modules/charts/chart-runtime";
import { createChartOption } from "../../../modules/charts/chart-option";
import {
  applyChartCommonFormat,
  chartBarGapRatios,
  resolveChartAxisIntervals,
} from "../../../modules/charts/chart-format-render";

type FixtureSeries = Omit<ChartSeries, "values"> & { values: readonly (number | null)[] };
type AxisOption = XAXisComponentOption | YAXisComponentOption;
type Rect = { x: number; y: number; width: number; height: number };
const dimensions = { width: 480, height: 300 };
const chart: SheetChart = {
  type: "column",
  range: null,
  title: "",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: false,
  labels: false,
  stacked: false,
  showHidden: false,
};

/** Complete, detached inputs catch renderer mutation without widening ChartData. */
function frozenData(
  entries: readonly FixtureSeries[],
  categories: readonly string[] = ["Alpha", "Beta"],
): ChartData {
  const data: ChartData = {
    categories: [...categories],
    series: entries.map((entry) => ({
      ...entry,
      values: [...entry.values],
      ...(entry.numberFormat ? { numberFormat: { ...entry.numberFormat } } : {}),
    })),
    records: [],
    diagnostics: [],
  };
  for (const entry of data.series) {
    Object.freeze(entry.values);
    if (entry.numberFormat) Object.freeze(entry.numberFormat);
    Object.freeze(entry);
  }
  Object.freeze(data.categories);
  Object.freeze(data.series);
  Object.freeze(data.records);
  Object.freeze(data.diagnostics);
  return Object.freeze(data);
}

const data = frozenData([
  { id: "a", colorIndex: 0, name: "Duplicate", values: [40, 70] },
  { id: "b", colorIndex: 1, name: "Duplicate", values: [60, 90] },
]);

function sourceChart(entries: readonly FixtureSeries[], changes: Partial<SheetChart>): SheetChart {
  return {
    ...chart,
    source: {
      kind: "series",
      categories: { kind: "generated" },
      series: entries.map((entry, index) => ({
        id: entry.id ?? `series-${index}`,
        colorIndex: entry.colorIndex ?? index,
        name: { kind: "literal", text: entry.name },
        values: {
          kind: "literal",
          values: entry.values.filter((value): value is number => value !== null),
        },
      })),
    },
    ...changes,
  };
}

function axes(option: EChartsOption, dimension: "xAxis" | "yAxis"): AxisOption[] {
  const entries = option[dimension];
  return entries ? (Array.isArray(entries) ? entries : [entries]) : [];
}

function axis(option: EChartsOption, dimension: "xAxis" | "yAxis", index = 0): AxisOption {
  const entry = axes(option, dimension)[index];
  if (!entry) throw new Error(`Missing ${dimension} ${index}.`);
  return entry;
}

function series(option: EChartsOption): SeriesOption[] {
  const entries = option.series;
  return entries ? (Array.isArray(entries) ? entries : [entries]) : [];
}

function axisLabel(option: AxisOption, value: number): string {
  if (option.type !== "value") throw new Error("Expected a value axis.");
  const formatter = option.axisLabel?.formatter;
  if (typeof formatter !== "function") throw new Error("Missing numeric label formatter.");
  return formatter(value, 0, null);
}

function render(option: EChartsOption, inspect: (instance: EChartsType, svg: Document) => void) {
  const instance = init(null, undefined, { renderer: "svg", ssr: true, ...dimensions });
  try {
    instance.setOption(option);
    const markup = instance.renderToSVGString();
    expect(markup).toContain("<svg");
    expect(markup).not.toMatch(/(?:NaN|Infinity)/);
    // happy-dom's XML parser does not admit ECharts' CSS CDATA; HTML preserves SVG nodes.
    inspect(instance, new DOMParser().parseFromString(markup, "text/html"));
  } finally {
    instance.dispose();
  }
}

function renderedRects(instance: EChartsType, fill: string): Rect[] {
  return instance
    .getZr()
    .storage.getDisplayList(true)
    .filter((element) => element.type === "rect" && element.style.fill === fill)
    .map((element) => {
      const rect = element.getBoundingRect().clone();
      const transform = element.getComputedTransform();
      if (transform) rect.applyTransform(transform);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
}

function textRect(instance: EChartsType, text: string): Rect {
  const element = instance
    .getZr()
    .storage.getDisplayList(true)
    .find((entry) => entry.type === "tspan" && entry.style.text === text);
  if (!element) throw new Error(`Missing rendered text ${text}.`);
  const rect = element.getBoundingRect().clone();
  const transform = element.getComputedTransform();
  if (transform) rect.applyTransform(transform);
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function firstRect(rectangles: readonly Rect[]): Rect {
  const rect = rectangles[0];
  if (!rect) throw new Error("Missing rendered bar.");
  return rect;
}

function textElements(svg: Document): Element[] {
  return Array.from(svg.querySelectorAll("text"));
}

describe("common chart formatting renderer", () => {
  test("title styling preserves an untouched value-axis formatter and actual numeric labels", () => {
    const large = frozenData([{ name: "Large", values: [1000, 1500] }]);
    const before = createChartOption({ ...chart, title: "Sales" }, large, dimensions);
    const after = createChartOption(
      { ...chart, title: "Sales", format: { title: { color: "#ff0000", fontSize: 20 } } },
      large,
      dimensions,
    );
    expect(axis(after, "yAxis").axisLabel?.formatter).toBe(
      axis(before, "yAxis").axisLabel?.formatter,
    );
    let baseline: string[] = [];
    render(before, (_instance, svg) => {
      baseline = textElements(svg).map((node) => node.textContent ?? "");
    });
    expect(baseline.some((label) => /^1,\d{3}$/.test(label))).toBe(true);
    render(after, (_instance, svg) => {
      expect(textElements(svg).map((node) => node.textContent ?? "")).toEqual(baseline);
    });
  });

  test("no format returns the exact original option and leaves frozen data untouched", () => {
    const original = createChartOption(chart, data, dimensions);
    const snapshot = JSON.stringify(data);
    Object.freeze(original);
    expect(applyChartCommonFormat(original, chart, data)).toBe(original);
    expect(JSON.stringify(data)).toBe(snapshot);
    expect(Object.isFrozen(data)).toBe(true);
    expect(data.series.every((entry) => Object.isFrozen(entry.values))).toBe(true);
    expect(original).toMatchObject({
      xAxis: { type: "category", data: ["Alpha", "Beta"] },
      yAxis: { type: "value" },
      series: [
        { type: "bar", id: "a", data: [40, 70], itemStyle: { color: "#2563eb" } },
        { type: "bar", id: "b", data: [60, 90], itemStyle: { color: "#16a34a" } },
      ],
    });
    render(original, (_instance, svg) => {
      expect(textElements(svg).map((entry) => entry.textContent)).toContain("Alpha");
    });
  });

  test("20..180 bounds, 40 major and 8 minor units produce real matching SVG ticks", () => {
    const settings: ChartValueAxisFormat = { min: 20, max: 180, majorUnit: 40, minorUnit: 8 };
    expect(resolveChartAxisIntervals(settings, [40, 90])).toEqual({
      min: 20,
      max: 180,
      interval: 40,
      minorDivisions: 5,
    });
    const option = createChartOption({ ...chart, format: { valueAxis: settings } }, data);
    expect(axis(option, "yAxis")).toMatchObject({
      min: 20,
      max: 180,
      interval: 40,
      minorTick: { show: true, splitNumber: 5 },
      minorSplitLine: { show: true },
    });
    render(option, (instance, svg) => {
      const labels = textElements(svg).map((entry) => entry.textContent);
      for (const value of [20, 60, 100, 140, 180]) expect(labels).toContain(String(value));
      const horizontalGridLines = instance
        .getZr()
        .storage.getDisplayList(true)
        .filter((entry) => entry.type === "line")
        .map((entry) => entry.getBoundingRect())
        // ZRender expands line bounds by its five-pixel stroke hit-test threshold.
        .filter((rect) => rect.width > 300 && rect.height < 10);
      for (let value = 28; value < 180; value += 8) {
        const pixel = instance.convertToPixel({ yAxisIndex: 0 }, value);
        expect(
          horizontalGridLines.some((rect) => Math.abs(rect.y + rect.height / 2 - pixel) < 1),
        ).toBe(true);
      }
      expect(instance.convertToPixel({ yAxisIndex: 0 }, 180)).toBeLessThan(
        instance.convertToPixel({ yAxisIndex: 0 }, 20),
      );
    });
  });

  test("reversed value scale moves category labels to the top and category reversal is real", () => {
    const option = createChartOption(
      {
        ...chart,
        format: {
          valueAxis: { min: 0, max: 100, reverse: true },
          categoryAxis: { reverse: true, text: { color: "#765432" } },
        },
      },
      data,
    );
    expect(axis(option, "yAxis").inverse).toBe(true);
    expect(axis(option, "xAxis")).toMatchObject({
      inverse: true,
      position: "top",
      axisLine: { onZero: false },
    });
    render(option, (instance, svg) => {
      const top = instance.convertToPixel({ yAxisIndex: 0 }, 0);
      expect(top).toBeLessThan(instance.convertToPixel({ yAxisIndex: 0 }, 100));
      expect(instance.convertToPixel({ xAxisIndex: 0 }, "Alpha")).toBeGreaterThan(
        instance.convertToPixel({ xAxisIndex: 0 }, "Beta"),
      );
      expect(textRect(instance, "Alpha").y).toBeLessThan(top);
      expect(
        textElements(svg)
          .find((entry) => entry.textContent === "Alpha")
          ?.getAttribute("fill"),
      ).toBe("#765432");
    });
  });

  test("one decimal and source-linked formats change text while values remain numeric", () => {
    const oneDecimal: CellNumberFormat = { kind: "number", fractionDigits: 1, useGrouping: false };
    const sourced = frozenData([
      { id: "a", name: "A", values: [20, 80], numberFormat: oneDecimal },
      { id: "b", name: "B", values: [40, 60], numberFormat: oneDecimal },
    ]);
    const manual = createChartOption(
      {
        ...chart,
        format: {
          valueAxis: {
            min: 0,
            max: 100,
            majorUnit: 20,
            numberFormat: oneDecimal,
            linkedToSource: false,
          },
        },
      },
      data,
    );
    expect(axisLabel(axis(manual, "yAxis"), 20)).toBe("20.0");
    expect(series(manual)[0]).toMatchObject({ data: [40, 70] });
    const linked = createChartOption(
      {
        ...chart,
        format: {
          valueAxis: {
            min: 0,
            max: 100,
            majorUnit: 20,
            linkedToSource: true,
            numberFormat: { kind: "percent", fractionDigits: 0 },
          },
        },
      },
      sourced,
    );
    expect(axisLabel(axis(linked, "yAxis"), 20)).toBe("20.0");
    render(linked, (instance, svg) => {
      expect(textElements(svg).map((entry) => entry.textContent)).toContain("20.0");
      expect(instance.convertToPixel({ yAxisIndex: 0 }, 80)).toBeLessThan(
        instance.convertToPixel({ yAxisIndex: 0 }, 20),
      );
    });
    const mixed = frozenData([
      { id: "a", name: "A", values: [20, 80], numberFormat: oneDecimal },
      {
        id: "b",
        name: "B",
        values: [40, 60],
        numberFormat: { kind: "percent", fractionDigits: 0 },
      },
    ]);
    expect(
      axisLabel(
        axis(
          createChartOption({ ...chart, format: { valueAxis: { linkedToSource: true } } }, mixed),
          "yAxis",
        ),
        20,
      ),
    ).toBe("20");
    expect(
      axisLabel(
        axis(
          createChartOption(
            { ...chart, format: { valueAxis: { linkedToSource: false } } },
            sourced,
          ),
          "yAxis",
        ),
        20,
      ),
    ).toBe("20");
  });

  test("custom negative sections paint the actual SVG tick labels in their section colors", () => {
    const option = createChartOption(
      {
        ...chart,
        format: {
          valueAxis: {
            min: -10,
            max: 10,
            majorUnit: 5,
            numberFormat: { kind: "custom", code: '[Green]0.0;[Red](0.0);[Blue]"zero"' },
            text: { color: "#654321" },
          },
        },
      },
      frozenData([{ name: "Signed", values: [-10, 10] }]),
    );
    expect(axisLabel(axis(option, "yAxis"), -5)).toBe("(5.0)");
    render(option, (_instance, svg) => {
      const labels = textElements(svg);
      expect(labels.find((entry) => entry.textContent === "(5.0)")?.getAttribute("fill")).toBe(
        "red",
      );
      expect(labels.find((entry) => entry.textContent === "5.0")?.getAttribute("fill")).toBe(
        "green",
      );
      expect(labels.find((entry) => entry.textContent === "zero")?.getAttribute("fill")).toBe(
        "blue",
      );
    });
  });

  test.each(["column", "bar"])(
    "%s gap 50 and overlap 50 produce actual widths and half-overlap",
    (type) => {
      const orientation: SheetChart["type"] = type === "bar" ? "bar" : "column";
      expect(chartBarGapRatios(2, 50, 50)).toEqual({ barGap: "-50%", barCategoryGap: "25%" });
      const option = createChartOption(
        {
          ...chart,
          type: orientation,
          format: {
            bar: { gapWidth: 50, overlap: 50 },
            series: [
              { id: "a", color: "#112233" },
              { id: "b", color: "#445566" },
            ],
          },
        },
        data,
      );
      expect(series(option)).toMatchObject([
        { id: "a", barGap: "-50%", barCategoryGap: "25%" },
        { id: "b", barGap: "-50%", barCategoryGap: "25%" },
      ]);
      render(option, (instance) => {
        const a = renderedRects(instance, "#112233");
        const b = renderedRects(instance, "#445566");
        expect(a).toHaveLength(2);
        expect(b).toHaveLength(2);
        const categoryDimension = orientation === "bar" ? "yAxis" : "xAxis";
        const band = Math.abs(
          instance.convertToPixel({ [categoryDimension + "Index"]: 0 }, "Beta") -
            instance.convertToPixel({ [categoryDimension + "Index"]: 0 }, "Alpha"),
        );
        const position = (rect: Rect) => (orientation === "bar" ? rect.y : rect.x);
        const width = (rect: Rect) => (orientation === "bar" ? rect.height : rect.width);
        a.sort((left, right) => position(left) - position(right));
        b.sort((left, right) => position(left) - position(right));
        const first = firstRect(a),
          second = firstRect(b),
          next = a[1];
        if (!next) throw new Error("Missing second category.");
        expect(width(first)).toBeCloseTo(band / 2, 5);
        expect(width(second)).toBeCloseTo(width(first), 5);
        expect(Math.abs(position(second) - position(first))).toBeCloseTo(width(first) / 2, 5);
        const categoryEnd = Math.max(
          position(first) + width(first),
          position(second) + width(second),
        );
        const nextStart = Math.min(position(next), position(b[1] ?? next));
        expect(nextStart - categoryEnd).toBeCloseTo(width(first) / 2, 5);
      });
    },
  );

  test("primary and secondary columns use independent value scales with actual category overlay", () => {
    const scaled = frozenData([
      { id: "a", colorIndex: 0, name: "Duplicate", values: [20, 80] },
      { id: "b", colorIndex: 1, name: "Duplicate", values: [200, 800] },
    ]);
    const option = createChartOption(
      sourceChart(scaled.series, {
        format: {
          valueAxis: { min: 0, max: 100, majorUnit: 20 },
          secondaryValueAxis: { min: 0, max: 1000, majorUnit: 200 },
          series: [
            { id: "a", color: "#112233" },
            { id: "b", axis: "secondary", color: "#445566" },
          ],
        },
      }),
      scaled,
    );
    expect(axes(option, "yAxis")).toHaveLength(2);
    expect(axes(option, "xAxis")).toHaveLength(2);
    expect(axis(option, "xAxis", 1).show).toBe(false);
    expect(series(option)).toMatchObject([
      { id: "a", yAxisIndex: 0, xAxisIndex: 0, itemStyle: { color: "#112233" } },
      { id: "b", yAxisIndex: 1, xAxisIndex: 1, itemStyle: { color: "#445566" } },
    ]);
    render(option, (instance, svg) => {
      expect(instance.convertToPixel({ yAxisIndex: 0 }, 80)).toBeCloseTo(
        instance.convertToPixel({ yAxisIndex: 1 }, 800),
        5,
      );
      expect(instance.convertToPixel({ yAxisIndex: 0 }, 80)).not.toBeCloseTo(
        instance.convertToPixel({ yAxisIndex: 1 }, 80),
        1,
      );
      const a = renderedRects(instance, "#112233");
      const b = renderedRects(instance, "#445566");
      expect(a).toHaveLength(2);
      expect(b).toHaveLength(2);
      for (let index = 0; index < 2; index++) {
        const primary = a[index],
          secondary = b[index];
        if (!primary || !secondary) throw new Error("Missing overlay bars.");
        expect(secondary.x).toBeCloseTo(primary.x, 5);
        expect(secondary.width).toBeCloseTo(primary.width, 5);
        expect(secondary.y).toBeCloseTo(primary.y, 5);
        expect(secondary.height).toBeCloseTo(primary.height, 5);
      }
      expect(textElements(svg).map((entry) => entry.textContent)).toContain("1000");
    });
  });

  test("stable ID styles survive reorder, removal and dormant-source restoration", () => {
    const format: ChartFormatSettings = {
      series: [
        { id: "a", color: "#aa0000", strokeWidth: 5, smooth: true, markers: false },
        {
          id: "b",
          axis: "secondary",
          color: "#0000bb",
          strokeWidth: 2,
          smooth: false,
          markers: true,
        },
        { id: "dormant", axis: "secondary", color: "#00cc00", strokeWidth: 7, markers: false },
      ],
    };
    const snapshot = JSON.stringify(format);
    const a = data.series[0],
      b = data.series[1];
    if (!a || !b) throw new Error("Missing fixture series.");
    const cases: readonly (readonly FixtureSeries[])[] = [
      [a, b],
      [b, a],
      [a],
      [{ id: "dormant", colorIndex: 5, name: "Duplicate", values: [10, 30] }, a],
    ];
    for (const entries of cases) {
      const current = frozenData(entries);
      const option = createChartOption(sourceChart(entries, { type: "line", format }), current);
      expect(series(option).map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));
      for (const entry of series(option)) {
        if (entry.type !== "line") throw new Error("Expected a line series.");
        const settings = format.series?.find((item) => item.id === entry.id);
        if (!settings) throw new Error("Missing stable-ID settings.");
        expect(entry.lineStyle).toMatchObject({
          color: settings.color,
          width: settings.strokeWidth,
        });
        expect(entry.showSymbol).toBe(settings.markers);
        expect(entry.yAxisIndex).toBe(settings.axis === "secondary" ? 1 : 0);
      }
      expect(axes(option, "yAxis")).toHaveLength(entries.some((entry) => entry.id !== "a") ? 2 : 1);
      render(option, (_instance, svg) => {
        for (const entry of entries) {
          const settings = format.series?.find((item) => item.id === entry.id);
          expect(
            svg.querySelector(
              `path[stroke="${settings?.color}"][stroke-width="${settings?.strokeWidth}"]`,
            ),
          ).not.toBeNull();
        }
      });
    }
    const empty = createChartOption(sourceChart([], { type: "line", format }), frozenData([], []));
    expect(empty).toEqual({ animation: false, backgroundColor: "#ffffff", series: [] });
    expect(JSON.stringify(format)).toBe(snapshot);
  });

  test("scatter X values and source formatting are excluded from the formatted Y axis", () => {
    const scatter = frozenData([
      {
        id: "x",
        name: "X",
        values: [1000, 2000],
        numberFormat: { kind: "number", fractionDigits: 0 },
      },
      { id: "y", name: "Y", values: [2, 4], numberFormat: { kind: "number", fractionDigits: 1 } },
    ]);
    const option = createChartOption(
      {
        ...chart,
        type: "scatter",
        format: {
          valueAxis: { minorUnit: 1, linkedToSource: true },
          categoryAxis: { reverse: true, title: "Ignored category" },
          series: [
            { id: "x", axis: "secondary" },
            { id: "y", axis: "secondary" },
          ],
        },
      },
      scatter,
    );
    expect(axis(option, "yAxis")).toMatchObject({ min: 0, max: 4, interval: 1 });
    expect(axes(option, "yAxis")).toHaveLength(1);
    expect(axis(option, "xAxis").inverse).toBeUndefined();
    expect(axis(option, "xAxis").name).toBeUndefined();
    expect(axisLabel(axis(option, "xAxis"), 1000)).toBe("1,000");
    expect(axisLabel(axis(option, "yAxis"), 2)).toBe("2.0");
    expect(series(option)).toMatchObject([
      {
        type: "scatter",
        data: [
          [1000, 2],
          [2000, 4],
        ],
      },
    ]);
    render(option, (instance, svg) => {
      expect(textElements(svg).map((entry) => entry.textContent)).toContain("2.0");
      expect(instance.convertToPixel({ yAxisIndex: 0 }, 4)).toBeLessThan(
        instance.convertToPixel({ yAxisIndex: 0 }, 2),
      );
    });
  });

  test("radar applies per-ID line and marker styles to real SVG polygons after reorder", () => {
    const radar = frozenData(
      [
        { id: "b", colorIndex: 1, name: "Duplicate", values: [40, 70, 60] },
        { id: "a", colorIndex: 0, name: "Duplicate", values: [60, 90, 70] },
      ],
      ["Alpha", "Beta", "Gamma"],
    );
    const option = createChartOption(
      sourceChart(radar.series, {
        type: "radar",
        format: {
          series: [
            { id: "a", color: "#aa0000", strokeWidth: 5, markers: false },
            { id: "b", color: "#0000bb", strokeWidth: 3, markers: true },
            { id: "dormant", color: "#00cc00", strokeWidth: 7 },
          ],
        },
      }),
      radar,
    );
    const entry = series(option)[0];
    if (!entry || entry.type !== "radar") throw new Error("Expected radar series.");
    expect(entry.data).toMatchObject([
      {
        id: "b",
        itemStyle: { color: "#0000bb" },
        lineStyle: { color: "#0000bb", width: 3 },
        symbol: "circle",
      },
      {
        id: "a",
        itemStyle: { color: "#aa0000" },
        lineStyle: { color: "#aa0000", width: 5 },
        symbol: "none",
      },
    ]);
    render(option, (_instance, svg) => {
      expect(svg.querySelector('polyline[stroke="#aa0000"][stroke-width="5"]')).not.toBeNull();
      expect(svg.querySelector('polyline[stroke="#0000bb"][stroke-width="3"]')).not.toBeNull();
      expect(svg.querySelectorAll('[fill="#aa0000"]')).toHaveLength(0);
      expect(svg.querySelectorAll('[fill="#0000bb"]')).toHaveLength(3);
      expect(svg.querySelector('[stroke="#00cc00"]')).toBeNull();
    });
  });
});

describe("chart axis numeric budget", () => {
  test("one-sided bounds outside source values retain a finite automatic opposite bound", () => {
    expect(resolveChartAxisIntervals({ min: 1000 }, [60, 100])).toEqual({ max: 1100 });
    expect(resolveChartAxisIntervals({ max: -100 }, [60, 100])).toEqual({ min: -110 });
    expect(
      createChartOption({ ...chart, format: { valueAxis: { min: 1000 } } }, data).yAxis,
    ).toMatchObject({ min: 1000, max: 1100 });
  });

  test("styles alone keep automatic scale and minor-only settings derive an exact subdivision", () => {
    expect(resolveChartAxisIntervals({ text: { color: "#123456" } }, [-40, 90])).toEqual({});
    const result = resolveChartAxisIntervals({ min: 20, max: 180, minorUnit: 8 }, [40, 90]);
    expect(result).toMatchObject({ min: 20, max: 180 });
    expect(result.interval).toBeGreaterThan(0);
    expect(result.interval! / 8).toBe(result.minorDivisions);
  });

  test("2048 ticks are accepted and the next major or minor tick is rejected", () => {
    expect(resolveChartAxisIntervals({ min: 0, max: 2047, majorUnit: 1 }, [1])).toEqual({
      min: 0,
      max: 2047,
      interval: 1,
    });
    expect(() => resolveChartAxisIntervals({ min: 0, max: 2048, majorUnit: 1 }, [1])).toThrow(
      /2048-tick/,
    );
    expect(() =>
      resolveChartAxisIntervals({ min: 0, max: 2048, majorUnit: 100, minorUnit: 1 }, [1]),
    ).toThrow(/2048-tick/);
    expect(() => resolveChartAxisIntervals({ majorUnit: 1 }, [2047.1])).toThrow(/2048-tick/);
  });

  test("nonfinite values, tiny unsafe units, extreme spans and invalid subdivisions fail closed", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => resolveChartAxisIntervals({}, [value])).toThrow(RangeError);
    }
    const unsafe: ChartValueAxisFormat[] = [
      { min: -Number.MAX_VALUE, max: Number.MAX_VALUE, majorUnit: Number.MAX_VALUE },
      { min: Number.MAX_VALUE },
      { majorUnit: Number.MIN_VALUE },
      { minorUnit: Number.MIN_VALUE },
      { min: 10, max: 10 },
      { majorUnit: 0 },
      { majorUnit: 5, minorUnit: 2 },
      { majorUnit: 101, minorUnit: 1 },
      { majorUnit: 1, minorUnit: 2 },
    ];
    for (const settings of unsafe) {
      expect(() => resolveChartAxisIntervals(settings, [0, 100])).toThrow(RangeError);
    }
    const hugeStack = frozenData([
      { id: "a", name: "A", values: [Number.MAX_VALUE, 0] },
      { id: "b", name: "B", values: [Number.MAX_VALUE, 0] },
    ]);
    expect(() => createChartOption({ ...chart, stacked: true, format: {} }, hugeStack)).toThrow(
      /finite axis budget/,
    );
    expect(() =>
      createChartOption(
        { ...chart, format: {} },
        frozenData([{ name: "Nonfinite", values: [Infinity, 0] }]),
      ),
    ).toThrow(RangeError);
  });
});
