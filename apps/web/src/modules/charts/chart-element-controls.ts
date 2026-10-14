import type { ChartElementSettings, SheetChart } from "@sheetcraft/core/sheet-charts";

/** One complete chart-element edit, applied as one workbook command. */
export type ChartElementPatch = Partial<
  Pick<SheetChart, "title" | "legend" | "labels" | "stacked">
> & {
  elements?: ChartElementSettings;
};
