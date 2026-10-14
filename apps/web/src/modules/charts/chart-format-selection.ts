import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  getChartFormatTargets,
  chartFormatTargetKey,
  type ChartFormatTarget,
} from "./chart-format-pane";

/** Native chart events select real stable sources, never a series name or mutable index. */
export function getChartFormatClickTarget(
  event: unknown,
  chart: SheetChart,
  data: ChartData,
): ChartFormatTarget | undefined {
  if (!event || typeof event !== "object") return;
  const record = event as Record<string, unknown>;
  let target: ChartFormatTarget | undefined;
  if (record.componentType === "title") target = { kind: "title" };
  else if (record.componentType === "xAxis" || record.componentType === "yAxis") {
    const value = (chart.type === "bar") === (record.componentType === "xAxis");
    target = value
      ? { kind: record.componentIndex === 1 ? "secondaryValueAxis" : "valueAxis" }
      : { kind: "categoryAxis" };
  } else if (record.componentType === "series") {
    const item = record.data;
    const id =
      chart.type === "radar" && item && typeof item === "object" && "id" in item
        ? item.id
        : record.seriesId;
    if (typeof id === "string") target = { kind: "series", seriesId: id };
  }
  return target &&
    getChartFormatTargets(chart, data).some(
      (entry) => chartFormatTargetKey(entry) === chartFormatTargetKey(target),
    )
    ? target
    : undefined;
}
