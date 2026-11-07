import type { DashboardWidget } from "@sheetcraft/core/dashboard";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { createChartOption } from "../charts/chart-option";

export function dashboardChartOption(
  widget: DashboardWidget,
  data: ChartData,
  width: number,
  height: number,
) {
  const chart: SheetChart = {
    type:
      widget.kind === "combo"
        ? "column"
        : widget.kind === "text" || widget.kind === "number"
          ? "column"
          : widget.kind,
    title: "",
    range: null,
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: widget.legend,
    labels: widget.labels,
    stacked: false,
    showHidden: true,
  };
  const option = createChartOption(chart, data, { width, height });
  if (widget.kind === "combo" && Array.isArray(option.series))
    option.series = option.series.map((item, i) =>
      i % 2
        ? {
            type: "line",
            name: data.series[i]!.name,
            data: data.series[i]!.values,
            label: { show: widget.labels },
          }
        : item,
    );
  option.animation = false;
  return option;
}
