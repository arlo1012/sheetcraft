import type { CellAddress } from "@idea10/core/workbook";
import type { Point, Rect, SheetGeometry, Size, VisibleCellRange } from "./geometry.js";

export type FreezePanes = {
  rows: number;
  columns: number;
};

export type FrozenPaneId = "topLeft" | "top" | "left" | "body";

export type FrozenPane = {
  id: FrozenPaneId;
  clip: Rect;
  visibleRange: VisibleCellRange | null;
};

export type FrozenPaneLayout = {
  bodyScrollPosition: Point;
  freeze: FreezePanes;
  frozenSize: Size;
  panes: Record<FrozenPaneId, FrozenPane>;
  viewportSize: Size;
  getCellViewportRect: (address: CellAddress) => Rect;
  getCellAtViewportPoint: (point: Point) => CellAddress | null;
  getPaneForAddress: (address: CellAddress) => FrozenPaneId;
};

type AxisBounds = {
  start: number;
  end: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function assertFreezeCount(value: number, maximum: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 0 and ${maximum}.`);
  }
}

function getAxisBoundaryOffset(
  count: number,
  maximum: number,
  getOffset: (index: number) => number,
  totalSize: number,
): number {
  return count === maximum ? totalSize : count === 0 ? 0 : getOffset(count);
}

function intersectVisibleRange(
  range: VisibleCellRange,
  rows: AxisBounds,
  columns: AxisBounds,
): VisibleCellRange | null {
  const startRow = Math.max(range.startRow, rows.start);
  const endRow = Math.min(range.endRow, rows.end - 1);
  const startColumn = Math.max(range.startColumn, columns.start);
  const endColumn = Math.min(range.endColumn, columns.end - 1);
  return startRow <= endRow && startColumn <= endColumn
    ? { startRow, endRow, startColumn, endColumn }
    : null;
}

function getPaneVisibleRange(
  geometry: SheetGeometry,
  clip: Rect,
  scrollPosition: Point,
  rows: AxisBounds,
  columns: AxisBounds,
): VisibleCellRange | null {
  if (
    clip.width <= 0 ||
    clip.height <= 0 ||
    rows.start >= rows.end ||
    columns.start >= columns.end
  ) {
    return null;
  }
  return intersectVisibleRange(
    geometry.getVisibleRange(scrollPosition, { width: clip.width, height: clip.height }, 0),
    rows,
    columns,
  );
}

/**
 * Creates a four-pane viewport for a sheet. bodyScrollPosition is measured from
 * the first non-frozen row and column, rather than from the worksheet origin.
 */
export function createFrozenPaneLayout(options: {
  geometry: SheetGeometry;
  freeze?: Partial<FreezePanes>;
  bodyScrollPosition?: Point;
  viewportSize: Size;
}): FrozenPaneLayout {
  const geometry = options.geometry;
  const viewportSize = { ...options.viewportSize };
  assertNonNegativeFinite(viewportSize.width, "Viewport width");
  assertNonNegativeFinite(viewportSize.height, "Viewport height");

  const freeze = {
    rows: options.freeze?.rows ?? 0,
    columns: options.freeze?.columns ?? 0,
  };
  assertFreezeCount(freeze.rows, geometry.rowCount, "Frozen row count");
  assertFreezeCount(freeze.columns, geometry.columnCount, "Frozen column count");

  const totalSize = geometry.getTotalSize();
  const frozenWidth = getAxisBoundaryOffset(
    freeze.columns,
    geometry.columnCount,
    geometry.getColumnOffset,
    totalSize.width,
  );
  const frozenHeight = getAxisBoundaryOffset(
    freeze.rows,
    geometry.rowCount,
    geometry.getRowOffset,
    totalSize.height,
  );
  const frozenSize = { width: frozenWidth, height: frozenHeight };
  const frozenViewportWidth = Math.min(viewportSize.width, frozenWidth);
  const frozenViewportHeight = Math.min(viewportSize.height, frozenHeight);
  const bodyViewportSize = {
    width: viewportSize.width - frozenViewportWidth,
    height: viewportSize.height - frozenViewportHeight,
  };
  const requestedBodyScroll = options.bodyScrollPosition ?? { x: 0, y: 0 };
  assertNonNegativeFinite(requestedBodyScroll.x, "Body scroll x");
  assertNonNegativeFinite(requestedBodyScroll.y, "Body scroll y");
  const bodyScrollPosition = {
    x: clamp(
      requestedBodyScroll.x,
      0,
      Math.max(0, totalSize.width - frozenWidth - bodyViewportSize.width),
    ),
    y: clamp(
      requestedBodyScroll.y,
      0,
      Math.max(0, totalSize.height - frozenHeight - bodyViewportSize.height),
    ),
  };

  const topLeftClip = {
    x: 0,
    y: 0,
    width: frozenViewportWidth,
    height: frozenViewportHeight,
  };
  const topClip = {
    x: frozenViewportWidth,
    y: 0,
    width: bodyViewportSize.width,
    height: frozenViewportHeight,
  };
  const leftClip = {
    x: 0,
    y: frozenViewportHeight,
    width: frozenViewportWidth,
    height: bodyViewportSize.height,
  };
  const bodyClip = {
    x: frozenViewportWidth,
    y: frozenViewportHeight,
    width: bodyViewportSize.width,
    height: bodyViewportSize.height,
  };
  const frozenRows = { start: 0, end: freeze.rows };
  const bodyRows = { start: freeze.rows, end: geometry.rowCount };
  const frozenColumns = { start: 0, end: freeze.columns };
  const bodyColumns = { start: freeze.columns, end: geometry.columnCount };
  const topLeft: FrozenPane = {
    id: "topLeft",
    clip: topLeftClip,
    visibleRange: getPaneVisibleRange(
      geometry,
      topLeftClip,
      { x: 0, y: 0 },
      frozenRows,
      frozenColumns,
    ),
  };
  const top: FrozenPane = {
    id: "top",
    clip: topClip,
    visibleRange: getPaneVisibleRange(
      geometry,
      topClip,
      { x: frozenWidth + bodyScrollPosition.x, y: 0 },
      frozenRows,
      bodyColumns,
    ),
  };
  const left: FrozenPane = {
    id: "left",
    clip: leftClip,
    visibleRange: getPaneVisibleRange(
      geometry,
      leftClip,
      { x: 0, y: frozenHeight + bodyScrollPosition.y },
      bodyRows,
      frozenColumns,
    ),
  };
  const body: FrozenPane = {
    id: "body",
    clip: bodyClip,
    visibleRange: getPaneVisibleRange(
      geometry,
      bodyClip,
      { x: frozenWidth + bodyScrollPosition.x, y: frozenHeight + bodyScrollPosition.y },
      bodyRows,
      bodyColumns,
    ),
  };

  function getPaneForAddress(address: CellAddress): FrozenPaneId {
    geometry.getCellRect(address);
    if (address.row < freeze.rows) {
      return address.column < freeze.columns ? "topLeft" : "top";
    }
    return address.column < freeze.columns ? "left" : "body";
  }

  function getCellViewportRect(address: CellAddress): Rect {
    const rect = geometry.getCellRect(address);
    return {
      x:
        address.column < freeze.columns
          ? rect.x
          : frozenViewportWidth + rect.x - frozenWidth - bodyScrollPosition.x,
      y:
        address.row < freeze.rows
          ? rect.y
          : frozenViewportHeight + rect.y - frozenHeight - bodyScrollPosition.y,
      width: rect.width,
      height: rect.height,
    };
  }

  function getCellAtViewportPoint(point: Point): CellAddress | null {
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x >= viewportSize.width ||
      point.y >= viewportSize.height
    ) {
      return null;
    }
    const x =
      point.x < frozenViewportWidth
        ? point.x
        : frozenWidth + bodyScrollPosition.x + point.x - frozenViewportWidth;
    const y =
      point.y < frozenViewportHeight
        ? point.y
        : frozenHeight + bodyScrollPosition.y + point.y - frozenViewportHeight;
    return geometry.getCellAtPoint({ x, y });
  }

  return {
    bodyScrollPosition,
    freeze,
    frozenSize,
    panes: { topLeft, top, left, body },
    viewportSize,
    getCellViewportRect,
    getCellAtViewportPoint,
    getPaneForAddress,
  };
}
