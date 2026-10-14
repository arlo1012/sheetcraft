import { describe, expect, test } from "vitest";
import {
  normalizeSheetChart,
  type ChartData,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import {
  applyChartQuickLayout,
  getChartQuickLayout,
  type ChartQuickLayoutId,
} from "../../../modules/charts/chart-quick-layout";
import { createChartOption } from "../../../modules/charts/chart-option";

const data: ChartData = {
  categories: ["east", "north", "south"],
  series: [
    { id: "a", name: "apple", values: [60, 100, 120] },
    { id: "b", name: "pear", values: [70, 80, 90] },
  ],
  records: [],
};
function chart(): SheetChart {
  return normalizeSheetChart({
    type: "column",
    range: null,
    dataCache: data,
    title: "User chart title",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: true,
    presentation: { palette: ["#ff0000", "#00ff00"], background: "#222222" },
    format: {
      categoryAxis: { title: "User categories", reverse: true },
      valueAxis: {
        title: "User amount",
        min: 0,
        max: 200,
        majorUnit: 20,
        numberFormat: { kind: "custom", code: "0.00" },
      },
      secondaryValueAxis: { title: "Secondary", max: 300 },
      series: [{ id: "a", color: "#aa1234" }],
    },
  });
}

describe("eleven concrete quick-layout patches", () => {
  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const)(
    "layout %s is a matched concrete patch without source or appearance loss",
    (id) => {
      const original = chart(),
        before = JSON.stringify(original);
      const next = applyChartQuickLayout(original, id, "坐标轴标题");
      expect(getChartQuickLayout(next)).toBe(id);
      expect(JSON.stringify(original)).toBe(before);
      expect(next.title).toBe(original.title);
      expect(next.dataCache).toEqual(original.dataCache);
      expect(next.dataCache).not.toBe(original.dataCache);
      expect(next.presentation).toEqual(original.presentation);
      expect(next.format?.series).toEqual(original.format?.series);
      expect(next.format?.secondaryValueAxis).toEqual(original.format?.secondaryValueAxis);
      expect(next.format?.categoryAxis?.title).toBe("User categories");
      expect(next.format?.valueAxis?.title).toBe("User amount");
      expect(next.format?.valueAxis?.numberFormat).toEqual(
        original.format?.valueAxis?.numberFormat,
      );
      expect(next.format?.valueAxis?.max).toBe(200);
      expect(Object.hasOwn(next, "layoutId")).toBe(false);
    },
  );
  test("table, gap-free and overlapping recipes have actual truth fields", () => {
    expect(applyChartQuickLayout(chart(), 5, "Axis Title").elements?.dataTable).toBe(
      "withLegendKeys",
    );
    expect(applyChartQuickLayout(chart(), 8, "Axis Title").format?.bar).toEqual({
      gapWidth: 0,
      overlap: 0,
    });
    const overlapping = applyChartQuickLayout(chart(), 10, "Axis Title");
    expect(overlapping.elements?.labelScope).toBe("lastSeries");
    expect(overlapping.format?.bar?.overlap).toBe(50);
  });
  test("hiding axis titles preserves their source text and painting consumes visibility", () => {
    const next = applyChartQuickLayout(chart(), 1, "Axis Title");
    const option = createChartOption(next, data);
    expect(!Array.isArray(option.xAxis) && option.xAxis?.name).toBe("");
    expect(!Array.isArray(option.yAxis) && option.yAxis?.name).toBe("");
    const shown = applyChartQuickLayout(next, 9, "Axis Title");
    const visible = createChartOption(shown, data);
    expect(!Array.isArray(visible.xAxis) && visible.xAxis?.name).toBe("User categories");
    expect(!Array.isArray(visible.yAxis) && visible.yAxis?.name).toBe("User amount");
  });
  test("gridline controls hide major lines or add bounded minor lines", () => {
    const hidden = createChartOption(applyChartQuickLayout(chart(), 8, "Axis Title"), data).yAxis;
    expect(!Array.isArray(hidden) && hidden?.splitLine?.show).toBe(false);
    const fine = createChartOption(applyChartQuickLayout(chart(), 7, "Axis Title"), data).yAxis;
    expect(!Array.isArray(fine) && fine?.minorSplitLine?.show).toBe(true);
    expect(!Array.isArray(fine) && fine?.minorTick?.splitNumber).toBe(5);
  });
  test("last-category and last-series labels render only the declared scope with raw formatted values", () => {
    function label(id: ChartQuickLayoutId, seriesIndex: number, categoryIndex: number) {
      const option = createChartOption(applyChartQuickLayout(chart(), id, "Axis Title"), data);
      const series = Array.isArray(option.series) ? option.series[seriesIndex] : option.series;
      if (!series || series.type !== "bar") throw new Error("Missing actual bar labels");
      const formatter =
        series.label && "formatter" in series.label ? series.label.formatter : undefined;
      if (typeof formatter !== "function") throw new Error("Missing actual label formatter");
      return formatter({
        componentType: "series",
        componentIndex: 0,
        componentSubType: "bar",
        seriesType: "bar",
        seriesIndex,
        seriesName: data.series[seriesIndex]!.name,
        name: data.categories[categoryIndex]!,
        dataIndex: categoryIndex,
        data: data.series[seriesIndex]!.values[categoryIndex]!,
        value: data.series[seriesIndex]!.values[categoryIndex]!,
        color: "#ffffff",
        $vars: [],
      });
    }
    expect(label(6, 0, 0)).toBe("");
    expect(label(6, 0, 2)).toBe("apple, 120");
    expect(label(10, 0, 1)).toBe("");
    expect(label(10, 1, 1)).toBe("80");
  });
  test("missing axis-title text gets only the requested localized placeholder", () => {
    const base = chart();
    delete base.format?.categoryAxis?.title;
    delete base.format?.valueAxis?.title;
    const next = applyChartQuickLayout(base, 9, "坐标轴标题");
    expect(next.format?.categoryAxis?.title).toBe("坐标轴标题");
    expect(next.format?.valueAxis?.title).toBe("坐标轴标题");
  });
  test("unsupported types, malformed IDs and placeholders do not mutate the source", () => {
    const base = chart(),
      before = JSON.stringify(base);
    expect(() => applyChartQuickLayout(base, 0 as ChartQuickLayoutId, "Axis Title")).toThrow();
    expect(() => applyChartQuickLayout(base, 1, "")).toThrow();
    expect(() => applyChartQuickLayout({ ...base, type: "line" }, 1, "Axis Title")).toThrow();
    expect(JSON.stringify(base)).toBe(before);
  });
  test("manual changes make the effective layout custom", () => {
    const base = applyChartQuickLayout(chart(), 1, "Axis Title");
    expect(
      getChartQuickLayout({ ...base, elements: { ...base.elements, legendPosition: "left" } }),
    ).toBeUndefined();
  });
});

test("Layout3 separated pair spacing differs from touching-series layouts", () => {
  const layout3 = applyChartQuickLayout(chart(), 3, "Axis Title");
  expect(layout3.format?.bar?.overlap).toBe(-25);
  expect(getChartQuickLayout(layout3)).toBe(3);
});
