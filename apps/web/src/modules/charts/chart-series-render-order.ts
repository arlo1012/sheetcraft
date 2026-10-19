import type { EChartsOption } from "echarts";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";

/** WPS minMax clustered bars place the first source series at the bottom of a group. */
export function reversesChartSeriesSlots(chart: SheetChart): boolean {
  return (
    chart.type === "bar" &&
    !chart.stacked &&
    (chart.format?.bar?.overlap ?? 0) <= 0 &&
    !chart.presentation?.percentStacked &&
    !chart.format?.series?.some((series) => series.axis === "secondary") &&
    chart.format?.categoryAxis?.reverse !== true
  );
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
