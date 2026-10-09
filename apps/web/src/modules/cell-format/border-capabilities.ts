import { normalizeMergedCellRange } from "@sheetcraft/core";
import type { CellRange } from "@sheetcraft/core/workbook";

export type CellFormatBorderCapabilities = Readonly<{
  innerHorizontal: boolean;
  innerVertical: boolean;
}>;

/**
 * Reports whether applying an internal border can write at least one physical
 * grid edge in the selection. Edges inside a merged range cannot be styled.
 */
export function getCellFormatBorderCapabilities(
  range: CellRange,
  mergedCells: readonly CellRange[],
): CellFormatBorderCapabilities {
  const normalized = normalizeMergedCellRange(range);
  const rowCount = normalized.end.row - normalized.start.row + 1;
  const columnCount = normalized.end.column - normalized.start.column + 1;
  let horizontalEdges = (rowCount - 1) * columnCount;
  let verticalEdges = rowCount * (columnCount - 1);

  // Workbook merges do not overlap. Subtract their internal edges as rectangles
  // so whole-row/column selections never require walking individual cells.
  for (const merged of mergedCells) {
    const firstRow = Math.max(normalized.start.row, merged.start.row);
    const firstColumn = Math.max(normalized.start.column, merged.start.column);
    const lastRow = Math.min(normalized.end.row, merged.end.row);
    const lastColumn = Math.min(normalized.end.column, merged.end.column);
    const rows = Math.max(0, lastRow - firstRow + 1);
    const columns = Math.max(0, lastColumn - firstColumn + 1);
    horizontalEdges -= Math.max(0, rows - 1) * columns;
    verticalEdges -= rows * Math.max(0, columns - 1);
  }

  return { innerHorizontal: horizontalEdges > 0, innerVertical: verticalEdges > 0 };
}
