import type { ChartType, SheetChart } from "@sheetcraft/core/sheet-charts";
import { normalizeSheetChart } from "@sheetcraft/core/sheet-charts";
import {
  resolveChartComboSeriesSettings,
  type ChartComboSeriesChange,
  type ChartComboSeriesTarget,
} from "@sheetcraft/core/chart-combo";

function hasComboColumns(input: SheetChart, changes?: readonly ChartComboSeriesChange[]): boolean {
  try {
    const chart = normalizeSheetChart(input);
    const targets: ChartComboSeriesTarget[] = [];
    if (chart.source) targets.push(...chart.source.series.map((entry) => ({ seriesId: entry.id })));
    else if (chart.range) {
      const rows = chart.seriesBy === "rows",
        axis = rows ? "row" : "column";
      const start = chart.range.start[axis] + Number(rows ? chart.headerRow : chart.headerColumn);
      const end = chart.range.end[axis];
      if (end - start + 1 > 256) return false;
      for (let index = start; index <= end; index++)
        targets.push({ rangeBand: { seriesBy: chart.seriesBy, index } });
    }
    return targets.some(
      (target) => resolveChartComboSeriesSettings(chart, target, changes).drawType === "column",
    );
  } catch {
    return false;
  }
}

/** Controls describe actual renderers, rather than every persisted boolean. */
export function getChartElementCapabilities(
  type: ChartType,
  chart?: SheetChart,
  comboChanges?: readonly ChartComboSeriesChange[],
) {
  const bars = type === "column" || type === "bar";
  return {
    title: true,
    legend: type !== "treemap" && type !== "sankey" && type !== "wordCloud",
    labels: type !== "wordCloud",
    labelPosition: bars || (type === "combo" && (!chart || hasComboColumns(chart, comboChanges))),
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
