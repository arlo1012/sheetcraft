import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  getChartFormatTargets,
  chartFormatTargetKey,
  type ChartFormatTarget,
} from "./chart-format-pane";

export type ChartElementSelection = { owner: SheetChartDrawing; target: ChartFormatTarget };

/** Native chart events select real stable sources, never a series name or mutable index. */
export function getChartFormatClickTarget(
  event: unknown,
  chart: SheetChart,
  data: ChartData,
): ChartFormatTarget | undefined {
  if (!event || typeof event !== "object") return;
  const record = event as Record<string, unknown>;
  const targets = getChartFormatTargets(chart, data);
  let target: ChartFormatTarget | undefined;
  if (record.componentType === "legend") target = { kind: "legend" };
  else if (record.componentType === "title") target = { kind: "title" };
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
    if (typeof id === "string")
      target = targets.find((entry) => entry.kind === "series" && entry.seriesId === id);
    const visibleIndex = chart.type === "radar" ? record.dataIndex : record.seriesIndex;
    if (
      !target &&
      !chart.source &&
      typeof visibleIndex === "number" &&
      Number.isInteger(visibleIndex)
    ) {
      const index = visibleIndex;
      const band = index >= 0 ? data.series[index]?.rangeBand : undefined;
      if (band)
        target = targets.find(
          (entry) =>
            entry.kind === "series" &&
            entry.rangeBand?.seriesBy === band.seriesBy &&
            entry.rangeBand.index === band.index,
        );
    }
  }
  return target &&
    targets.some((entry) => chartFormatTargetKey(entry) === chartFormatTargetKey(target))
    ? target
    : undefined;
}
