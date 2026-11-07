import type { EChartsOption } from "echarts";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";

/** Clustered bars list their series from top to bottom in the legend and data table. */
export function reversesBarLegendOrder(chart: SheetChart): boolean {
  return (
    chart.type === "bar" &&
    !chart.stacked &&
    !chart.presentation?.percentStacked &&
    !chart.format?.series?.some((series) => series.axis === "secondary") &&
    chart.format?.categoryAxis?.reverse !== true
  );
}

/** Overlapping series keep source paint order so the front bars remain visible. */
export function reversesChartSeriesSlots(chart: SheetChart): boolean {
  return reversesBarLegendOrder(chart) && (chart.format?.bar?.overlap ?? 0) <= 0;
}

/** The reversal is its own inverse: usable in either source/render direction. */
export function chartSeriesSlotIndex(chart: SheetChart, count: number, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= count) return -1;
  return reversesChartSeriesSlots(chart) ? count - 1 - index : index;
}

/** Apply only after all source-indexed style, label and legend projections. */
export function applyChartSeriesRenderOrder(
  option: EChartsOption,
  chart: SheetChart,
): EChartsOption {
  return reversesChartSeriesSlots(chart) && Array.isArray(option.series)
    ? { ...option, series: [...option.series].reverse() }
    : option;
}
