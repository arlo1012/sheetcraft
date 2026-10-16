import { describe, expect, test } from "vitest";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  createChartElementLayout,
  getChartLegendLayout,
  chartLegendContainsPoint,
} from "../../../modules/charts/chart-element-layout";
import { init } from "../../../modules/charts/chart-runtime";
import { createChartOption } from "../../../modules/charts/chart-option";
const chart: SheetChart = {
  type: "column",
  range: null,
  title: "Title",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: false,
  stacked: false,
  showHidden: false,
};
const data: ChartData = {
  categories: ["A", "B"],
  records: [],
  series: [{ name: "Long 图例\nlabel".repeat(25), values: [1, 2] }],
};
const dimensions = { width: 480, height: 300 };

describe("shared legend viewport contract", () => {
  test.each(["top", "bottom", "left", "right", "topRight"] as const)(
    "%s geometry is shared with the renderer for overlay and reserved strips",
    (position) => {
      for (const legendOverlay of [false, true]) {
        const input = { ...chart, elements: { legendPosition: position, legendOverlay } };
        const layout = getChartLegendLayout(input, data, dimensions)!;
        const rendered = createChartElementLayout(input, data, dimensions)!;
        expect(layout.bounds.width).toBeLessThanOrEqual(rendered.legendBounds!.width);
        expect(layout.bounds.height).toBeLessThanOrEqual(rendered.legendBounds!.height);
        const { x, y, width, height } = layout.bounds;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + width).toBeLessThanOrEqual(dimensions.width);
        expect(y + height).toBeLessThanOrEqual(dimensions.height);
        expect(chartLegendContainsPoint(layout.bounds, x + width / 2, y + height / 2)).toBe(true);
        expect(chartLegendContainsPoint(layout.bounds, x - 1, y)).toBe(false);
        expect(chartLegendContainsPoint(layout.bounds, NaN, y)).toBe(false);
        expect(layout.option).toMatchObject({
          width,
          height,
          textStyle: { overflow: "truncate" },
        });
      }
    },
  );
  test.each([
    ["销售额", "成本"],
    ["Revenue", "Cost"],
  ])("actual SVG legend keeps longest ordinary short name %s intact", (longest, shorter) => {
    const source: ChartData = {
      categories: ["A", "B"],
      records: [],
      series: [
        { name: longest, values: [1, 2] },
        { name: shorter, values: [2, 3] },
      ],
    };
    for (const position of [undefined, "top", "bottom", "left", "right", "topRight"] as const) {
      const input = { ...chart, ...(position ? { elements: { legendPosition: position } } : {}) };
      const layout = getChartLegendLayout(input, source, dimensions)!;
      const option = createChartOption(input, source, dimensions);
      if (!option.legend || Array.isArray(option.legend)) throw new Error("Expected one legend");
      option.legend = {
        ...option.legend,
        ...layout.option,
        formatter: option.legend.formatter,
        selectedMode: false,
      };
      expect(option.legend.width).toBe(layout.bounds.width);
      expect(option.legend.height).toBe(layout.bounds.height);
      const instance = init(null, undefined, { renderer: "svg", ssr: true, ...dimensions });
      try {
        instance.setOption(option);
        const svg = instance.renderToSVGString();
        expect(svg).toContain(`>${longest}</text>`);
        expect(svg).toContain(`>${shorter}</text>`);
        expect(svg).not.toContain("...</text>");
      } finally {
        instance.dispose();
      }
    }
  });
  test("legacy hit bounds are screen-only and do not migrate saved chart or export options", () => {
    const before = JSON.stringify(chart);
    expect(createChartElementLayout(chart, data, dimensions)).toBeUndefined();
    const bounds = getChartLegendLayout(chart, data, dimensions)!.bounds;
    expect(bounds.y).toBe(272);
    expect(bounds.width).toBeLessThan(470);
    expect(bounds.x).toBe((480 - bounds.width) / 2);
    expect(createChartOption(chart, data, dimensions).legend).toMatchObject({ bottom: 0 });
    expect(JSON.stringify(chart)).toBe(before);
  });
  test.each(["top", "bottom", "left", "right", "topRight"] as const)(
    "styled %s legend shares font, surface and outer bounds in editor and export",
    (legendPosition) => {
      const source = {
        ...data,
        series: [
          { name: "销售额", values: [1, 2] },
          { name: "Cost", values: [2, 3] },
        ],
      };
      for (const legendOverlay of [true, false]) {
        const input: SheetChart = {
          ...chart,
          elements: { legendPosition, legendOverlay },
          format: {
            legend: {
              text: {
                fontFamily: "Arial",
                fontSize: 20,
                bold: true,
                italic: true,
                color: "#123456",
              },
              surface: { fill: "#fff4cc", stroke: "#b91c1c", strokeWidth: 4 },
            },
          },
        };
        const before = JSON.stringify(input);
        const layout = getChartLegendLayout(input, source, dimensions)!;
        const option = createChartOption(input, source, dimensions);
        if (!option.legend || Array.isArray(option.legend)) throw new Error("Expected one legend");
        expect(option.legend).toMatchObject({
          left: layout.bounds.x + 2,
          top: layout.bounds.y + 2,
          width: layout.bounds.width - 12,
          height: layout.bounds.height - 12,
          padding: 4,
          backgroundColor: "#fff4cc",
          borderColor: "#b91c1c",
          borderWidth: 4,
          textStyle: {
            fontFamily: "Arial",
            fontSize: 20,
            fontWeight: "bold",
            fontStyle: "italic",
            color: "#123456",
            lineHeight: 24,
          },
        });
        const instance = init(null, undefined, { renderer: "svg", ssr: true, ...dimensions });
        try {
          instance.setOption(option);
          const svg = instance.renderToSVGString();
          expect(svg).toContain(">销售额</text>");
          expect(svg).toContain(">Cost</text>");
          expect(svg).toContain('fill="#fff4cc"');
          expect(svg).toContain('stroke="#b91c1c"');
          expect(svg).toContain('stroke-width="4"');
        } finally {
          instance.dispose();
        }
        expect(JSON.stringify(input)).toBe(before);
      }
    },
  );
  test("style-only edits reserve a measured strip and preserve explicit no fill/no border", () => {
    const input: SheetChart = {
      ...chart,
      format: {
        legend: {
          text: { fontSize: 24 },
          surface: { fill: "transparent", stroke: "transparent", strokeWidth: 0 },
        },
      },
    };
    const layout = createChartElementLayout(input, data, dimensions)!;
    expect(layout).toBeDefined();
    expect(layout.plot.bottom).toBeGreaterThan(40);
    expect(createChartOption(input, data, dimensions).legend).toMatchObject({
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      textStyle: { fontSize: 24 },
    });
  });
  test("large explicit font sizes stay unchanged while the viewport and text box remain bounded", () => {
    for (const legendPosition of ["top", "bottom", "left", "right", "topRight"] as const) {
      const input: SheetChart = {
        ...chart,
        elements: { legendPosition },
        format: { legend: { text: { fontSize: 256 } } },
      };
      const tiny = { width: 80, height: 60 };
      const { bounds, option } = getChartLegendLayout(input, data, tiny)!;
      expect(option.textStyle?.fontSize).toBe(256);
      expect(option.textStyle?.lineOverflow).toBe("truncate");
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(tiny.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(tiny.height);
      expect(Number(option.textStyle?.height)).toBeLessThanOrEqual(bounds.height);
    }
  });
  test.each([
    [{ strokeWidth: 3 }, "#d1d5db", 3],
    [{ stroke: "#ff0000" }, "#ff0000", 1],
    [{ stroke: "transparent" }, "transparent", 1],
    [{ stroke: "#ff0000", strokeWidth: 0 }, "#ff0000", 0],
    [{ fill: "#fff4cc" }, "transparent", 0],
  ] as const)(
    "sparse legend surface %j uses the shared XLSX effective defaults",
    (surface, borderColor, borderWidth) => {
      const input: SheetChart = { ...chart, format: { legend: { surface } } };
      expect(createChartOption(input, data, dimensions).legend).toMatchObject({
        borderColor,
        borderWidth,
      });
      expect(input.format?.legend?.surface).toEqual(surface);
    },
  );
  test("hidden, unsupported and empty legends have no hit surface", () => {
    expect(getChartLegendLayout({ ...chart, legend: false }, data, dimensions)).toBeUndefined();
    expect(getChartLegendLayout({ ...chart, type: "wordCloud" }, data, dimensions)).toBeUndefined();
    expect(getChartLegendLayout(chart, { ...data, series: [] }, dimensions)).toBeUndefined();
    expect(
      getChartLegendLayout(chart, { ...data, series: [{ name: "empty", values: [] }] }, dimensions),
    ).toBeUndefined();
    expect(chartLegendContainsPoint(undefined, 0, 0)).toBe(false);
  });
  test("tiny viewports remain clipped and nonnegative", () => {
    for (const legendPosition of ["top", "bottom", "left", "right", "topRight"] as const) {
      const { bounds } = getChartLegendLayout({ ...chart, elements: { legendPosition } }, data, {
        width: 20,
        height: 15,
      })!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(20);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(15);
    }
  });
});
