import { hasShapeObjectFrame } from "@sheetcraft/core/sheet-drawings";
import { getNativeTextBoxUnsupportedPath } from "./textbox-capabilities.js";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import { createWorkbookEvaluator, type Sheet, type Workbook } from "@sheetcraft/core/workbook";
import type { EmittedPivotTable } from "./pivot-tables.js";
import type { CompatibilityReportBuilder } from "./report.js";
import { writeNativeColumnChart } from "./column-charts.js";

import { validXmlText, type ColumnChartSource } from "./column-chart-xml.js";

function chartSource(
  workbook: Workbook,
  sheet: Sheet,
  pivot: SheetPivotTable,
  drawing: SheetChartDrawing,
): ColumnChartSource | undefined {
  const range = pivot.outputRange;
  const layout = pivot.resultLayout;
  if (
    !range ||
    !layout ||
    layout.labelColumns !== 1 ||
    !layout.dataRows.length ||
    pivot.rowFields.length !== 1 ||
    pivot.columnFields.length !== 1 ||
    pivot.values.length !== 1 ||
    pivot.groups?.length ||
    pivot.consolidation ||
    pivot.values[0]?.display ||
    !layout.headerRows ||
    drawing.chart.dataCache !== undefined
  )
    return;
  const rows = layout.dataRows.map((offset) => range.start.row + offset);
  if (rows.some((row, index) => row > range.end.row || (index > 0 && row !== rows[index - 1]! + 1)))
    return;
  const lastColumn = range.end.column - Number(pivot.columnTotals && !!pivot.columnFields.length);
  const columns = Array.from(
    { length: Math.max(0, lastColumn - range.start.column) },
    (_, index) => range.start.column + index + 1,
  );
  if (
    !columns.length ||
    (!drawing.chart.showHidden &&
      (rows.some((row) => sheet.hiddenRows?.has(row)) ||
        columns.some((column) => sheet.hiddenColumns?.has(column))))
  )
    return;
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  const data = getSheetChartData(sheet, drawing.chart, evaluator);
  const headerRow = range.start.row + layout.headerRows - 1;
  const names = columns.map((column) =>
    String(evaluator.getComputedValue({ row: headerRow, column }) ?? ""),
  );
  if (
    data.categories.length !== rows.length ||
    data.series.length !== columns.length ||
    !data.series.some((series) => series.values.some((value) => value !== null)) ||
    data.categories.some((value) => !validXmlText(value)) ||
    names.some((name) => !validXmlText(name))
  )
    return;
  return {
    data,
    valueRanges: columns.map((column) => ({
      start: { row: rows[0]!, column },
      end: { row: rows.at(-1)!, column },
    })),
    nameRanges: columns.map((column) => ({
      start: { row: headerRow, column },
      end: { row: headerRow, column },
    })),
    categoryRange: {
      start: { row: rows[0]!, column: pivot.anchor.column },
      end: { row: rows.at(-1)!, column: pivot.anchor.column },
    },
    names,
  };
}

/** Export only populated, genuine linked clustered-column reports in this slice. */
export function writeXlsxPivotCharts(
  entries: Record<string, Uint8Array>,
  workbook: Workbook,
  pivots: ReadonlyMap<SheetPivotTable, EmittedPivotTable>,
  filename: string,
  report?: CompatibilityReportBuilder,
): void {
  for (const sheet of workbook.sheets.values()) {
    for (const drawing of sheet.drawings ?? []) {
      if (
        drawing.kind === "textBox" &&
        hasShapeObjectFrame(drawing) &&
        getNativeTextBoxUnsupportedPath(drawing, sheet) === undefined
      )
        continue;
      if (drawing.kind === "chart" && drawing.chart.pivotTableId === undefined) continue;
      const issuePath = `${sheet.name}.drawings[${JSON.stringify(drawing.id)}]`;
      const pivot =
        drawing.kind === "chart"
          ? sheet.pivotTables?.find((table) => table.id === drawing.chart.pivotTableId)
          : undefined;
      const native = pivot && pivots.get(pivot);
      const supported =
        drawing.kind === "chart" &&
        native &&
        native.axisItems &&
        drawing.chart.type === "column" &&
        !drawing.chart.stacked &&
        drawing.rotation === 0 &&
        !!filename.trim() &&
        !/[[\]!/\\]/.test(filename) &&
        !/[[\]!]/.test(native.sheet.name + native.name) &&
        [filename, native.sheet.name, native.name, drawing.name, drawing.chart.title].every(
          validXmlText,
        );
      const source = supported ? chartSource(workbook, sheet, pivot, drawing) : undefined;
      if (!source || drawing.kind !== "chart" || !native || !pivot) {
        report?.add("feature-omitted", "warning", issuePath);
        continue;
      }
      writeNativeColumnChart(
        entries,
        workbook,
        sheet,
        native.sheetPart,
        drawing,
        source,
        report,
        `[${filename}]${native.sheet.name}!${native.name}`,
      );
    }
  }
}
