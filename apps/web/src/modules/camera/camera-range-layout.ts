import {
  getDefaultColumnWidth,
  getDefaultRowHeight,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import {
  createSheetHiddenColumnIntervals,
  createSheetHiddenRowIntervals,
} from "../sheet-grid/data-visibility";

/** Camera size and paint share the actual visible source geometry. */
export function createCameraRangeLayout(
  sheet: Sheet,
  range: CellRange,
  evaluator?: SheetEvaluator,
) {
  const rowCount = range.end.row + 1;
  const columnCount = range.end.column + 1;
  const geometry = createSheetGeometry({
    rowCount,
    columnCount,
    rowHeight: getDefaultRowHeight(sheet),
    columnWidth: getDefaultColumnWidth(sheet),
    rowHeights: sheet.rowHeights,
    columnWidths: sheet.columnWidths,
    hiddenRows: sheet.hiddenRows,
    hiddenColumns: [
      ...(sheet.hiddenColumns ?? []),
      ...createSheetHiddenColumnIntervals(sheet).flatMap(({ start, end }) =>
        Array.from({ length: end - start + 1 }, (_, index) => start + index),
      ),
    ],
  });
  const rows = createRowVisibilityIndex({
    rowCount,
    defaultRowHeight: getDefaultRowHeight(sheet),
    rowHeights: sheet.rowHeights,
    hiddenRows: sheet.hiddenRows,
    hiddenIntervals: createSheetHiddenRowIntervals(sheet, evaluator),
  });
  const x = geometry.getColumnOffset(range.start.column);
  const y = rows.getBoundaryOffset(range.start.row) ?? 0;
  const width = geometry.getTotalSize().width - x;
  const height = (rows.getBoundaryOffset(range.end.row + 1) ?? y) - y;
  return { geometry, rows, rowCount, columnCount, x, y, width, height };
}

export function fitCameraSize(width: number, height: number) {
  const scale = Math.min(1, 800 / Math.max(1, width), 600 / Math.max(1, height));
  return { width: Math.max(1, width * scale), height: Math.max(1, height * scale) };
}
