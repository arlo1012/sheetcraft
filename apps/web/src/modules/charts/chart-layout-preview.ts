import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";

/** Disposable screen paint only. The original drawing still owns every interaction. */
export type ChartLayoutPreview = {
  owner: SheetChartDrawing;
  chart: SheetChart;
};
