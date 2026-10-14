import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { init } from "./chart-runtime";
import { createChartOption } from "./chart-option";
import {
  createChartDataTablePlan,
  prepareChartDataTableOption,
  applyChartDataTableGraphics,
} from "./chart-data-table";

/** Complete detached preparation, including native contained-axis/column geometry.
 * It owns no DOM mount, screen engine, document state or history. */
export function preflightChartDataTable(
  chart: SheetChart,
  data: ChartData,
  dimensions: { width: number; height: number },
): void {
  const plan = createChartDataTablePlan(chart, data, dimensions);
  if (!plan) return;
  const option = prepareChartDataTableOption(createChartOption(chart, data, dimensions), plan);
  const instance = init(null, undefined, { renderer: "svg", ssr: true, ...dimensions });
  try {
    instance.setOption(option, { notMerge: true, lazyUpdate: false, silent: true });
    applyChartDataTableGraphics(instance, plan);
  } finally {
    instance.dispose();
  }
}
