import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  isCellAddressInBounds,
  type CellAddress,
} from "../workbook/workbook";

export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Rect = Point & Size;

export type VisibleCellRange = {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
};

export type SheetGeometry = {
  rowCount: number;
  columnCount: number;
  rowHeight: number;
  columnWidth: number;
  getTotalSize: () => Size;
  getCellRect: (address: CellAddress) => Rect;
  getCellViewportRect: (address: CellAddress, scrollPosition: Point) => Rect;
  getCellAtPoint: (point: Point) => CellAddress | null;
  getVisibleRange: (
    scrollPosition: Point,
    viewportSize: Size,
    overscan?: number,
  ) => VisibleCellRange;
  getScrollPositionForCell: (
    address: CellAddress,
    scrollPosition: Point,
    viewportSize: Size,
  ) => Point;
};

export const DEFAULT_ROW_HEIGHT = 24;
export const DEFAULT_COLUMN_WIDTH = 96;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function assertGeometryAddress(address: CellAddress, rowCount: number, columnCount: number): void {
  if (!isCellAddressInBounds(address) || address.row >= rowCount || address.column >= columnCount) {
    throw new RangeError(`Cell address ${address.row}:${address.column} is outside the grid.`);
  }
}

export function createSheetGeometry(options?: {
  rowCount?: number;
  columnCount?: number;
  rowHeight?: number;
  columnWidth?: number;
}): SheetGeometry {
  const rowCount = options?.rowCount ?? MAX_SHEET_ROWS;
  const columnCount = options?.columnCount ?? MAX_SHEET_COLUMNS;
  const rowHeight = options?.rowHeight ?? DEFAULT_ROW_HEIGHT;
  const columnWidth = options?.columnWidth ?? DEFAULT_COLUMN_WIDTH;

  if (
    rowCount <= 0 ||
    rowCount > MAX_SHEET_ROWS ||
    columnCount <= 0 ||
    columnCount > MAX_SHEET_COLUMNS ||
    rowHeight <= 0 ||
    columnWidth <= 0
  ) {
    throw new RangeError("Sheet geometry dimensions must be positive.");
  }

  const totalSize = {
    width: columnCount * columnWidth,
    height: rowCount * rowHeight,
  };

  return {
    rowCount,
    columnCount,
    rowHeight,
    columnWidth,
    getTotalSize: () => ({ ...totalSize }),
    getCellRect(address) {
      assertGeometryAddress(address, rowCount, columnCount);
      return {
        x: address.column * columnWidth,
        y: address.row * rowHeight,
        width: columnWidth,
        height: rowHeight,
      };
    },
    getCellViewportRect(address, scrollPosition) {
      assertGeometryAddress(address, rowCount, columnCount);
      return {
        x: address.column * columnWidth - scrollPosition.x,
        y: address.row * rowHeight - scrollPosition.y,
        width: columnWidth,
        height: rowHeight,
      };
    },
    getCellAtPoint(point) {
      if (point.x < 0 || point.y < 0 || point.x >= totalSize.width || point.y >= totalSize.height) {
        return null;
      }

      return {
        row: Math.floor(point.y / rowHeight),
        column: Math.floor(point.x / columnWidth),
      };
    },
    getVisibleRange(scrollPosition, viewportSize, overscan = 2) {
      const normalizedOverscan = Math.max(0, Math.floor(overscan));
      const visibleWidth = Math.max(0, viewportSize.width);
      const visibleHeight = Math.max(0, viewportSize.height);
      const startRow = Math.floor(Math.max(0, scrollPosition.y) / rowHeight);
      const startColumn = Math.floor(Math.max(0, scrollPosition.x) / columnWidth);
      const visibleEndRow = Math.floor(
        (Math.max(0, scrollPosition.y) + Math.max(0, visibleHeight - 1)) / rowHeight,
      );
      const visibleEndColumn = Math.floor(
        (Math.max(0, scrollPosition.x) + Math.max(0, visibleWidth - 1)) / columnWidth,
      );

      return {
        startRow: clamp(startRow - normalizedOverscan, 0, rowCount - 1),
        endRow: clamp(visibleEndRow + normalizedOverscan, 0, rowCount - 1),
        startColumn: clamp(startColumn - normalizedOverscan, 0, columnCount - 1),
        endColumn: clamp(visibleEndColumn + normalizedOverscan, 0, columnCount - 1),
      };
    },
    getScrollPositionForCell(address, scrollPosition, viewportSize) {
      assertGeometryAddress(address, rowCount, columnCount);
      const rect = {
        x: address.column * columnWidth,
        y: address.row * rowHeight,
        width: columnWidth,
        height: rowHeight,
      };
      let x = Math.max(0, scrollPosition.x);
      let y = Math.max(0, scrollPosition.y);

      if (rect.x < x) {
        x = rect.x;
      } else if (rect.x + rect.width > x + viewportSize.width) {
        x = rect.x + rect.width - viewportSize.width;
      }

      if (rect.y < y) {
        y = rect.y;
      } else if (rect.y + rect.height > y + viewportSize.height) {
        y = rect.y + rect.height - viewportSize.height;
      }

      return {
        x: clamp(x, 0, Math.max(0, totalSize.width - viewportSize.width)),
        y: clamp(y, 0, Math.max(0, totalSize.height - viewportSize.height)),
      };
    },
  };
}

export function columnIndexToLabel(column: number): string {
  if (!Number.isInteger(column) || column < 0) {
    throw new RangeError("Column index must be a non-negative integer.");
  }

  let value = column + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

export function getCellAddressLabel(address: CellAddress): string {
  return `${columnIndexToLabel(address.column)}${address.row + 1}`;
}
