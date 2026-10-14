import { describe, expect, test } from "vitest";
import type { ChartData, ChartType, SheetChart } from "@sheetcraft/core/sheet-charts";
import { createChartOption } from "../../../modules/charts/chart-option";
import {
  getChartElementCapabilities,
  getChartElementSettings,
} from "../../../modules/charts/chart-elements";

const chart: SheetChart = {
  type: "column",
  range: null,
  title: "Retained title",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: true,
  stacked: false,
  showHidden: false,
};
const data: ChartData = {
  categories: ["Positive", "Negative", "Missing"],
  series: [{ name: "Apples", values: [60, -45, null] }],
  records: [],
};
type TestOption = {
  title: { text: string; show?: boolean };
  legend: {
    show: boolean;
    orient?: string;
    left?: number | string;
    top?: number;
    bottom?: number;
    width?: number;
    height?: number;
  };
  grid: { top: number; left: number; right: number; bottom: number; containLabel?: boolean };
  series: Array<{
    data: Array<number | null | { value: number; label: { position: string } }>;
    label: { show: boolean; formatter?: (params: { value: number }) => string };
    stack?: string;
  }>;
};
function option(changes: Partial<SheetChart> = {}, source = data) {
  return createChartOption({ ...chart, ...changes }, source, {
    width: 480,
    height: 300,
  }) as unknown as TestOption;
}

describe("chart element settings and applicability", () => {
  test("effective defaults leave old charts sparse", () => {
    expect(getChartElementSettings(chart)).toEqual({
      titlePosition: "above",
      legendPosition: "bottom",
      legendOverlay: false,
      labelPosition: "center",
    });
    expect(chart.elements).toBeUndefined();
  });
  test.each(["treemap", "sankey", "wordCloud"] as const)(
    "%s cannot offer a fake legend",
    (type) => {
      expect(getChartElementCapabilities(type).legend).toBe(false);
    },
  );
  test("word cloud text is its plot, rather than toggleable data labels", () => {
    expect(getChartElementCapabilities("wordCloud")).toEqual({
      title: true,
      legend: false,
      labels: false,
      labelPosition: false,
      stacked: false,
    });
  });
  test.each(["line", "area", "scatter", "radar"] as const)(
    "%s keeps labels but has no bar-specific label placements",
    (type) => {
      expect(getChartElementCapabilities(type)).toMatchObject({
        labels: true,
        labelPosition: false,
      });
      const old = option({ type });
      const positioned = option({ type, elements: { labelPosition: "insideBase" } });
      expect(positioned.series.map((entry) => entry.data)).toEqual(
        old.series.map((entry) => entry.data),
      );
      expect(positioned.series.map((entry) => entry.label.show)).toEqual(
        old.series.map((entry) => entry.label.show),
      );
    },
  );
  test.each([
    ["column", true],
    ["bar", true],
    ["line", true],
    ["area", true],
    ["pie", false],
    ["doughnut", false],
    ["scatter", false],
    ["radar", false],
    ["treemap", false],
    ["sankey", false],
    ["river", false],
    ["wordCloud", false],
  ] as const)("%s stack applicability is %s", (type, stacked) => {
    expect(getChartElementCapabilities(type).stacked).toBe(stacked);
  });
});

describe("chart element options", () => {
  test("an absent or empty settings object retains the original option geometry", () => {
    const old = option();
    expect(old.grid).toEqual({ top: 45, left: 48, right: 22, bottom: 58 });
    expect(old.legend).toEqual({ show: true, bottom: 0, type: "scroll" });
    expect(old.series[0]!.data).toEqual([60, -45, null]);
    expect(option({ elements: {} })).toEqual(old);
    expect(option({ title: "", legend: false }).grid).toEqual({
      top: 15,
      left: 48,
      right: 22,
      bottom: 35,
    });
  });
  test("none retains title text and overlay releases above-chart plot space", () => {
    const above = option({ elements: { titlePosition: "above" } });
    const overlay = option({ elements: { titlePosition: "overlay" } });
    const none = option({ elements: { titlePosition: "none" } });
    expect(none.title).toMatchObject({ text: chart.title, show: false });
    expect(overlay.title.show).toBe(true);
    expect(above.grid.top).toBeGreaterThan(overlay.grid.top);
    expect(none.grid.top).toBe(overlay.grid.top);
  });
  test.each(["top", "bottom", "left", "right", "topRight"] as const)(
    "%s legend has actual bounded placement and reserves the corresponding plot edge",
    (legendPosition) => {
      const solid = option({ elements: { legendPosition } });
      const overlay = option({ elements: { legendPosition, legendOverlay: true } });
      for (const key of ["show", "orient", "left", "top", "width", "height"] as const)
        expect(solid.legend[key]).toEqual(overlay.legend[key]);
      expect(solid.legend.width).toBeGreaterThan(0);
      expect(solid.legend.height).toBeGreaterThan(0);
      const edge = legendPosition === "topRight" ? "right" : legendPosition;
      expect(solid.grid[edge]).toBeGreaterThan(overlay.grid[edge]);
      expect(solid.legend.orient).toBe(
        ["left", "right", "topRight"].includes(legendPosition) ? "vertical" : "horizontal",
      );
    },
  );
  test("hidden legend reserves nothing even when its dormant position is retained", () => {
    const elements = { legendPosition: "left" as const };
    expect(option({ legend: false, elements }).grid).toEqual(
      option({ legend: false, elements: { ...elements, legendOverlay: true } }).grid,
    );
  });
  test.each([
    ["column", "center", "inside", "inside"],
    ["column", "insideEnd", "insideTop", "insideBottom"],
    ["column", "insideBase", "insideBottom", "insideTop"],
    ["column", "outsideEnd", "top", "bottom"],
    ["bar", "center", "inside", "inside"],
    ["bar", "insideEnd", "insideRight", "insideLeft"],
    ["bar", "insideBase", "insideLeft", "insideRight"],
    ["bar", "outsideEnd", "right", "left"],
  ] as const)("%s %s respects both signs and nulls", (type, labelPosition, positive, negative) => {
    const result = option({ type, stacked: true, elements: { labelPosition } });
    expect(result.series[0]!.data).toEqual([
      { value: 60, label: { position: positive } },
      { value: -45, label: { position: negative } },
      null,
    ]);
    expect(result.series[0]!.stack).toBe("total");
  });
  test("positioned data labels still format raw numbers at presentation time", () => {
    const source: ChartData = {
      ...data,
      series: [
        {
          name: "Rate",
          values: [0.125, -0.25, null],
          numberFormat: { kind: "percent", fractionDigits: 1 },
        },
      ],
    };
    const result = option({ elements: { labelPosition: "outsideEnd" } }, source);
    expect(result.series[0]!.data[0]).toMatchObject({ value: 0.125 });
    expect(result.series[0]!.label.formatter!({ value: 0.125 })).toBe("12.5%");
    expect(result.series[0]!.label.formatter!({ value: -0.25 })).toBe("-25.0%");
  });
  test.each(["treemap", "sankey"] as const)("%s really consumes its label toggle", (type) => {
    expect(option({ type, labels: false }).series[0]!.label.show).toBe(false);
    expect(option({ type, labels: true }).series[0]!.label.show).toBe(true);
  });
  test.each(["pie", "doughnut", "radar", "river"] as ChartType[])(
    "%s uses a real reserved plot region without changing its series data",
    (type) => {
      const old = option({ type });
      const positioned = option({ type, elements: { legendPosition: "right" } });
      expect(positioned.series.map((entry) => entry.data)).toEqual(
        old.series.map((entry) => entry.data),
      );
    },
  );
});
