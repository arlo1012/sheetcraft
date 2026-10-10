import {
  getSheetChartData,
  normalizeSheetChart,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import { normalizeSheetDrawing, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createWorkbookEvaluator, type Sheet, type Workbook } from "@sheetcraft/core/workbook";
import { columnChartXml, validXmlText, type ColumnChartSource } from "./column-chart-xml.js";
import {
  addDrawingContentType,
  appendNativeChartDrawing,
  nextDrawingPart,
} from "./drawing-parts.js";
import { nativeDrawingAnchor } from "./drawing-geometry.js";
import type { CompatibilityReportBuilder } from "./report.js";

/** Emit a proven source with shared placement; ownership is explicit in the caller. */
export function writeNativeColumnChart(
  entries: Record<string, Uint8Array>,
  workbook: Workbook,
  sheet: Sheet,
  sheetPart: string,
  drawing: SheetChartDrawing,
  source: ColumnChartSource,
  report?: CompatibilityReportBuilder,
  pivotIdentity?: string,
): void {
  const issuePath = `${sheet.name}.drawings[${JSON.stringify(drawing.id)}]`;
  let anchor;
  try {
    normalizeSheetDrawing(drawing);
    anchor = nativeDrawingAnchor(
      sheet,
      drawing.anchor.row,
      drawing.anchor.column,
      drawing.offsetX,
      drawing.offsetY,
      drawing.width,
      drawing.height,
    );
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    report?.add("feature-omitted", "warning", issuePath);
    return;
  }
  const part = nextDrawingPart(entries, "chart");
  entries[part] = columnChartXml(workbook, sheet.name, drawing, source, pivotIdentity);
  addDrawingContentType(
    entries,
    part,
    "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
  );
  appendNativeChartDrawing(entries, sheetPart, drawing, part, anchor);
  report?.add("style-omitted", "warning", `${issuePath}.style`);
}

export function ordinaryColumnChartSource(workbook: Workbook, sheet: Sheet, input: SheetChart) {
  let chart: SheetChart;
  try {
    chart = normalizeSheetChart(input);
  } catch {
    return;
  }
  const range = chart.range;
  if (
    !range ||
    chart.pivotTableId !== undefined ||
    chart.dataCache !== undefined ||
    chart.type !== "column" ||
    chart.stacked ||
    !chart.headerRow ||
    !chart.headerColumn ||
    chart.seriesBy !== "columns" ||
    range.end.row <= range.start.row ||
    range.end.column <= range.start.column ||
    (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1) > 10000 ||
    ![sheet.name, chart.title].every(validXmlText)
  )
    return;
  const rows = Array.from(
    { length: range.end.row - range.start.row },
    (_, index) => range.start.row + 1 + index,
  );
  const columns = Array.from(
    { length: range.end.column - range.start.column },
    (_, index) => range.start.column + 1 + index,
  );
  // Compact visible cells cannot be represented by this contiguous native range.
  if (
    !chart.showHidden &&
    (rows.some((row) => sheet.hiddenRows?.has(row)) ||
      columns.some((column) => sheet.hiddenColumns?.has(column)) ||
      sheet.hiddenRows?.has(range.start.row) ||
      sheet.hiddenColumns?.has(range.start.column))
  )
    return;
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  // This slice proves text category/header references, not native date/numeric axes.
  if (
    rows.some((row) => {
      const value = evaluator.getComputedValue({ row, column: range.start.column });
      return value !== null && typeof value !== "string";
    }) ||
    columns.some((column) => {
      const value = evaluator.getComputedValue({ row: range.start.row, column });
      return value !== null && typeof value !== "string";
    })
  )
    return;
  const data = getSheetChartData(sheet, chart, evaluator);
  if (
    data.categories.length !== rows.length ||
    data.series.length !== columns.length ||
    !data.series.some((series) => series.values.some((value) => value !== null)) ||
    [...data.categories, ...data.series.map((series) => series.name)].some(
      (value) => value.length > 32767 || !validXmlText(value),
    )
  )
    return;
  return {
    data,
    rows,
    columns,
    headerRow: range.start.row,
    categoryColumn: range.start.column,
    names: data.series.map((series) => series.name),
  };
}

/** Ordinary clustered-column charts, retaining their live worksheet dependency. */
export function writeXlsxColumnCharts(
  entries: Record<string, Uint8Array>,
  workbook: Workbook,
  report?: CompatibilityReportBuilder,
): void {
  for (const [index, sheet] of [...workbook.sheets.values()].entries()) {
    for (const drawing of sheet.drawings ?? []) {
      if (drawing.kind !== "chart" || drawing.chart.pivotTableId !== undefined) continue;
      const source =
        drawing.rotation === 0 && validXmlText(drawing.name)
          ? ordinaryColumnChartSource(workbook, sheet, drawing.chart)
          : undefined;
      if (!source) {
        report?.add(
          "feature-omitted",
          "warning",
          `${sheet.name}.drawings[${JSON.stringify(drawing.id)}]`,
        );
        continue;
      }
      writeNativeColumnChart(
        entries,
        workbook,
        sheet,
        `xl/worksheets/sheet${index + 1}.xml`,
        drawing,
        source,
        report,
      );
    }
  }
}
