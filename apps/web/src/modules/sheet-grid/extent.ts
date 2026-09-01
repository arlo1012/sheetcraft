import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type CellAddress } from "@idea10/core/workbook";
import type { Point, SheetGeometry, Size } from "./geometry";

export type GridExtent = {
  rowCount: number;
  columnCount: number;
};

export type GridExtentPolicy = {
  growth: GridExtent;
  tail: GridExtent;
};

export const DEFAULT_INITIAL_GRID_EXTENT: GridExtent = {
  rowCount: 1_000,
  columnCount: 100,
};

export const DEFAULT_GRID_EXTENT_POLICY: GridExtentPolicy = {
  growth: {
    rowCount: 1_000,
    columnCount: 26,
  },
  tail: {
    rowCount: 100,
    columnCount: 8,
  },
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function growDimension(current: number, minimum: number, step: number, maximum: number): number {
  if (minimum <= current) {
    return current;
  }

  const blocks = Math.ceil((minimum - current) / step);
  return Math.min(maximum, current + blocks * step);
}

export function createGridExtent(options?: Partial<GridExtent>): GridExtent {
  const rowCount = options?.rowCount ?? DEFAULT_INITIAL_GRID_EXTENT.rowCount;
  const columnCount = options?.columnCount ?? DEFAULT_INITIAL_GRID_EXTENT.columnCount;
  assertPositiveInteger(rowCount, "Grid row count");
  assertPositiveInteger(columnCount, "Grid column count");

  if (rowCount > MAX_SHEET_ROWS || columnCount > MAX_SHEET_COLUMNS) {
    throw new RangeError("Grid extent exceeds the spreadsheet limits.");
  }

  return { rowCount, columnCount };
}

export function expandGridExtent(
  current: GridExtent,
  minimum: GridExtent,
  growth: GridExtent,
): GridExtent {
  assertPositiveInteger(growth.rowCount, "Grid row growth");
  assertPositiveInteger(growth.columnCount, "Grid column growth");

  return {
    rowCount: growDimension(current.rowCount, minimum.rowCount, growth.rowCount, MAX_SHEET_ROWS),
    columnCount: growDimension(
      current.columnCount,
      minimum.columnCount,
      growth.columnCount,
      MAX_SHEET_COLUMNS,
    ),
  };
}

export function expandGridExtentForAddress(
  current: GridExtent,
  address: CellAddress,
  growth: GridExtent,
): GridExtent {
  return expandGridExtent(
    current,
    { rowCount: address.row + 1, columnCount: address.column + 1 },
    growth,
  );
}

export function expandGridExtentForViewport(
  current: GridExtent,
  scrollPosition: Point,
  viewportSize: Size,
  geometry: SheetGeometry,
  policy: GridExtentPolicy,
): GridExtent {
  const visibleRange = geometry.getVisibleRange(scrollPosition, viewportSize, 0);

  return expandGridExtent(
    current,
    {
      rowCount: visibleRange.endRow + 1 + policy.tail.rowCount,
      columnCount: visibleRange.endColumn + 1 + policy.tail.columnCount,
    },
    policy.growth,
  );
}
