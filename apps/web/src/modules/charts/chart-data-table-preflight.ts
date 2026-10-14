import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import type { ChartComboSeriesChange } from "@sheetcraft/core/chart-combo";
import { init } from "./chart-runtime";
import { createChartOption } from "./chart-option";
import {
  countChartDataTableText,
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
  sourceData: ChartData = data,
  comboSeriesChanges?: readonly ChartComboSeriesChange[],
): void {
  // A visibility mask does not relax the admission budget of the source owner.
  countChartDataTableText(chart, sourceData);
  const plan = createChartDataTablePlan(chart, data, dimensions, comboSeriesChanges);
  if (!plan) return;
  const option = prepareChartDataTableOption(
    createChartOption(chart, data, dimensions, comboSeriesChanges),
    plan,
  );
  const instance = init(null, undefined, { renderer: "svg", ssr: true, ...dimensions });
  try {
    instance.setOption(option, { notMerge: true, lazyUpdate: false, silent: true });
    applyChartDataTableGraphics(instance, plan);
  } finally {
    instance.dispose();
  }
}
