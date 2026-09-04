import type { CellAddress, CellRange } from "@idea10/core/workbook";
import type { FreezePanes, FrozenPaneId } from "./frozen-layout.js";
import type { Point, Rect, SheetGeometry, Size } from "./geometry.js";
import type { RowVisibilityIndex, VisibleRow } from "./visibility.js";

export type ViewportAxisItem = {
  index: number;
  offset: number;
  size: number;
};

export type SheetViewportPane = {
  id: FrozenPaneId;
  clip: Rect;
  rows: readonly ViewportAxisItem[];
  columns: readonly ViewportAxisItem[];
};

export type SheetViewportRangeFragment = {
  paneId: FrozenPaneId;
  rect: Rect;
};

/**
 * A range positioned in a viewport pane. The full rect is useful when the
 * presenter clips its pane; clippedRect is useful for a flat overlay layer.
 */
export type SheetViewportPaneRangeRect = {
  paneId: FrozenPaneId;
  rect: Rect;
  clippedRect: Rect;
};

/**
 * Supplies merged ranges from the workbook domain. Implementations should index
 * ranges because layout consumers may query every visible cell. The layout
 * validates and normalizes each returned range in constant time.
 */
export type MergeResolver = {
  getRangeAt: (address: CellAddress) => CellRange | null | undefined;
};

export type SheetViewportLayout = {
  readonly bodyScrollPosition: Point;
  readonly freeze: FreezePanes;
  readonly frozenSize: Size;
  /** The native scroll spacer size for one scroll host. */
  readonly nativeScrollSize: Size;
  readonly panes: Record<FrozenPaneId, SheetViewportPane>;
  readonly viewportSize: Size;
  getTotalSize: () => Size;
  getCellRect: (address: CellAddress) => Rect | null;
  getCellViewportRect: (address: CellAddress) => Rect | null;
  getCellAtViewportPoint: (point: Point) => CellAddress | null;
  getPaneForAddress: (address: CellAddress) => FrozenPaneId;
  getMergedRangeAt: (address: CellAddress) => CellRange | null;
  getAnchorForAddress: (address: CellAddress) => CellAddress;
  getRangeRect: (range: CellRange) => Rect | null;
  getRangePaneRects: (range: CellRange) => SheetViewportPaneRangeRect[];
  getRangeFragments: (range: CellRange) => SheetViewportRangeFragment[];
  getScrollPositionForAddress: (address: CellAddress) => Point;
  /**
   * Visits each logical visible cell once. Merged cells are reported as their
   * canonical anchor; paneId is the first pane containing a visible fragment.
   */
  forEachVisibleCell: (callback: (address: CellAddress, paneId: FrozenPaneId) => void) => void;
};

type AxisBounds = {
  start: number;
  end: number;
};

type NormalizedRange = {
  start: CellAddress;
  end: CellAddress;
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
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 0 and ${maximum}.`);
  }
}

function intersectRect(left: Rect, right: Rect): Rect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return rightEdge > x && bottomEdge > y
    ? { x, y, width: rightEdge - x, height: bottomEdge - y }
    : null;
}

function toAxisItem(row: VisibleRow): ViewportAxisItem {
  return { index: row.logicalRow, offset: row.offset, size: row.height };
}

/**
 * Composes discontinuous visible rows, continuous columns, frozen panes and
 * body-relative scrolling into one runtime-neutral viewport coordinate system.
 *
 * The supplied row visibility index must use the same row count and row-height
 * overrides as geometry. Geometry supplies column metrics only in this layout;
 * all row coordinates are read from the visibility index.
 */
export function createSheetViewportLayout(options: {
  geometry: SheetGeometry;
  rows: RowVisibilityIndex;
  freeze?: Partial<FreezePanes>;
  bodyScrollPosition?: Point;
  viewportSize: Size;
  mergeResolver?: MergeResolver;
  overscan?: number;
}): SheetViewportLayout {
  const geometry = options.geometry;
  const rows = options.rows;
  if (rows.rowCount !== geometry.rowCount) {
    throw new RangeError("Row visibility count must match geometry row count.");
  }

  const viewportSize = { ...options.viewportSize };
  assertNonNegativeFinite(viewportSize.width, "Viewport width");
  assertNonNegativeFinite(viewportSize.height, "Viewport height");

  const freeze: FreezePanes = {
    rows: options.freeze?.rows ?? 0,
    columns: options.freeze?.columns ?? 0,
  };
  assertFreezeCount(freeze.rows, geometry.rowCount, "Frozen row count");
  assertFreezeCount(freeze.columns, geometry.columnCount, "Frozen column count");

  const overscan = Number.isFinite(options.overscan)
    ? Math.max(0, Math.floor(options.overscan ?? 0))
    : 0;
  const geometrySize = geometry.getTotalSize();
  const totalSize = { width: geometrySize.width, height: rows.getTotalHeight() };
  const frozenWidth =
    freeze.columns === geometry.columnCount
      ? totalSize.width
      : freeze.columns === 0
        ? 0
        : geometry.getColumnOffset(freeze.columns);
  const frozenBoundary = rows.getBoundaryOffset(freeze.rows);
  if (frozenBoundary === null) {
    throw new RangeError("Frozen row boundary is outside the row visibility index.");
  }
  const frozenHeight: number = frozenBoundary;
  const frozenSize = { width: frozenWidth, height: frozenHeight };
  const frozenViewportWidth = Math.min(viewportSize.width, frozenWidth);
  const frozenViewportHeight = Math.min(viewportSize.height, frozenHeight);
  const bodyViewportSize = {
    width: viewportSize.width - frozenViewportWidth,
    height: viewportSize.height - frozenViewportHeight,
  };
  const nativeScrollSize = {
    width: frozenViewportWidth + Math.max(0, totalSize.width - frozenWidth),
    height: frozenViewportHeight + Math.max(0, totalSize.height - frozenHeight),
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

  const clips: Record<FrozenPaneId, Rect> = {
    topLeft: {
      x: 0,
      y: 0,
      width: frozenViewportWidth,
      height: frozenViewportHeight,
    },
    top: {
      x: frozenViewportWidth,
      y: 0,
      width: bodyViewportSize.width,
      height: frozenViewportHeight,
    },
    left: {
      x: 0,
      y: frozenViewportHeight,
      width: frozenViewportWidth,
      height: bodyViewportSize.height,
    },
    body: {
      x: frozenViewportWidth,
      y: frozenViewportHeight,
      width: bodyViewportSize.width,
      height: bodyViewportSize.height,
    },
  };
  const paneRows: Record<FrozenPaneId, AxisBounds> = {
    topLeft: { start: 0, end: freeze.rows },
    top: { start: 0, end: freeze.rows },
    left: { start: freeze.rows, end: geometry.rowCount },
    body: { start: freeze.rows, end: geometry.rowCount },
  };
  const paneColumns: Record<FrozenPaneId, AxisBounds> = {
    topLeft: { start: 0, end: freeze.columns },
    top: { start: freeze.columns, end: geometry.columnCount },
    left: { start: 0, end: freeze.columns },
    body: { start: freeze.columns, end: geometry.columnCount },
  };

  function assertAddress(address: CellAddress): void {
    if (!Number.isSafeInteger(address.row) || address.row < 0 || address.row >= rows.rowCount) {
      throw new RangeError(`Cell row ${address.row} is outside the grid.`);
    }
    geometry.getColumnOffset(address.column);
  }

  function normalizeRange(range: CellRange): NormalizedRange {
    assertAddress(range.start);
    assertAddress(range.end);
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

  function getRowsInViewport(
    offset: number,
    height: number,
    bounds: AxisBounds,
  ): ViewportAxisItem[] {
    if (height <= 0 || bounds.start >= bounds.end) return [];
    return rows
      .getVisibleRowsInViewport(offset, height, overscan)
      .filter((row) => row.logicalRow >= bounds.start && row.logicalRow < bounds.end)
      .map(toAxisItem);
  }

  function getColumnsInViewport(
    offset: number,
    width: number,
    bounds: AxisBounds,
  ): ViewportAxisItem[] {
    if (width <= 0 || bounds.start >= bounds.end) return [];
    const range = geometry.getVisibleRange({ x: offset, y: 0 }, { width, height: 1 }, overscan);
    const start = Math.max(range.startColumn, bounds.start);
    const end = Math.min(range.endColumn, bounds.end - 1);
    const columns: ViewportAxisItem[] = [];
    for (let column = start; column <= end; column += 1) {
      columns.push({
        index: column,
        offset: geometry.getColumnOffset(column),
        size: geometry.getColumnWidth(column),
      });
    }
    return columns;
  }

  const panes: Record<FrozenPaneId, SheetViewportPane> = {
    topLeft: {
      id: "topLeft",
      clip: clips.topLeft,
      rows: getRowsInViewport(0, clips.topLeft.height, paneRows.topLeft),
      columns: getColumnsInViewport(0, clips.topLeft.width, paneColumns.topLeft),
    },
    top: {
      id: "top",
      clip: clips.top,
      rows: getRowsInViewport(0, clips.top.height, paneRows.top),
      columns: getColumnsInViewport(
        frozenWidth + bodyScrollPosition.x,
        clips.top.width,
        paneColumns.top,
      ),
    },
    left: {
      id: "left",
      clip: clips.left,
      rows: getRowsInViewport(
        frozenHeight + bodyScrollPosition.y,
        clips.left.height,
        paneRows.left,
      ),
      columns: getColumnsInViewport(0, clips.left.width, paneColumns.left),
    },
    body: {
      id: "body",
      clip: clips.body,
      rows: getRowsInViewport(
        frozenHeight + bodyScrollPosition.y,
        clips.body.height,
        paneRows.body,
      ),
      columns: getColumnsInViewport(
        frozenWidth + bodyScrollPosition.x,
        clips.body.width,
        paneColumns.body,
      ),
    },
  };

  function getPaneForAddress(address: CellAddress): FrozenPaneId {
    assertAddress(address);
    if (address.row < freeze.rows) {
      return address.column < freeze.columns ? "topLeft" : "top";
    }
    return address.column < freeze.columns ? "left" : "body";
  }

  function getCellRect(address: CellAddress): Rect | null {
    assertAddress(address);
    const row = rows.getVisibleRow(address.row);
    if (!row) return null;
    return {
      x: geometry.getColumnOffset(address.column),
      y: row.offset,
      width: geometry.getColumnWidth(address.column),
      height: row.height,
    };
  }

  function getCellViewportRect(address: CellAddress): Rect | null {
    const rect = getCellRect(address);
    if (!rect) return null;
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

  function getMergedRangeAt(address: CellAddress): CellRange | null {
    assertAddress(address);
    const range = options.mergeResolver?.getRangeAt(address);
    if (!range) return null;
    const normalized = normalizeRange(range);
    if (
      address.row < normalized.start.row ||
      address.row > normalized.end.row ||
      address.column < normalized.start.column ||
      address.column > normalized.end.column
    ) {
      throw new RangeError("Merged range must contain its queried address.");
    }
    return { start: { ...normalized.start }, end: { ...normalized.end } };
  }

  function getAnchorForAddress(address: CellAddress): CellAddress {
    const range = getMergedRangeAt(address);
    return range ? { ...range.start } : { ...address };
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
    const column = geometry.getCellAtPoint({ x, y: 0 })?.column;
    const row = rows.getLogicalRowAtOffset(y);
    if (row === null || column === undefined) return null;
    return getAnchorForAddress({ row, column });
  }

  function getFirstVisibleRow(bounds: AxisBounds): VisibleRow | null {
    if (bounds.start >= bounds.end) return null;
    const row = rows.getVisibleRow(bounds.start);
    const next = row ? bounds.start : rows.getNextVisibleRow(bounds.start);
    return next === null || next >= bounds.end ? null : rows.getVisibleRow(next);
  }

  function getLastVisibleRow(bounds: AxisBounds): VisibleRow | null {
    if (bounds.start >= bounds.end) return null;
    const row = rows.getVisibleRow(bounds.end - 1);
    const previous = row ? bounds.end - 1 : rows.getPreviousVisibleRow(bounds.end - 1);
    return previous === null || previous < bounds.start ? null : rows.getVisibleRow(previous);
  }

  function getRangeRectFromBounds(range: NormalizedRange): Rect | null {
    const firstRow = getFirstVisibleRow({ start: range.start.row, end: range.end.row + 1 });
    const lastRow = getLastVisibleRow({ start: range.start.row, end: range.end.row + 1 });
    if (!firstRow || !lastRow) return null;
    const x = geometry.getColumnOffset(range.start.column);
    const right =
      geometry.getColumnOffset(range.end.column) + geometry.getColumnWidth(range.end.column);
    return {
      x,
      y: firstRow.offset,
      width: right - x,
      height: lastRow.offset + lastRow.height - firstRow.offset,
    };
  }

  function getRangeRect(range: CellRange): Rect | null {
    return getRangeRectFromBounds(normalizeRange(range));
  }

  function getRangePaneRects(range: CellRange): SheetViewportPaneRangeRect[] {
    const normalized = normalizeRange(range);
    const paneRects: SheetViewportPaneRangeRect[] = [];
    for (const paneId of ["topLeft", "top", "left", "body"] as const) {
      const rowBounds = paneRows[paneId];
      const columnBounds = paneColumns[paneId];
      const fragmentBounds = {
        start: {
          row: Math.max(normalized.start.row, rowBounds.start),
          column: Math.max(normalized.start.column, columnBounds.start),
        },
        end: {
          row: Math.min(normalized.end.row, rowBounds.end - 1),
          column: Math.min(normalized.end.column, columnBounds.end - 1),
        },
      };
      if (
        fragmentBounds.start.row > fragmentBounds.end.row ||
        fragmentBounds.start.column > fragmentBounds.end.column
      ) {
        continue;
      }
      const sheetRect = getRangeRectFromBounds(fragmentBounds);
      if (!sheetRect) continue;
      const rect: Rect = {
        x:
          paneId === "topLeft" || paneId === "left"
            ? sheetRect.x
            : frozenViewportWidth + sheetRect.x - frozenWidth - bodyScrollPosition.x,
        y:
          paneId === "topLeft" || paneId === "top"
            ? sheetRect.y
            : frozenViewportHeight + sheetRect.y - frozenHeight - bodyScrollPosition.y,
        width: sheetRect.width,
        height: sheetRect.height,
      };
      const clipped = intersectRect(rect, clips[paneId]);
      if (clipped) paneRects.push({ paneId, rect, clippedRect: clipped });
    }
    return paneRects;
  }

  function getRangeFragments(range: CellRange): SheetViewportRangeFragment[] {
    return getRangePaneRects(range).map(({ paneId, clippedRect }) => ({
      paneId,
      rect: clippedRect,
    }));
  }

  function getScrollPositionForAddress(address: CellAddress): Point {
    const anchor = getAnchorForAddress(address);
    const targetRange = getMergedRangeAt(address) ?? { start: anchor, end: anchor };
    const rect = getRangeRect(targetRange);
    if (!rect) return { ...bodyScrollPosition };

    let x = bodyScrollPosition.x;
    let y = bodyScrollPosition.y;
    if (anchor.column >= freeze.columns && bodyViewportSize.width > 0) {
      const localX = rect.x - frozenWidth;
      if (localX < x) x = localX;
      else if (localX + rect.width > x + bodyViewportSize.width) {
        x = localX + rect.width - bodyViewportSize.width;
      }
    }
    if (anchor.row >= freeze.rows && bodyViewportSize.height > 0) {
      const localY = rect.y - frozenHeight;
      if (localY < y) y = localY;
      else if (localY + rect.height > y + bodyViewportSize.height) {
        y = localY + rect.height - bodyViewportSize.height;
      }
    }
    return {
      x: clamp(x, 0, Math.max(0, totalSize.width - frozenWidth - bodyViewportSize.width)),
      y: clamp(y, 0, Math.max(0, totalSize.height - frozenHeight - bodyViewportSize.height)),
    };
  }

  function forEachVisibleCell(
    callback: (address: CellAddress, paneId: FrozenPaneId) => void,
  ): void {
    const visited = new Set<string>();
    for (const paneId of ["topLeft", "top", "left", "body"] as const) {
      const pane = panes[paneId];
      for (const row of pane.rows) {
        for (const column of pane.columns) {
          const anchor = getAnchorForAddress({ row: row.index, column: column.index });
          const key = `${anchor.row}:${anchor.column}`;
          if (visited.has(key)) continue;
          visited.add(key);
          callback(anchor, paneId);
        }
      }
    }
  }

  return {
    bodyScrollPosition,
    freeze,
    frozenSize,
    nativeScrollSize,
    panes,
    viewportSize,
    getTotalSize: () => ({ ...totalSize }),
    getCellRect,
    getCellViewportRect,
    getCellAtViewportPoint,
    getPaneForAddress,
    getMergedRangeAt,
    getAnchorForAddress,
    getRangeRect,
    getRangePaneRects,
    getRangeFragments,
    getScrollPositionForAddress,
    forEachVisibleCell,
  };
}
