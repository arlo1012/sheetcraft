import type { ChartType, SheetChart } from "@sheetcraft/core/sheet-charts";

/** Controls describe actual renderers, rather than every persisted boolean. */
export function getChartElementCapabilities(type: ChartType) {
  const bars = type === "column" || type === "bar";
  return {
    title: true,
    legend: type !== "treemap" && type !== "sankey" && type !== "wordCloud",
    labels: type !== "wordCloud",
    labelPosition: bars,
    stacked: bars || type === "line" || type === "area",
  };
}

/** Reading defaults never adds settings to old charts or discards dormant settings. */
export function getChartElementSettings(chart: SheetChart) {
  return {
    titlePosition: chart.elements?.titlePosition ?? "above",
    legendPosition: chart.elements?.legendPosition ?? "bottom",
    legendOverlay: chart.elements?.legendOverlay ?? false,
    labelPosition: chart.elements?.labelPosition ?? "center",
  } as const;
}
