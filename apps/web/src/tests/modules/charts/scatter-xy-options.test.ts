// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import type { EChartsOption } from "echarts";
import { getSheetChartData, type ChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  createWorkbook,
  createSheetEvaluator,
  getActiveSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { DEFAULT_CHART_PALETTE } from "@sheetcraft/core/chart-presentation";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { createChartOption } from "../../../modules/charts/chart-option";
import {
  applyScatterInsertChoice,
  changeChartType,
} from "../../../modules/charts/chart-design-intents";
import { init } from "../../../modules/charts/chart-runtime";
import { displayedSeriesName } from "./chart-render-labels";

const dimensions = { width: 640, height: 400 };
const chart: SheetChart = {
  type: "scatter",
  range: null,
  title: "XY",
  headerRow: true,
  headerColumn: false,
  seriesBy: "columns",
  legend: true,
  labels: true,
  stacked: false,
  showHidden: false,
};
const data: ChartData = {
  categories: ["P0", "P1", "P2", "P3", "P4"],
  records: [],
  series: [
    { name: "X carrier", values: [0, 1, 2, 3, 4] },
    {
      name: "Sales",
      values: [10, 20, null, 40, 50],
      numberFormat: { kind: "number", fractionDigits: 1 },
    },
    { name: "Profit", values: [5, 7, 9, 11, 13] },
  ],
};
type RenderSeries = {
  type: string;
  name: string;
  data: Array<[number, number | "-"]>;
  smooth?: boolean;
  showSymbol?: boolean;
  symbolSize?: number;
  connectNulls?: boolean;
  itemStyle: { color: string };
  label: { formatter: (params: { value: number[]; dataIndex: number }) => string };
};
function series(option: EChartsOption) {
  return option.series as unknown as RenderSeries[];
}
function withNative(
  option: EChartsOption,
  check: (instance: ReturnType<typeof init>, texts: string[]) => void,
) {
  const instance = init(null, undefined, { renderer: "svg", ssr: true, ...dimensions });
  try {
    instance.setOption(option);
    const markup = instance.renderToSVGString();
    expect(markup).not.toMatch(/NaN|Infinity/);
    const document = new DOMParser().parseFromString(markup, "text/html");
    check(
      instance,
      [...document.querySelectorAll("text")].map((node) => node.textContent ?? ""),
    );
  } finally {
    instance.dispose();
  }
}

describe("XY scatter native options", () => {
  test.each([
    { style: "marker", type: "scatter", smooth: undefined, markers: undefined },
    { style: "smoothMarker", type: "line", smooth: true, markers: true },
    { style: "smooth", type: "line", smooth: true, markers: false },
    { style: "lineMarker", type: "line", smooth: false, markers: true },
    { style: "line", type: "line", smooth: false, markers: false },
  ] as const)(
    "$style uses the actual subtype, Y-only legend/labels, and saved series colors",
    ({ style, type, smooth, markers }) => {
      const source: SheetChart = {
        ...chart,
        presentation: { scatterStyle: style, palette: ["#112233", "#aabbcc"] },
      };
      const before = structuredClone({ source, data });
      const option = createChartOption(source, data, dimensions);
      const rendered = series(option);
      expect(rendered).toHaveLength(2);
      expect(rendered.map((item) => item.type)).toEqual([type, type]);
      if (style !== "marker") {
        expect(
          rendered.every(
            (item) =>
              item.smooth === smooth && item.showSymbol === true && item.connectNulls === false,
          ),
        ).toBe(true);
        if (!markers) expect(rendered.every((item) => item.symbolSize === 0)).toBe(true);
        expect(rendered[0]!.data).toEqual([
          [0, 10],
          [1, 20],
          [2, "-"],
          [3, 40],
          [4, 50],
        ]);
      } else
        expect(rendered[0]!.data).toEqual([
          [0, 10],
          [1, 20],
          [3, 40],
          [4, 50],
        ]);
      const legend = Array.isArray(option.legend) ? option.legend[0]! : option.legend!;
      expect(
        legend.data!.map((item) =>
          displayedSeriesName(option, typeof item === "string" ? item : item.name!),
        ),
      ).toEqual(["Sales", "Profit"]);
      if (style === "line" || style === "smooth")
        expect(legend.data!.every((item) => typeof item !== "string" && item.icon === "line")).toBe(
          true,
        );
      expect(rendered[0]!.label.formatter({ value: [1, 20], dataIndex: 1 })).toBe("20.0");
      withNative(option, (instance, texts) => {
        expect(instance.getVisual({ seriesIndex: 0 }, "color")).toBe("#112233");
        expect(instance.getVisual({ seriesIndex: 1 }, "color")).toBe("#aabbcc");
        if (style === "line" || style === "smooth") {
          expect(instance.getVisual({ seriesIndex: 0 }, "symbolSize")).toBe(0);
          expect(instance.getVisual({ seriesIndex: 1 }, "symbolSize")).toBe(0);
        }
        expect(texts).toContain("Sales");
        expect(texts).toContain("Profit");
        expect(texts).toContain("20.0");
        expect(texts).not.toContain("X carrier");
      });
      expect({ source, data }).toEqual(before);
    },
  );

  test("a single Y source gets implicit one-based X coordinates, matching an empty SERIES X argument", () => {
    const workbook = createWorkbook({ id: "implicit-scatter-x", sheetId: "data" });
    const sheet = getActiveSheet(workbook);
    ["Revenue", 12, 24, 36].forEach((value, row) =>
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value }),
    );
    const source: SheetChart = {
      ...chart,
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
    };
    const values = getSheetChartData(sheet, source, createSheetEvaluator(sheet));
    expect(values.series.map((entry) => entry.values)).toEqual([
      [1, 2, 3],
      [12, 24, 36],
    ]);
    const option = createChartOption(source, values, dimensions);
    expect(series(option)).toHaveLength(1);
    expect(series(option)[0]!.data).toEqual([
      [1, 12],
      [2, 24],
      [3, 36],
    ]);
    expect(displayedSeriesName(option, series(option)[0]!.name)).toBe("Revenue");
  });

  test("a missing X skips its point and connects neighbors while a missing Y remains a line break", () => {
    const values: ChartData = {
      categories: ["A", "B", "C", "D"],
      records: [],
      series: [
        { name: "X", values: [1, null, 3, 4] },
        { name: "Y", values: [10, 20, 30, null] },
      ],
    };
    const option = createChartOption(
      { ...chart, presentation: { scatterStyle: "lineMarker" } },
      values,
      dimensions,
    );
    expect(series(option)[0]!.data).toEqual([
      [1, 10],
      [3, 30],
      [4, "-"],
    ]);
    expect(series(option)[0]!.connectNulls).toBe(false);
  });

  test("live theme accents update actual paints while a fixed palette stays independent of the theme", () => {
    const firstTheme = structuredClone(DEFAULT_WORKBOOK_THEME);
    firstTheme.accentColors = ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"];
    const secondTheme = structuredClone(DEFAULT_WORKBOOK_THEME);
    secondTheme.accentColors = ["#aaaaaa", "#bbbbbb", "#cccccc", "#dddddd", "#eeeeee", "#ffffff"];
    const following: SheetChart = {
      ...chart,
      presentation: { scatterStyle: "smoothMarker", themeAccent: 2 },
    };
    const fixed: SheetChart = {
      ...chart,
      presentation: { scatterStyle: "smoothMarker", palette: ["#123456", "#654321"] },
    };
    for (const [theme, expected] of [
      [firstTheme, "#333333"],
      [secondTheme, "#cccccc"],
    ] as const) {
      withNative(createChartOption(following, data, { ...dimensions, theme }), (instance) => {
        expect(instance.getVisual({ seriesIndex: 0 }, "color")).toBe(expected);
      });
      withNative(createChartOption(fixed, data, { ...dimensions, theme }), (instance) => {
        expect(instance.getVisual({ seriesIndex: 0 }, "color")).toBe("#123456");
      });
    }
    expect(following.presentation).toEqual({ scatterStyle: "smoothMarker", themeAccent: 2 });
  });

  test("changing away from XY retires only scatterStyle and returning starts with marker-only scatter", () => {
    const original: SheetChart = {
      ...chart,
      presentation: { scatterStyle: "smoothMarker", themeAccent: 4 },
    };
    const before = structuredClone(original);
    const column = changeChartType(original, "column");
    expect(column.presentation).toEqual({ themeAccent: 4 });
    const returned = changeChartType(column, "scatter");
    expect(returned.presentation?.scatterStyle).toBeUndefined();
    expect(
      series(createChartOption(returned, data, dimensions)).every(
        (item) => item.type === "scatter",
      ),
    ).toBe(true);
    expect(original).toEqual(before);
  });

  test("scatter insertion choices replace theme bindings with fixed palettes and restore live following explicitly", () => {
    const original: SheetChart = {
      ...chart,
      presentation: { scatterStyle: "marker", themeAccent: 5 },
    };
    const fixed = applyScatterInsertChoice(original, {
      type: "scatter",
      scatterStyle: "lineMarker",
      accent: 1,
      followTheme: false,
    });
    expect(fixed.presentation?.themeAccent).toBeUndefined();
    expect(fixed.presentation?.palette?.[0]).toBe(DEFAULT_CHART_PALETTE[1]);
    const following = applyScatterInsertChoice(fixed, {
      type: "scatter",
      scatterStyle: "smooth",
      accent: 4,
      followTheme: true,
    });
    expect(following.presentation).toMatchObject({ scatterStyle: "smooth", themeAccent: 4 });
    expect(following.presentation?.palette).toBeUndefined();
    expect(original.presentation).toEqual({ scatterStyle: "marker", themeAccent: 5 });
  });
});
