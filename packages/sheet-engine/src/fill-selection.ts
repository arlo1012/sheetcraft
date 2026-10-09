import type { CellAddress, CellRange } from "@sheetcraft/core/workbook";
import type { Point } from "./geometry.js";
import type { SheetViewportLayout } from "./viewport-layout.js";

export type FillDirection = "up" | "down" | "left" | "right";
export type FillAxis = "rows" | "columns";

export type FillBounds = {
  rowCount: number;
  columnCount: number;
};

/** The source and destination produced by one fill-handle gesture. */
export type FillRange = {
  direction: FillDirection;
  /** The original selected cells. */
  source: CellRange;
  /** The cells that will receive the fill. This never includes `source`. */
  target: CellRange;
  /** The contiguous source-and-target rectangle, suitable for a drag preview. */
  range: CellRange;
};

export type DoubleClickFillOptions = FillBounds & {
  /** Returns whether the adjacent column has data which permits filling through a row. */
  hasValue: (address: CellAddress) => boolean;
  /**
   * Prevents a target row from being crossed. Callers may use this to stop at
   * filtered/hidden rows or merged cells; the neutral default fills logical rows.
   */
  isRowFillable?: (row: number) => boolean;
};

/**
 * Gets the fill-handle anchor in viewport-body coordinates. It deliberately
 * uses the final cell's real rectangle rather than a clipped range edge, so a
 * handle never appears at a viewport boundary after its owning cell scrolled
 * away. The caller adds any row/column header offset.
 */
export function getFillHandlePoint(
  layout: SheetViewportLayout,
  sourceRange: CellRange,
): Point | null {
  const source = normalize(sourceRange);
  const end = source.end;
  const rect = layout.getCellViewportRect(end);
  if (!rect) return null;
  const clip = layout.panes[layout.getPaneForAddress(end)].clip;
  if (clip.width <= 0 || clip.height <= 0) return null;
  const point = { x: rect.x + rect.width, y: rect.y + rect.height };
  return point.x > clip.x &&
    point.x <= clip.x + clip.width &&
    point.y > clip.y &&
    point.y <= clip.y + clip.height
    ? point
    : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidBounds(bounds: FillBounds): boolean {
  return (
    Number.isSafeInteger(bounds.rowCount) &&
    bounds.rowCount > 0 &&
    Number.isSafeInteger(bounds.columnCount) &&
    bounds.columnCount > 0
  );
}

function isValidRange(range: CellRange, bounds?: FillBounds): boolean {
  const values = [range.start.row, range.start.column, range.end.row, range.end.column];
  if (!values.every(isNonNegativeInteger)) return false;
  return (
    !bounds ||
    (range.start.row < bounds.rowCount &&
      range.end.row < bounds.rowCount &&
      range.start.column < bounds.columnCount &&
      range.end.column < bounds.columnCount)
  );
}

function axisForDirection(direction: FillDirection): FillAxis {
  return direction === "up" || direction === "down" ? "rows" : "columns";
}

function normalize(range: CellRange): CellRange {
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

function getDirection(
  source: CellRange,
  hover: CellAddress,
  axis?: FillAxis,
): FillDirection | null {
  const up = source.start.row - hover.row;
  const down = hover.row - source.end.row;
  const left = source.start.column - hover.column;
  const right = hover.column - source.end.column;
  const candidates: Array<[FillDirection, number]> = [
    ["down", down],
    ["up", up],
    ["right", right],
    ["left", left],
  ];
  const eligible = axis
    ? candidates.filter(([direction]) => axisForDirection(direction) === axis)
    : candidates;
  const [direction, distance] = eligible.reduce((largest, candidate) =>
    candidate[1] > largest[1] ? candidate : largest,
  );
  return distance > 0 ? direction : null;
}

function isBeyond(source: CellRange, hover: CellAddress, direction: FillDirection): boolean {
  switch (direction) {
    case "up":
      return hover.row < source.start.row;
    case "down":
      return hover.row > source.end.row;
    case "left":
      return hover.column < source.start.column;
    case "right":
      return hover.column > source.end.column;
  }
}

/**
 * Calculates a single-axis fill destination. A diagonal drag chooses its
 * furthest outside edge; callers can pass `direction` after the first move to
 * lock that axis for the rest of the gesture.
 */
export function getFillRange(
  sourceRange: CellRange,
  hover: CellAddress,
  options?: { bounds?: FillBounds; axis?: FillAxis; direction?: FillDirection },
): FillRange | null {
  if (
    !isValidRange(sourceRange) ||
    !isNonNegativeInteger(hover.row) ||
    !isNonNegativeInteger(hover.column)
  )
    return null;
  if (
    options?.bounds &&
    (!isValidBounds(options.bounds) || !isValidRange(sourceRange, options.bounds))
  )
    return null;
  const source = normalize(sourceRange);
  const boundedHover = options?.bounds
    ? {
        row: clamp(hover.row, 0, options.bounds.rowCount - 1),
        column: clamp(hover.column, 0, options.bounds.columnCount - 1),
      }
    : hover;
  const axis =
    options?.axis ?? (options?.direction ? axisForDirection(options.direction) : undefined);
  const direction = getDirection(source, boundedHover, axis);
  if (!direction || !isBeyond(source, boundedHover, direction)) return null;

  switch (direction) {
    case "up": {
      const target = {
        start: { row: boundedHover.row, column: source.start.column },
        end: { row: source.start.row - 1, column: source.end.column },
      };
      return {
        direction,
        source,
        target,
        range: { start: target.start, end: source.end },
      };
    }
    case "down": {
      const target = {
        start: { row: source.end.row + 1, column: source.start.column },
        end: { row: boundedHover.row, column: source.end.column },
      };
      return {
        direction,
        source,
        target,
        range: { start: source.start, end: target.end },
      };
    }
    case "left": {
      const target = {
        start: { row: source.start.row, column: boundedHover.column },
        end: { row: source.end.row, column: source.start.column - 1 },
      };
      return {
        direction,
        source,
        target,
        range: { start: target.start, end: source.end },
      };
    }
    case "right": {
      const target = {
        start: { row: source.start.row, column: source.end.column + 1 },
        end: { row: source.end.row, column: boundedHover.column },
      };
      return {
        direction,
        source,
        target,
        range: { start: source.start, end: target.end },
      };
    }
  }
}

/**
 * Returns the downward destination for a fill-handle double click. The first
 * adjacent column with a contiguous run after the source wins (left, then
 * right). Scanning is bounded by the actual sheet row count, never its maximum.
 */
export function getDoubleClickFillRange(
  sourceRange: CellRange,
  options: DoubleClickFillOptions,
): FillRange | null {
  if (!isValidBounds(options) || !isValidRange(sourceRange, options)) return null;
  const source = normalize(sourceRange);
  if (source.end.row >= options.rowCount - 1) return null;
  const adjacentColumns = [source.start.column - 1, source.end.column + 1].filter(
    (column) => column >= 0 && column < options.columnCount,
  );
  const startRow = source.end.row + 1;
  for (const column of adjacentColumns) {
    let endRow = startRow - 1;
    for (let row = startRow; row < options.rowCount; row += 1) {
      if (options.isRowFillable && !options.isRowFillable(row)) break;
      if (!options.hasValue({ row, column })) break;
      endRow = row;
    }
    if (endRow >= startRow) {
      return getFillRange(
        source,
        { row: endRow, column: source.end.column },
        {
          direction: "down",
        },
      );
    }
  }
  return null;
}
