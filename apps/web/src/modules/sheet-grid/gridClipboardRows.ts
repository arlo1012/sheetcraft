import { createPastePlan, getCellMatrixSize, type CellValueMatrix } from "@idea10/core/clipboard";
import { doMergedCellRangesIntersect } from "@idea10/core";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "@idea10/core/workbook";
import { createRowVisibilityIndex, type RowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import type { GridPastePlan } from "./useGridClipboard";
import { createSheetHiddenRowIntervals } from "./data-visibility";

export const MAX_GRID_CLIPBOARD_CELLS = 100_000;

export type GridClipboardAxis = "rows" | "columns";

function normalizeRange(range: CellRange): CellRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
}

function isAddressInBounds(address: CellAddress): boolean {
  return (
    Number.isSafeInteger(address.row) &&
    Number.isSafeInteger(address.column) &&
    address.row >= 0 &&
    address.row < MAX_SHEET_ROWS &&
    address.column >= 0 &&
    address.column < MAX_SHEET_COLUMNS
  );
}

function isRangeInBounds(range: CellRange): boolean {
  return isAddressInBounds(range.start) && isAddressInBounds(range.end);
}

function isWithinCellLimit(rowCount: number, columnCount: number): boolean {
  return (
    Number.isSafeInteger(rowCount) &&
    Number.isSafeInteger(columnCount) &&
    rowCount > 0 &&
    columnCount > 0 &&
    rowCount * columnCount <= MAX_GRID_CLIPBOARD_CELLS
  );
}

function getFirstVisibleRow(visibility: RowVisibilityIndex, row: number): number | null {
  return visibility.isRowVisible(row) ? row : visibility.getNextVisibleRow(row);
}

function getLastVisibleRow(visibility: RowVisibilityIndex, row: number): number | null {
  return visibility.isRowVisible(row) ? row : visibility.getPreviousVisibleRow(row);
}

function getConsecutiveVisibleRows(
  visibility: RowVisibilityIndex,
  startRow: number,
  count: number,
): number[] | null {
  const startIndex = visibility.getVisibleIndex(startRow);
  if (startIndex === null || startIndex + count > visibility.visibleRowCount) {
    return null;
  }
  const rows: number[] = [];
  for (let index = startIndex; index < startIndex + count; index += 1) {
    const row = visibility.getLogicalRow(index);
    if (row === null) return null;
    rows.push(row);
  }
  return rows;
}

function createFilteredPlan(
  values: CellValueMatrix,
  rows: number[],
  startColumn: number,
  columnCount: number,
): GridPastePlan {
  return {
    anchor: { row: rows[0]!, column: startColumn },
    range: {
      start: { row: rows[0]!, column: startColumn },
      end: { row: rows.at(-1)!, column: startColumn + columnCount - 1 },
    },
    values,
    rows,
    preserveHiddenRows: true,
  };
}

/** Builds sheet-wide row visibility independently of the current viewport extent. */
export function createGridClipboardRowVisibility(
  sheet: Sheet,
  evaluator?: SheetEvaluator,
): RowVisibilityIndex {
  return createRowVisibilityIndex({
    rowCount: MAX_SHEET_ROWS,
    defaultRowHeight: 1,
    hiddenRows: sheet.hiddenRows,
    hiddenIntervals: createSheetHiddenRowIntervals(sheet, evaluator),
  });
}

/**
 * Returns physical visible rows in a bounded range. A null result means that
 * the requested rectangle is invalid or too large for a clipboard operation.
 */
export function getVisibleClipboardRows(
  visibility: RowVisibilityIndex,
  range: CellRange,
): number[] | null {
  if (!isRangeInBounds(range)) return null;
  const normalized = normalizeRange(range);
  const columnCount = normalized.end.column - normalized.start.column + 1;

  const first = getFirstVisibleRow(visibility, normalized.start.row);
  const last = getLastVisibleRow(visibility, normalized.end.row);
  if (first === null || last === null || first > last) return [];
  const firstIndex = visibility.getVisibleIndex(first);
  const lastIndex = visibility.getVisibleIndex(last);
  if (firstIndex === null || lastIndex === null) return [];
  const visibleRowCount = lastIndex - firstIndex + 1;
  if (!isWithinCellLimit(visibleRowCount, columnCount)) return null;

  const rows: number[] = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const row = visibility.getLogicalRow(index);
    if (row === null) return null;
    rows.push(row);
  }
  return rows;
}

/**
 * A cut can reconcile borders on cells immediately outside its rectangles.
 * Keep one physical row of clearance so filtered-out rows cannot be mutated.
 */
export function rangeTouchesHiddenClipboardRows(
  visibility: RowVisibilityIndex,
  range: CellRange,
): boolean {
  if (!isRangeInBounds(range)) return true;
  const normalized = normalizeRange(range);
  const start = Math.max(0, normalized.start.row - 1);
  const end = Math.min(visibility.rowCount - 1, normalized.end.row + 1);
  const startIndex = visibility.getVisibleIndex(start);
  const endIndex = visibility.getVisibleIndex(end);
  return startIndex === null || endIndex === null || endIndex - startIndex + 1 !== end - start + 1;
}

/** True when the range itself contains a filter-hidden row (adjacent rows do not count). */
export function rangeContainsHiddenClipboardRows(
  visibility: RowVisibilityIndex,
  range: CellRange,
): boolean {
  if (!isRangeInBounds(range)) return true;
  const normalized = normalizeRange(range);
  const startIndex = visibility.getVisibleIndex(normalized.start.row);
  const endIndex = visibility.getVisibleIndex(normalized.end.row);
  return (
    startIndex === null ||
    endIndex === null ||
    endIndex - startIndex + 1 !== normalized.end.row - normalized.start.row + 1
  );
}

/**
 * Projects a whole-axis selection into the finite rectangle that can actually
 * be represented on a clipboard. A row keeps its column-zero offset; a column
 * keeps its row-zero offset. Styles live in `sheet.cells`, so styled blank
 * cells extend the projection too.
 */
export function getAxisClipboardRange(
  sheet: Sheet,
  axis: GridClipboardAxis,
  selectionRange: CellRange,
): CellRange | null {
  const selected = normalizeRange(selectionRange);
  if (axis === "rows") {
    let endColumn = 0;
    for (const key of sheet.cells.keys()) {
      const separator = key.indexOf(":");
      const row = Number(key.slice(0, separator));
      const column = Number(key.slice(separator + 1));
      if (row >= selected.start.row && row <= selected.end.row)
        endColumn = Math.max(endColumn, column);
    }
    const rowCount = selected.end.row - selected.start.row + 1;
    return isWithinCellLimit(rowCount, endColumn + 1)
      ? {
          start: { row: selected.start.row, column: 0 },
          end: { row: selected.end.row, column: endColumn },
        }
      : null;
  }

  let endRow = 0;
  for (const key of sheet.cells.keys()) {
    const separator = key.indexOf(":");
    const row = Number(key.slice(0, separator));
    const column = Number(key.slice(separator + 1));
    if (column >= selected.start.column && column <= selected.end.column)
      endRow = Math.max(endRow, row);
  }
  const columnCount = selected.end.column - selected.start.column + 1;
  return isWithinCellLimit(endRow + 1, columnCount)
    ? {
        start: { row: 0, column: selected.start.column },
        end: { row: endRow, column: selected.end.column },
      }
    : null;
}

export function createVisibleGridPastePlan(
  values: CellValueMatrix,
  targetRange: CellRange,
  activeCell: CellAddress,
  visibility: RowVisibilityIndex,
  options?: { pasteFromActiveCell?: boolean },
): GridPastePlan | null {
  let sourceSize: { rowCount: number; columnCount: number };
  try {
    sourceSize = getCellMatrixSize(values);
  } catch {
    return null;
  }
  if (!isAddressInBounds(activeCell) || !isRangeInBounds(targetRange)) return null;
  const normalizedTarget = normalizeRange(targetRange);
  const targetRowCount = normalizedTarget.end.row - normalizedTarget.start.row + 1;
  const targetColumnCount = normalizedTarget.end.column - normalizedTarget.start.column + 1;
  if (!isWithinCellLimit(sourceSize.rowCount, sourceSize.columnCount)) return null;

  const targetIsSingleCell = targetRowCount === 1 && targetColumnCount === 1;
  if (visibility.visibleRowCount === visibility.rowCount) {
    if (
      !isWithinCellLimit(
        targetIsSingleCell || options?.pasteFromActiveCell ? sourceSize.rowCount : targetRowCount,
        targetIsSingleCell || options?.pasteFromActiveCell
          ? sourceSize.columnCount
          : targetColumnCount,
      )
    ) {
      return null;
    }
    return createPastePlan(values, targetRange, activeCell, options);
  }

  if (targetIsSingleCell || options?.pasteFromActiveCell) {
    if (activeCell.column + sourceSize.columnCount > MAX_SHEET_COLUMNS) return null;
    const rows = getConsecutiveVisibleRows(visibility, activeCell.row, sourceSize.rowCount);
    return rows
      ? createFilteredPlan(
          values.map((row) => [...row]),
          rows,
          activeCell.column,
          sourceSize.columnCount,
        )
      : null;
  }

  const rows = getVisibleClipboardRows(visibility, normalizedTarget);
  if (!rows || rows.length === 0 || !isWithinCellLimit(rows.length, targetColumnCount)) {
    return null;
  }
  if (rows.length % sourceSize.rowCount !== 0 || targetColumnCount % sourceSize.columnCount !== 0) {
    return null;
  }
  const tiledValues = Array.from({ length: rows.length }, (_, row) =>
    Array.from(
      { length: targetColumnCount },
      (_, column) => values[row % sourceSize.rowCount]![column % sourceSize.columnCount]!,
    ),
  );
  return createFilteredPlan(tiledValues, rows, normalizedTarget.start.column, targetColumnCount);
}

export function rangeIntersectsMergedCells(sheet: Sheet, range: CellRange): boolean {
  if (!isRangeInBounds(range)) return false;
  const normalized = normalizeRange(range);
  return sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, normalized));
}
