import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  isCellAddressInBounds,
  type CellAddress,
} from "@idea10/core/workbook";

export { DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT } from "@idea10/core/workbook";
export { columnIndexToLabel, getCellAddressLabel } from "@idea10/core/coordinates";

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
  getRowHeight: (row: number) => number;
  getColumnWidth: (column: number) => number;
  getRowOffset: (row: number) => number;
  getColumnOffset: (column: number) => number;
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

type SparseAxisMetrics = {
  getSize: (index: number) => number;
  getOffset: (index: number) => number;
  getTotalSize: () => number;
  getIndexAt: (offset: number) => number | null;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle]! < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function createSparseAxisMetrics(
  count: number,
  defaultSize: number,
  overrides: ReadonlyMap<number, number>,
): SparseAxisMetrics {
  const entries = [...overrides]
    .filter(([index, size]) => {
      if (!Number.isInteger(index) || index < 0) {
        throw new RangeError(`Dimension index ${index} is invalid.`);
      }
      if (!Number.isInteger(size) || size <= 0) {
        throw new RangeError(`Dimension size ${size} must be a positive integer.`);
      }
      return index < count && size !== defaultSize;
    })
    .sort(([left], [right]) => left - right);
  const indexes: number[] = [];
  const sizes: number[] = [];
  const cumulativeDeltas: number[] = [];
  let cumulativeDelta = 0;

  for (const [index, size] of entries) {
    indexes.push(index);
    sizes.push(size);
    cumulativeDelta += size - defaultSize;
    cumulativeDeltas.push(cumulativeDelta);
  }

  function getDeltaBefore(index: number): number {
    const position = lowerBound(indexes, index) - 1;
    return position >= 0 ? cumulativeDeltas[position]! : 0;
  }

  function getSize(index: number): number {
    const position = lowerBound(indexes, index);
    return indexes[position] === index ? sizes[position]! : defaultSize;
  }

  function getOffset(index: number): number {
    return index * defaultSize + getDeltaBefore(index);
  }

  const totalSize = getOffset(count);

  return {
    getSize,
    getOffset,
    getTotalSize: () => totalSize,
    getIndexAt(offset) {
      if (offset < 0 || offset >= totalSize) {
        return null;
      }

      let low = 0;
      let high = count - 1;
      while (low <= high) {
        const index = low + Math.floor((high - low) / 2);
        const start = getOffset(index);
        const end = start + getSize(index);
        if (offset < start) {
          high = index - 1;
        } else if (offset >= end) {
          low = index + 1;
        } else {
          return index;
        }
      }
      return null;
    },
  };
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
  rowHeights?: ReadonlyMap<number, number>;
  columnWidths?: ReadonlyMap<number, number>;
}): SheetGeometry {
  const rowCount = options?.rowCount ?? MAX_SHEET_ROWS;
  const columnCount = options?.columnCount ?? MAX_SHEET_COLUMNS;
  const rowHeight = options?.rowHeight ?? DEFAULT_ROW_HEIGHT;
  const columnWidth = options?.columnWidth ?? DEFAULT_COLUMN_WIDTH;
  assertPositiveInteger(rowCount, "Grid row count");
  assertPositiveInteger(columnCount, "Grid column count");
  assertPositiveInteger(rowHeight, "Default row height");
  assertPositiveInteger(columnWidth, "Default column width");

  if (rowCount > MAX_SHEET_ROWS || columnCount > MAX_SHEET_COLUMNS) {
    throw new RangeError("Sheet geometry dimensions exceed the sheet limits.");
  }

  const rowMetrics = createSparseAxisMetrics(rowCount, rowHeight, options?.rowHeights ?? new Map());
  const columnMetrics = createSparseAxisMetrics(
    columnCount,
    columnWidth,
    options?.columnWidths ?? new Map(),
  );
  const totalSize = {
    width: columnMetrics.getTotalSize(),
    height: rowMetrics.getTotalSize(),
  };

  function getCellRect(address: CellAddress): Rect {
    assertGeometryAddress(address, rowCount, columnCount);
    return {
      x: columnMetrics.getOffset(address.column),
      y: rowMetrics.getOffset(address.row),
      width: columnMetrics.getSize(address.column),
      height: rowMetrics.getSize(address.row),
    };
  }

  function getIndexAtOrEdge(metrics: SparseAxisMetrics, offset: number, count: number): number {
    return metrics.getIndexAt(offset) ?? count - 1;
  }

  return {
    rowCount,
    columnCount,
    rowHeight,
    columnWidth,
    getRowHeight(row) {
      assertGeometryAddress({ row, column: 0 }, rowCount, columnCount);
      return rowMetrics.getSize(row);
    },
    getColumnWidth(column) {
      assertGeometryAddress({ row: 0, column }, rowCount, columnCount);
      return columnMetrics.getSize(column);
    },
    getRowOffset(row) {
      assertGeometryAddress({ row, column: 0 }, rowCount, columnCount);
      return rowMetrics.getOffset(row);
    },
    getColumnOffset(column) {
      assertGeometryAddress({ row: 0, column }, rowCount, columnCount);
      return columnMetrics.getOffset(column);
    },
    getTotalSize: () => ({ ...totalSize }),
    getCellRect,
    getCellViewportRect(address, scrollPosition) {
      const rect = getCellRect(address);
      return {
        x: rect.x - scrollPosition.x,
        y: rect.y - scrollPosition.y,
        width: rect.width,
        height: rect.height,
      };
    },
    getCellAtPoint(point) {
      if (point.x < 0 || point.y < 0 || point.x >= totalSize.width || point.y >= totalSize.height) {
        return null;
      }
      const row = rowMetrics.getIndexAt(point.y);
      const column = columnMetrics.getIndexAt(point.x);
      return row === null || column === null ? null : { row, column };
    },
    getVisibleRange(scrollPosition, viewportSize, overscan = 2) {
      const normalizedOverscan = Math.max(0, Math.floor(overscan));
      const visibleWidth = Math.max(0, viewportSize.width);
      const visibleHeight = Math.max(0, viewportSize.height);
      const startRow = getIndexAtOrEdge(rowMetrics, Math.max(0, scrollPosition.y), rowCount);
      const startColumn = getIndexAtOrEdge(
        columnMetrics,
        Math.max(0, scrollPosition.x),
        columnCount,
      );
      const visibleEndRow = getIndexAtOrEdge(
        rowMetrics,
        Math.max(0, scrollPosition.y) + Math.max(0, visibleHeight - 1),
        rowCount,
      );
      const visibleEndColumn = getIndexAtOrEdge(
        columnMetrics,
        Math.max(0, scrollPosition.x) + Math.max(0, visibleWidth - 1),
        columnCount,
      );

      return {
        startRow: clamp(startRow - normalizedOverscan, 0, rowCount - 1),
        endRow: clamp(visibleEndRow + normalizedOverscan, 0, rowCount - 1),
        startColumn: clamp(startColumn - normalizedOverscan, 0, columnCount - 1),
        endColumn: clamp(visibleEndColumn + normalizedOverscan, 0, columnCount - 1),
      };
    },
    getScrollPositionForCell(address, scrollPosition, viewportSize) {
      const rect = getCellRect(address);
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
