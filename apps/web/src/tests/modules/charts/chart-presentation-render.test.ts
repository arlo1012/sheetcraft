import { describe, expect, test } from "vitest";
import type {
  EChartsOption,
  SeriesOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { createChartOption } from "../../../modules/charts/chart-option";
import { applyChartCommonFormat } from "../../../modules/charts/chart-format-render";
import {
  chartPercentAxisSettings,
  createChartPresentationData,
  getChartPresentationBackground,
  getChartRenderPresentation,
} from "../../../modules/charts/chart-presentation-render";
import { createWordCloudLayout } from "../../../modules/charts/chart-wordcloud-layout";
import { init } from "../../../modules/charts/chart-runtime";

const chart: SheetChart = {
  type: "column",
  range: null,
  title: "",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: false,
  labels: true,
  stacked: true,
  showHidden: false,
  presentation: { percentStacked: true },
};
const currency = { kind: "currency", currency: "USD", fractionDigits: 2 } as const;
function data(values: Array<Array<number | null>>, ids = false): ChartData {
  return {
    categories: values[0]?.map((_, index) => `Category ${index}`) ?? [],
    series: values.map((values, index) => ({
      name: "Duplicate",
      values,
      ...(ids ? { id: `id-${index}`, colorIndex: index } : {}),
    })),
    records: [],
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function series(option: EChartsOption): SeriesOption[] {
  return Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
}
type Axis = XAXisComponentOption | YAXisComponentOption;
function axis(option: EChartsOption, dimension: "xAxis" | "yAxis", index = 0): Axis {
  const entries = option[dimension];
  const entry = Array.isArray(entries) ? entries[index] : entries;
  if (!entry) throw new Error("Missing axis.");
  return entry;
}
function tick(entry: Axis, value: number): string {
  if (entry.type !== "value" || typeof entry.axisLabel?.formatter !== "function")
    throw new Error("Missing value formatter.");
  return entry.axisLabel.formatter(value, 0, null);
}
function line(option: EChartsOption, index = 0) {
  const entry = series(option)[index];
  if (entry?.type !== "line") throw new Error("Missing line.");
  return entry;
}
function bar(option: EChartsOption, index = 0) {
  const entry = series(option)[index];
  if (entry?.type !== "bar") throw new Error("Missing bar.");
  return entry;
}

describe("chart-wide presentation consumers", () => {
  test.each(["column", "bar", "line", "area"] as const)(
    "%s plots per-category signed absolute contributions, with nulls and zeros",
    (type) => {
      const source = freeze(
        data([
          [20, null, 0, -1],
          [60, 2, 0, 3],
        ]),
      );
      const before = JSON.stringify(source);
      const next = createChartOption({ ...chart, type }, source);
      expect(series(next).map((entry) => ("data" in entry ? entry.data : undefined))).toEqual([
        [0.25, null, 0, -0.25],
        [0.75, 1, 0, 0.75],
      ]);
      expect(axis(next, type === "bar" ? "xAxis" : "yAxis")).toMatchObject({ min: -1, max: 1 });
      expect(tick(axis(next, type === "bar" ? "xAxis" : "yAxis"), 0.75)).toBe("75%");
      expect(JSON.stringify(source)).toBe(before);
    },
  );

  test("max scaling keeps finite extremes safe and preserves all-null/zero categories", () => {
    const source = freeze(
      data([
        [Number.MAX_VALUE, Number.MIN_VALUE, null, -0],
        [-Number.MAX_VALUE, Number.MIN_VALUE, null, 0],
      ]),
    );
    const ratios = createChartPresentationData(chart, source);
    expect(ratios.series.map((entry) => entry.values)).toEqual([
      [0.5, 0.5, null, -0],
      [-0.5, 0.5, null, 0],
    ]);
    expect(
      ratios.series.every((entry) =>
        entry.values.every((value) => value === null || Number.isFinite(value)),
      ),
    ).toBe(true);
    expect(ratios.categories).toBe(source.categories);
    expect(ratios.records).toBe(source.records);
    expect(source.series[0]!.values[0]).toBe(Number.MAX_VALUE);
  });

  test("duplicate names and reordered series group by stable ID independently on secondary axes", () => {
    const source = freeze(
      data(
        [
          [30, -2],
          [70, 6],
          [Number.MAX_VALUE, 9],
        ],
        true,
      ),
    );
    const next: SheetChart = { ...chart, format: { series: [{ id: "id-2", axis: "secondary" }] } };
    const first = createChartOption(next, source);
    expect(series(first).map((entry) => (entry.type === "bar" ? entry.data : undefined))).toEqual([
      [0.3, -0.25],
      [0.7, 0.75],
      [1, 1],
    ]);
    expect(bar(first, 2)).toMatchObject({ id: "id-2", yAxisIndex: 1, stack: "secondary-total" });
    expect(bar(first, 0).stack).toBe("primary-total");
    expect(tick(axis(first, "yAxis", 0), 0.5)).toBe("50%");
    expect(tick(axis(first, "yAxis", 1), 0.5)).toBe("50%");
    const reordered = createChartOption(next, {
      ...source,
      series: [source.series[2]!, source.series[1]!, source.series[0]!],
    });
    expect(bar(reordered, 0)).toMatchObject({ id: "id-2", yAxisIndex: 1, data: [1, 1] });
    expect(bar(reordered, 2)).toMatchObject({ id: "id-0", yAxisIndex: 0, data: [0.3, -0.25] });
  });

  test("labels and rich-text tooltips retain raw currency, while linked axes stay percentage", () => {
    const source = freeze({
      ...data([
        [20, 40],
        [60, 160],
      ]),
      series: [
        { name: "Revenue", values: [20, 40], numberFormat: currency },
        { name: "Expenses", values: [60, 160], numberFormat: currency },
      ],
    });
    const next = createChartOption(
      { ...chart, format: { valueAxis: { linkedToSource: true, numberFormat: currency } } },
      source,
    );
    const first = bar(next);
    const label = first.label?.formatter;
    if (typeof label !== "function") throw new Error("Missing raw label.");
    expect(label({ dataIndex: 1, value: 0.2 } as Parameters<typeof label>[0])).toBe("$40.00");
    expect(first.tooltip?.valueFormatter?.(0.2, 1)).toBe("$40.00");
    expect(tick(axis(next, "yAxis"), 0.2)).toBe("20%");
    expect(next.tooltip).toMatchObject({ renderMode: "richText", confine: true });
    expect(next.tooltip).not.toHaveProperty("formatter");
  });

  test("manual axis controls are percentage points and explicit Core formats receive ratios", () => {
    const settings = freeze({
      min: -100,
      max: 100,
      majorUnit: 25,
      minorUnit: 5,
      numberFormat: { kind: "custom", code: "0.00%" } as const,
      linkedToSource: false,
    });
    const next = createChartOption(
      { ...chart, format: { valueAxis: settings } },
      data([
        [2, -1],
        [6, 3],
      ]),
    );
    expect(axis(next, "yAxis")).toMatchObject({
      min: -1,
      max: 1,
      interval: 0.25,
      minorTick: { splitNumber: 5 },
    });
    expect(tick(axis(next, "yAxis"), 0.25)).toBe("25.00%");
    expect(settings).toMatchObject({ min: -100, max: 100, majorUnit: 25, minorUnit: 5 });
    expect(chartPercentAxisSettings(settings)).not.toBe(settings);
    const general = createChartOption(
      {
        ...chart,
        format: {
          valueAxis: { numberFormat: { kind: "custom", code: "General" }, linkedToSource: false },
        },
      },
      data([[2], [6]]),
    );
    expect(tick(axis(general, "yAxis"), 0.25)).toBe("0.25");
  });

  test("secondary axis manual controls also use percentage points", () => {
    const next = createChartOption(
      {
        ...chart,
        type: "bar",
        format: {
          series: [{ id: "id-1", axis: "secondary" }],
          secondaryValueAxis: {
            min: 0,
            max: 100,
            majorUnit: 20,
            minorUnit: 10,
            linkedToSource: true,
          },
        },
      },
      data(
        [
          [1, 2],
          [300, 400],
        ],
        true,
      ),
    );
    expect(axis(next, "xAxis", 1)).toMatchObject({
      min: 0,
      max: 1,
      interval: 0.2,
      minorTick: { splitNumber: 2 },
    });
    expect(tick(axis(next, "xAxis", 1), 0.2)).toBe("20%");
  });

  test("global palette uses source color slots and individual colors/markers win", () => {
    const source = data(
      [
        [3, 4],
        [7, 8],
      ],
      true,
    );
    const next: SheetChart = {
      ...chart,
      type: "line",
      presentation: { lineMarkers: false, palette: ["#123", "#456"] },
      format: { series: [{ id: "id-0", markers: true, color: "#abc" }] },
    };
    const first = createChartOption(next, source);
    expect(line(first, 0)).toMatchObject({
      showSymbol: true,
      symbol: "circle",
      itemStyle: { color: "#abc" },
      lineStyle: { color: "#abc" },
    });
    expect(line(first, 1)).toMatchObject({
      showSymbol: false,
      symbol: "none",
      itemStyle: { color: "#456" },
    });
    const reordered = createChartOption(next, { ...source, series: [...source.series].reverse() });
    expect(line(reordered, 0)).toMatchObject({
      id: "id-1",
      itemStyle: { color: "#456" },
      showSymbol: false,
    });
    expect(line(reordered, 1)).toMatchObject({
      id: "id-0",
      itemStyle: { color: "#abc" },
      showSymbol: true,
    });
    const legacy = { ...chart, type: "line" as const };
    delete legacy.presentation;
    expect(line(createChartOption(legacy, source)).showSymbol).toBe(true);
  });

  test.each([
    "column",
    "bar",
    "line",
    "area",
    "pie",
    "doughnut",
    "scatter",
    "radar",
    "treemap",
    "sankey",
    "river",
  ] as const)("%s receives an explicit chart-wide palette and opaque background", (type) => {
    const source = {
      ...data(
        [
          [3, 4],
          [7, 8],
        ],
        true,
      ),
      records: [["A", "B", 2]],
    } as ChartData;
    const next = createChartOption(
      {
        ...chart,
        type,
        stacked: false,
        presentation: { palette: ["#123", "#456"], background: "#AbC" },
      },
      source,
    );
    expect(next).toMatchObject({ color: ["#123", "#456"], backgroundColor: "#abc" });
    if (type === "area") expect(line(next, 1).areaStyle).toMatchObject({ color: "#456" });
    if (type === "radar")
      expect(series(next)[0]).toMatchObject({
        type: "radar",
        data: [{ itemStyle: { color: "#123" } }, { itemStyle: { color: "#456" } }],
      });
  });

  test.each([
    "column",
    "bar",
    "line",
    "area",
    "pie",
    "doughnut",
    "scatter",
    "radar",
    "treemap",
    "sankey",
    "river",
  ] as const)("%s real ECharts paint consumes its custom palette", (type) => {
    const source = {
      ...data(
        [
          [3, 4],
          [7, 8],
        ],
        true,
      ),
      records: [["A", "B", 2]],
    } as ChartData;
    const instance = init(null, undefined, { renderer: "svg", ssr: true, width: 480, height: 300 });
    try {
      instance.setOption(
        createChartOption(
          {
            ...chart,
            type,
            stacked: false,
            labels: false,
            presentation: { palette: ["#123456", "#654321"] },
          },
          source,
        ),
      );
      const markup = instance.renderToSVGString();
      expect(markup).not.toMatch(/NaN|Infinity/);
      expect(markup).toMatch(/#(?:123456|654321)/);
    } finally {
      instance.dispose();
    }
  });

  test("wordcloud sorting uses explicit palette and shared opaque background", () => {
    const next: SheetChart = {
      ...chart,
      type: "wordCloud",
      stacked: false,
      presentation: { palette: ["#abc"], background: "#123456" },
    };
    const source = freeze(data([[3, 9, 0, null]]));
    const layout = createWordCloudLayout(next, source, { width: 200, height: 100 });
    expect(layout.words.map((entry) => entry.color)).toEqual(["#abc", "#abc"]);
    expect(getChartPresentationBackground(next)).toBe("#123456");
    expect(getChartPresentationBackground({ ...chart, presentation: {} })).toBe("#ffffff");
  });

  test("empty custom sources retain explicit background", () => {
    const next: SheetChart = {
      ...chart,
      presentation: { background: "#123" },
      source: { kind: "series", categories: { kind: "generated" }, series: [] },
    };
    expect(createChartOption(next, { categories: [], series: [], records: [] })).toEqual({
      animation: false,
      backgroundColor: "#123",
      series: [],
    });
  });

  test("legacy, cached and Pivot source data are not rewritten", () => {
    const source = freeze(
      data([
        [2, 0],
        [6, null],
      ]),
    );
    const before = JSON.stringify(source);
    const legacy = { ...chart };
    delete legacy.presentation;
    expect(createChartPresentationData(legacy, source)).toBe(source);
    const option = createChartOption(legacy, source);
    expect(applyChartCommonFormat(option, legacy, source)).toBe(option);
    for (const next of [
      chart,
      { ...chart, dataCache: source },
      { ...chart, pivotTableId: "pivot" },
    ]) {
      expect(bar(createChartOption(next, source)).data).toEqual([0.25, 0]);
      expect(JSON.stringify(source)).toBe(before);
    }
  });

  describe.each([
    {
      boundary: "chart options through Core normalization",
      render: (candidate: SheetChart) => createChartOption(candidate, data([[1]])),
      accessorError: "Chart presentation must be an own data field, not an accessor.",
      percentError: "Percent stacking requires a stacked column, bar, line or area chart.",
      markerError: "Line markers require a line chart.",
    },
    {
      boundary: "direct Web presentation helper",
      render: getChartRenderPresentation,
      accessorError: "Chart presentation requires an own data field.",
      percentError: "Percentage presentation requires a stacked column, bar, line or area chart.",
      markerError: "Global line markers require a line chart.",
    },
  ])(
    "presentation validation at $boundary",
    ({ render, accessorError, percentError, markerError }) => {
      test("rejects presentation accessors without invoking their getter", () => {
        expect(render(chart)).toBeDefined();
        let calls = 0;
        const accessor = { ...chart };
        Object.defineProperty(accessor, "presentation", {
          get() {
            calls++;
            return {};
          },
        });
        expect(() => render(accessor)).toThrow(new TypeError(accessorError));
        expect(calls).toBe(0);
      });

      test.each([
        {
          name: "transparent background",
          invalid: { background: "transparent" },
          valid: { background: "#123" },
          error: new RangeError("Chart presentation color must be opaque hex RGB."),
        },
        {
          name: "empty palette",
          invalid: { palette: [] },
          valid: { palette: ["#123"] },
          error: new RangeError("Chart palette requires 1–16 colors."),
        },
        {
          name: "alpha background",
          invalid: { background: "#abcd" },
          valid: { background: "#aabbcc" },
          error: new RangeError("Chart presentation color must be opaque hex RGB."),
        },
        {
          name: "explicit percent reset",
          invalid: { percentStacked: false },
          valid: { percentStacked: true },
          error: new TypeError("Chart percent stacking must be true; omit it to reset."),
        },
        {
          name: "unknown presentation field",
          invalid: { unknown: true },
          valid: {},
          error: new TypeError("Unknown chart presentation setting."),
        },
      ])("rejects $name independently", ({ invalid, valid, error }) => {
        expect(render({ ...chart, presentation: valid } as SheetChart)).toBeDefined();
        expect(() => render({ ...chart, presentation: invalid } as SheetChart)).toThrow(error);
      });

      test.each([
        { name: "unsupported pie type", candidate: { ...chart, type: "pie" as const } },
        { name: "unstacked column", candidate: { ...chart, stacked: false } },
      ])("rejects percent stacking for $name", ({ candidate }) => {
        expect(render(chart)).toBeDefined();
        expect(() => render(candidate)).toThrow(new RangeError(percentError));
      });

      test("rejects global line markers on a column chart", () => {
        const candidate: SheetChart = { ...chart, presentation: { lineMarkers: false } };
        expect(render({ ...candidate, type: "line" })).toBeDefined();
        expect(() => render(candidate)).toThrow(new RangeError(markerError));
      });
    },
  );

  test.each([Infinity, -Infinity, NaN])(
    "chart options reject non-finite source value %s before percentage geometry",
    (value) => {
      expect(bar(createChartOption(chart, data([[1]]))).data).toEqual([1]);
      expect(() => createChartOption(chart, data([[value]]))).toThrow(
        new RangeError("Invalid cached chart data."),
      );
    },
  );

  test.each([Infinity, -Infinity, NaN])(
    "wordcloud layout rejects non-finite source value %s before geometry",
    (value) => {
      const candidate: SheetChart = {
        ...chart,
        type: "wordCloud",
        stacked: false,
        presentation: { palette: ["#123"] },
      };
      const dimensions = { width: 200, height: 100 };
      expect(createWordCloudLayout(candidate, data([[1]]), dimensions).words).toMatchObject([
        { text: "Category 0", value: 1, color: "#123" },
      ]);
      expect(() => createWordCloudLayout(candidate, data([[value]]), dimensions)).toThrow(
        new RangeError("Invalid cached chart data."),
      );
    },
  );

  test("real ECharts model and SVG consume ratio geometry and raw labels", () => {
    const source = freeze({
      ...data(
        [
          [20, 0],
          [60, null],
        ],
        true,
      ),
      series: [
        { id: "id-0", colorIndex: 0, name: "A", values: [20, 0], numberFormat: currency },
        { id: "id-1", colorIndex: 1, name: "B", values: [60, null], numberFormat: currency },
      ],
    });
    const instance = init(null, undefined, { renderer: "svg", ssr: true, width: 480, height: 300 });
    try {
      instance.setOption(
        createChartOption(
          {
            ...chart,
            presentation: {
              percentStacked: true,
              palette: ["#123456", "#654321"],
              background: "#abcdef",
            },
          },
          source,
        ),
      );
      const markup = instance.renderToSVGString();
      expect(markup).toContain("$20.00");
      expect(markup).toContain("100%");
      expect(markup).toContain("#abcdef");
      expect(markup).not.toMatch(/NaN|Infinity/);
      const rendered = instance.getOption();
      expect(rendered.series).toMatchObject([{ data: [0.25, 0] }, { data: [0.75, null] }]);
    } finally {
      instance.dispose();
    }
  });
});
