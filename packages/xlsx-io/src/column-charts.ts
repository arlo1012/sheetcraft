import {
  getSheetChartData,
  normalizeSheetChart,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import { normalizeSheetDrawing, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createWorkbookEvaluator,
  getCellContent,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
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

export function ordinaryColumnChartSource(
  workbook: Workbook,
  sheet: Sheet,
  input: SheetChart,
): ColumnChartSource | undefined {
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
    (chart.type !== "column" && chart.type !== "line" && chart.type !== "bar") ||
    chart.stacked ||
    (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1) > 10000 ||
    ![sheet.name, chart.title].every(validXmlText)
  )
    return;
  const firstRow = range.start.row + Number(chart.headerRow);
  const firstColumn = range.start.column + Number(chart.headerColumn);
  if (firstRow > range.end.row || firstColumn > range.end.column) return;
  // With no label references, one cell carries no evidence of the explicit
  // rows/columns option. Do not silently invent a direction on a roundtrip.
  if (
    !chart.headerRow &&
    !chart.headerColumn &&
    firstRow === range.end.row &&
    firstColumn === range.end.column
  )
    return;
  const rows = Array.from({ length: range.end.row - firstRow + 1 }, (_, index) => firstRow + index);
  const columns = Array.from(
    { length: range.end.column - firstColumn + 1 },
    (_, index) => firstColumn + index,
  );
  // Compact visible cells cannot be represented by this contiguous native range.
  if (
    !chart.showHidden &&
    (Array.from(
      { length: range.end.row - range.start.row + 1 },
      (_, i) => range.start.row + i,
    ).some((row) => sheet.hiddenRows?.has(row)) ||
      Array.from(
        { length: range.end.column - range.start.column + 1 },
        (_, i) => range.start.column + i,
      ).some((column) => sheet.hiddenColumns?.has(column)))
  )
    return;
  const byColumns = chart.seriesBy === "columns";
  const valueRanges = byColumns
    ? columns.map((column) => ({
        start: { row: firstRow, column },
        end: { row: range.end.row, column },
      }))
    : rows.map((row) => ({
        start: { row, column: firstColumn },
        end: { row, column: range.end.column },
      }));
  const nameRanges = byColumns
    ? columns.map((column) =>
        chart.headerRow
          ? { start: { row: range.start.row, column }, end: { row: range.start.row, column } }
          : null,
      )
    : rows.map((row) =>
        chart.headerColumn
          ? { start: { row, column: range.start.column }, end: { row, column: range.start.column } }
          : null,
      );
  const categoryRange = byColumns
    ? chart.headerColumn
      ? {
          start: { row: firstRow, column: range.start.column },
          end: { row: range.end.row, column: range.start.column },
        }
      : null
    : chart.headerRow
      ? {
          start: { row: range.start.row, column: firstColumn },
          end: { row: range.start.row, column: range.end.column },
        }
      : null;
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  // Actual line/bar producers prove numeric points and genuinely blank gaps.
  // No cached-text-zero normalization is inferred for these new families.
  if (
    chart.type !== "column" &&
    valueRanges.some((span) => {
      for (let row = span.start.row; row <= span.end.row; row++)
        for (let column = span.start.column; column <= span.end.column; column++) {
          const cell = { row, column };
          const value = evaluator.getComputedValue(cell);
          if (
            !(typeof value === "number" && Number.isFinite(value)) &&
            !(value === null && getCellContent(sheet, cell) === null)
          )
            return true;
        }
      return false;
    })
  )
    return;
  // This slice proves text/blank labels, not native date/numeric category axes.
  const labelCells = nameRanges.flatMap((span) => (span ? [span.start] : []));
  if (categoryRange) {
    for (let row = categoryRange.start.row; row <= categoryRange.end.row; row++)
      for (let column = categoryRange.start.column; column <= categoryRange.end.column; column++)
        labelCells.push({ row, column });
  }
  if (
    labelCells.some((cell) => {
      const value = evaluator.getComputedValue(cell);
      return value !== null && typeof value !== "string";
    })
  )
    return;
  const data = getSheetChartData(sheet, chart, evaluator);
  if (
    data.categories.length !== (byColumns ? rows.length : columns.length) ||
    data.series.length !== valueRanges.length ||
    !data.series.some((series) => series.values.some((value) => value !== null)) ||
    [...data.categories, ...data.series.map((series) => series.name)].some(
      (value) => value.length > 32767 || !validXmlText(value),
    )
  )
    return;
  return {
    data,
    valueRanges,
    nameRanges,
    categoryRange,
    names: data.series.map((series) => series.name),
  };
}

/** Proven ordinary columns/straight marker lines/horizontal bars with live worksheet dependency. */
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
