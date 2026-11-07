import type { ChartData, ChartType, SheetChart } from "@sheetcraft/core/sheet-charts";
import type { ChartComboSeriesChange } from "@sheetcraft/core/chart-combo";
import { applyChartDesignIntent, type DynamicChartTemplate } from "./chart-design-intents";

export const dynamicChartFamilies = [
  "column",
  "line",
  "pie",
  "combo",
  "bar",
  "rose",
  "wordCloud",
  "funnel",
  "area",
  "scatter",
  "gauge",
  "sankey",
  "liquid",
  "waterfall",
  "venn",
  "treemap",
] as const;
export type DynamicChartFamily = (typeof dynamicChartFamilies)[number];
export function templatesFor(family: DynamicChartFamily): DynamicChartTemplate[] {
  return (["office", "forest", "dark"] as const).map((style, i) => ({
    type: family === "pie" && i === 1 ? "doughnut" : family,
    style,
    labels: i !== 0 || ["gauge", "liquid", "venn"].includes(family),
  }));
}
// Samples belong only to thumbnails; insertion always uses the user's sheet.
export function templatePreview(template: DynamicChartTemplate, title: string) {
  const categories = ["A", "B", "C", "D"];
  const values =
    template.type === "waterfall"
      ? [24, 18, -52, 38]
      : template.type === "venn"
        ? [80, 55, 22]
        : [32, 64, 47, 81];
  const data: ChartData = {
    categories: categories.slice(0, values.length),
    series: [
      { name: "A", values },
      { name: "B", values: values.map((v, i) => Math.abs(v) * 0.65 + 8 * i) },
    ],
    records: [
      ["A", "C", 8],
      ["B", "C", 12],
      ["C", "D", 20],
    ],
  };
  const chart: SheetChart = applyChartDesignIntent(
    {
      type: template.type,
      title,
      range: { start: { row: 0, column: 0 }, end: { row: values.length, column: 2 } },
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: false,
      labels: template.labels,
      stacked: false,
      showHidden: false,
    },
    { kind: "style", style: template.style },
  );
  // Keep the same two-series recipe as the editor's column/line combination.
  const combo: ChartComboSeriesChange[] | undefined =
    template.type === "combo"
      ? data.series.map((entry, i) => {
          entry.rangeBand = { seriesBy: "columns", index: i + 1 };
          return {
            rangeBand: entry.rangeBand,
            drawType: i === 0 ? "column" : "line",
            axis: "primary",
            markers: false,
          };
        })
      : undefined;
  return { chart, data, combo };
}
export function galleryTypeLabel(type: ChartType) {
  return type === "combo" ? ("chart.comboCategory" as const) : (`chart.${type}` as const);
}
