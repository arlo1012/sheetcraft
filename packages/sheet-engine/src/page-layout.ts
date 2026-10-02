import {
  cloneSheetPageSetup,
  getPagePaperSize,
  type CellRange,
  type SheetPageSetup,
} from "@idea10/core";
import type { Point, Rect, SheetGeometry, Size, VisibleCellRange } from "./geometry.js";
import type { RowVisibilityIndex, VisibleRow } from "./visibility.js";
import {
  createSheetViewportLayout,
  type MergeResolver,
  type SheetViewportLayout,
  type SheetViewportPaneRangeRect,
  type SheetViewportRangeFragment,
} from "./viewport-layout.js";

/** The sheet rendering modes which share workbook state but use different coordinates. */
export type SheetViewMode = "normal" | "page-break-preview" | "page-layout";
export type PageBreak = {
  index: number;
  kind: "automatic" | "manual";
  offset: number;
};
export type PageAxis = {
  start: number;
  end: number;
  offset: number;
  size: number;
};
export type SheetPageBoundary = {
  axis: "row" | "column";
  kind: "automatic" | "manual" | "print-start" | "print-end";
  /** A boundary is immediately before the cell at this zero-based index. */
  index: number;
};
export type SheetPrintCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type SheetPageMargin = "top" | "bottom" | "left" | "right" | "header" | "footer";
export type SheetPage = {
  rowPage: number;
  columnPage: number;
  /** Undefined for a layout-only paper band outside the actual print area. */
  pageNumber: number | undefined;
  range: CellRange;
  /** Continuous, unscaled sheet coordinates, useful for page-break preview. */
  sheetRect: Rect;
  /** Physical paper coordinates in the page-layout surface. */
  paperRect: Rect;
  contentRect: Rect;
};

export type SheetPagination = {
  paperSize: Size;
  contentSize: Size;
  printScale: number;
  printRange: CellRange;
  pageRows: readonly PageAxis[];
  pageColumns: readonly PageAxis[];
  rowBreaks: readonly PageBreak[];
  columnBreaks: readonly PageBreak[];
  pageCount: number;
  pageOrder: SheetPageSetup["pageOrder"];
  getPage: (rowPage: number, columnPage: number) => SheetPage | null;
  getVisiblePages: (rect: Rect, mode?: SheetViewMode) => SheetPage[];
  getSheetRect: (page: Pick<SheetPage, "rowPage" | "columnPage">) => Rect | null;
};

const PX_PER_MM = 96 / 25.4;
const PAGE_GAP = 32;
const HIDDEN_WHITE_SPACE_GAP = 2;
const MIN_PRINTABLE_MM = 1;

function rectIntersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
function axisEndOffset(axis: PageAxis): number {
  return axis.offset + axis.size;
}
function findAxisAt(axes: readonly PageAxis[], offset: number): number | null {
  let low = 0;
  let high = axes.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const axis = axes[middle]!;
    if (offset < axis.offset) high = middle - 1;
    else if (offset >= axisEndOffset(axis)) low = middle + 1;
    else return middle;
  }
  return null;
}
function findAxisForLogicalIndex(axes: readonly PageAxis[], index: number): number {
  let low = 0;
  let high = axes.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const axis = axes[middle]!;
    if (index < axis.start) high = middle - 1;
    else if (index > axis.end) low = middle + 1;
    else return middle;
  }
  return -1;
}

function firstVisibleRow(rows: RowVisibilityIndex, start: number, end: number): number | null {
  if (start > end) return null;
  const row = rows.isRowVisible(start) ? start : rows.getNextVisibleRow(start);
  return row !== null && row <= end ? row : null;
}
function lastVisibleRow(rows: RowVisibilityIndex, start: number, end: number): number | null {
  if (start > end) return null;
  const row = rows.isRowVisible(end) ? end : rows.getPreviousVisibleRow(end);
  return row !== null && row >= start ? row : null;
}
function firstVisibleColumn(geometry: SheetGeometry, start: number, end: number): number | null {
  for (let column = start; column <= end; column += 1)
    if (geometry.getColumnWidth(column) > 0) return column;
  return null;
}
function lastVisibleColumn(geometry: SheetGeometry, start: number, end: number): number | null {
  for (let column = end; column >= start; column -= 1)
    if (geometry.getColumnWidth(column) > 0) return column;
  return null;
}

/**
 * Finds the final visible row which fits after `start` without walking every
 * default-height row in a long sparse sheet. A first row which is taller than
 * a page still occupies its own page, matching the pagination contract.
 */
function lastRowWithinCapacity(
  rows: RowVisibilityIndex,
  start: number,
  limit: number,
  capacity: number,
): number | null {
  const first = firstVisibleRow(rows, start, limit);
  if (first === null) return null;
  const startOffset = rows.getBoundaryOffset(start) ?? 0;
  const limitOffset = rows.getBoundaryOffset(limit + 1) ?? startOffset;
  const probe = Math.min(limitOffset - 0.000001, startOffset + capacity - 0.000001);
  const candidate = rows.getLogicalRowAtOffset(probe);
  if (candidate === null || candidate < first) return first;
  const candidateEnd = rows.getBoundaryOffset(candidate + 1) ?? startOffset;
  if (candidateEnd <= startOffset + capacity) return Math.min(candidate, limit);
  return rows.getPreviousVisibleRow(candidate) ?? first;
}

/** Column counterpart of `lastRowWithinCapacity`, using geometry's sparse lookup. */
function lastColumnWithinCapacity(
  geometry: SheetGeometry,
  start: number,
  limit: number,
  capacity: number,
): number | null {
  const first = firstVisibleColumn(geometry, start, limit);
  if (first === null) return null;
  const startOffset = geometry.getColumnOffset(start);
  const limitOffset = geometry.getColumnOffset(limit) + geometry.getColumnWidth(limit);
  const probe = Math.min(limitOffset - 0.000001, startOffset + capacity - 0.000001);
  const candidate = geometry.getCellAtPoint({ x: probe, y: 0 })?.column ?? null;
  if (candidate === null || candidate < first) return first;
  const candidateEnd = geometry.getColumnOffset(candidate) + geometry.getColumnWidth(candidate);
  if (candidateEnd <= startOffset + capacity) return Math.min(candidate, limit);
  const previous = geometry.getCellAtPoint({
    x: geometry.getColumnOffset(candidate) - 0.000001,
    y: 0,
  })?.column;
  return previous !== undefined && previous >= first ? previous : first;
}

function getBoundaryScale(options: {
  geometry: SheetGeometry;
  rows: RowVisibilityIndex;
  pagination: SheetPagination;
  setup: SheetPageSetup;
  axis: "row" | "column";
  start: number;
  end: number;
}): number | null {
  const { geometry, rows, pagination, setup, axis, start, end } = options;
  if (end < start) return setup.scale;
  const used =
    axis === "row"
      ? (rows.getBoundaryOffset(end + 1) ?? 0) - (rows.getBoundaryOffset(start) ?? 0)
      : geometry.getColumnOffset(end) +
        geometry.getColumnWidth(end) -
        geometry.getColumnOffset(start);
  const capacity = axis === "row" ? pagination.contentSize.height : pagination.contentSize.width;
  if (used <= capacity) return setup.scale;
  // Content capacity is inversely proportional to print scale. Keep the largest
  // whole-number scale which can contain this band, rather than permitting cells
  // to overflow the page's physical content rectangle.
  const candidate = Math.floor((setup.scale * capacity) / used + 0.0000001);
  if (candidate < 10) return null;
  return Math.min(setup.scale, Math.min(400, candidate));
}

function snapBoundaryPastMerge(options: {
  target: number;
  axis: "row" | "column";
  printRange: CellRange;
  mergedCells: readonly CellRange[] | undefined;
}): number {
  let target = options.target;
  if (!options.mergedCells) return target;
  // A page boundary cannot split a merged cell. Repeating handles a target which
  // lands at the start of a chain of adjacent merged ranges.
  for (;;) {
    const crossing = options.mergedCells.find((range) => {
      const start = options.axis === "row" ? range.start.row : range.start.column;
      const end = options.axis === "row" ? range.end.row : range.end.column;
      const otherStart = options.axis === "row" ? range.start.column : range.start.row;
      const otherEnd = options.axis === "row" ? range.end.column : range.end.row;
      const printOtherStart =
        options.axis === "row" ? options.printRange.start.column : options.printRange.start.row;
      const printOtherEnd =
        options.axis === "row" ? options.printRange.end.column : options.printRange.end.row;
      return (
        start < target &&
        end >= target &&
        otherStart <= printOtherEnd &&
        otherEnd >= printOtherStart
      );
    });
    if (!crossing) return target;
    const next = (options.axis === "row" ? crossing.end.row : crossing.end.column) + 1;
    if (next === target) return target;
    target = next;
  }
}

/** Returns a canonical, detached setup after one margin drag, or null for no change. */
export function adjustSheetPageMargin(options: {
  setup: SheetPageSetup;
  margin: SheetPageMargin;
  valueMm: number;
}): SheetPageSetup | null {
  if (!Number.isFinite(options.valueMm)) return null;
  const setup = cloneSheetPageSetup(options.setup);
  const paper = getPagePaperSize(setup);
  const margins = { ...setup.margins };
  const clampMargin = (value: number, minimum: number, maximum: number) =>
    clamp(value, minimum, Math.max(minimum, maximum));
  switch (options.margin) {
    case "left":
      margins.left = clampMargin(
        options.valueMm,
        0,
        paper.width - margins.right - MIN_PRINTABLE_MM,
      );
      break;
    case "right":
      margins.right = clampMargin(
        options.valueMm,
        0,
        paper.width - margins.left - MIN_PRINTABLE_MM,
      );
      break;
    case "top":
      margins.top = clampMargin(
        options.valueMm,
        0,
        paper.height - margins.bottom - MIN_PRINTABLE_MM,
      );
      margins.header = Math.min(margins.header, margins.top);
      break;
    case "bottom":
      margins.bottom = clampMargin(
        options.valueMm,
        0,
        paper.height - margins.top - MIN_PRINTABLE_MM,
      );
      margins.footer = Math.min(margins.footer, margins.bottom);
      break;
    case "header":
      margins.header = clampMargin(options.valueMm, 0, margins.top);
      break;
    case "footer":
      margins.footer = clampMargin(options.valueMm, 0, margins.bottom);
      break;
  }
  if (margins[options.margin] === setup.margins[options.margin]) return null;
  setup.margins = margins;
  return setup;
}

/**
 * Produces one immutable page-setup update for a preview boundary drag.
 * Internal outward drags lower print scale when necessary so the resulting band
 * fits in physical paper; an impossible target below the 10% scale floor returns null.
 */
export function adjustSheetPageBoundary(options: {
  geometry: SheetGeometry;
  rows: RowVisibilityIndex;
  setup: SheetPageSetup;
  pagination: SheetPagination;
  boundary: SheetPageBoundary;
  targetIndex: number | null;
  /** Optional merge information lets the target avoid splitting a merged cell. */
  mergedCells?: readonly CellRange[];
}): SheetPageSetup | null {
  const { geometry, rows, pagination, boundary } = options;
  const printRange = pagination.printRange;
  const maximum = boundary.axis === "row" ? geometry.rowCount : geometry.columnCount;
  const printStart = boundary.axis === "row" ? printRange.start.row : printRange.start.column;
  const printEnd = boundary.axis === "row" ? printRange.end.row : printRange.end.column;
  const setup = cloneSheetPageSetup(options.setup);

  if (boundary.kind === "print-start" || boundary.kind === "print-end") {
    if (options.targetIndex === null) return null;
    const target =
      boundary.kind === "print-start"
        ? clamp(Math.floor(options.targetIndex), 0, printEnd)
        : clamp(Math.floor(options.targetIndex), printStart + 1, maximum);
    const nextRange: CellRange = {
      start: { ...printRange.start },
      end: { ...printRange.end },
    };
    if (boundary.axis === "row") {
      if (boundary.kind === "print-start") nextRange.start.row = target;
      else nextRange.end.row = target - 1;
    } else if (boundary.kind === "print-start") nextRange.start.column = target;
    else nextRange.end.column = target - 1;
    if (
      nextRange.start.row === printRange.start.row &&
      nextRange.end.row === printRange.end.row &&
      nextRange.start.column === printRange.start.column &&
      nextRange.end.column === printRange.end.column
    )
      return null;
    setup.printArea = nextRange;
    return setup;
  }

  const field = boundary.axis === "row" ? "rowBreaks" : "columnBreaks";
  if (options.targetIndex === null) {
    if (boundary.kind !== "manual" || !setup[field].includes(boundary.index)) return null;
    setup[field] = setup[field].filter((index) => index !== boundary.index);
    return setup;
  }

  let target = clamp(Math.floor(options.targetIndex), printStart + 1, printEnd + 1);
  target = snapBoundaryPastMerge({
    target,
    axis: boundary.axis,
    printRange,
    mergedCells: options.mergedCells,
  });
  target = clamp(target, printStart + 1, printEnd + 1);
  if (target === boundary.index) return null;

  const axes = boundary.axis === "row" ? pagination.pageRows : pagination.pageColumns;
  const previous = axes.find((axis) => axis.end === boundary.index - 1);
  if (!previous) return null;
  if (target > boundary.index) {
    const scale = getBoundaryScale({
      geometry,
      rows,
      pagination,
      setup,
      axis: boundary.axis,
      start: Math.max(printStart, previous.start),
      end: target - 1,
    });
    if (scale === null) return null;
    setup.scale = scale;
  }

  const crossed = target > boundary.index;
  const retained = setup[field].filter(
    (index) => index !== boundary.index && !(crossed && index > boundary.index && index < target),
  );
  // A break after the last printable cell has no printed page after it; omitting it
  // deliberately merges the last two pages.
  if (target <= printEnd) retained.push(target);
  setup[field] = [...new Set(retained)].sort((left, right) => left - right);
  return setup;
}

/** Produces one print-area update for a two-axis corner drag. */
export function adjustSheetPrintCorner(options: {
  geometry: SheetGeometry;
  rows: RowVisibilityIndex;
  setup: SheetPageSetup;
  pagination: SheetPagination;
  corner: SheetPrintCorner;
  targetRow: number;
  targetColumn: number;
}): SheetPageSetup | null {
  const rowKind = options.corner.startsWith("top") ? "print-start" : "print-end";
  const columnKind = options.corner.endsWith("left") ? "print-start" : "print-end";
  const initial = options.pagination.printRange;
  const row = adjustSheetPageBoundary({
    ...options,
    boundary: {
      axis: "row",
      kind: rowKind,
      index: rowKind === "print-start" ? initial.start.row : initial.end.row + 1,
    },
    targetIndex: options.targetRow,
  });
  const afterRow = row ?? cloneSheetPageSetup(options.setup);
  const afterRange = afterRow.printArea ?? initial;
  const column = adjustSheetPageBoundary({
    ...options,
    setup: afterRow,
    pagination: { ...options.pagination, printRange: afterRange },
    boundary: {
      axis: "column",
      kind: columnKind,
      index: columnKind === "print-start" ? afterRange.start.column : afterRange.end.column + 1,
    },
    targetIndex: options.targetColumn,
  });
  return column ?? row;
}

function createRowPages(
  rows: RowVisibilityIndex,
  range: CellRange,
  capacity: number,
  manual: readonly number[],
  merged: readonly CellRange[],
): { axes: PageAxis[]; breaks: PageBreak[] } {
  const axes: PageAxis[] = [];
  const breaks: PageBreak[] = [];
  const starts = new Set(manual.filter((row) => row > range.start.row && row <= range.end.row));
  let start = range.start.row;
  while (start <= range.end.row) {
    const nextManual = manual.find((row) => row > start && row <= range.end.row);
    const limit = nextManual === undefined ? range.end.row : nextManual - 1;
    let end = start - 1;
    const cursor = lastRowWithinCapacity(rows, start, limit, capacity);
    if (cursor === null) {
      axes.push({ start, end: limit, offset: rows.getBoundaryOffset(start) ?? 0, size: 0 });
      start = limit + 1;
      continue;
    }
    end = cursor;
    const remainingRow = lastVisibleRow(rows, end + 1, limit);
    if (end < limit && (remainingRow === null || remainingRow < end + 1)) end = limit;
    // A break through a merge is moved past the merge whenever it does not make an empty page.
    const crossing = merged.find(
      (item) => item.start.row <= end && item.end.row > end && item.start.row >= start,
    );
    if (crossing && crossing.end.row <= limit) end = crossing.end.row;
    const last = lastVisibleRow(rows, start, end);
    const actualSize =
      last === null
        ? 0
        : rows.getVisibleRow(last)!.offset +
          rows.getVisibleRow(last)!.height -
          (rows.getBoundaryOffset(start) ?? 0);
    axes.push({ start, end, offset: rows.getBoundaryOffset(start) ?? 0, size: actualSize });
    const nextStart = end + 1;
    if (nextStart <= range.end.row)
      breaks.push({
        index: nextStart,
        kind: starts.has(nextStart) ? "manual" : "automatic",
        offset: rows.getBoundaryOffset(nextStart) ?? 0,
      });
    start = nextStart;
  }
  return { axes, breaks };
}

function createColumnPages(
  geometry: SheetGeometry,
  range: CellRange,
  capacity: number,
  manual: readonly number[],
  merged: readonly CellRange[],
): { axes: PageAxis[]; breaks: PageBreak[] } {
  const axes: PageAxis[] = [];
  const breaks: PageBreak[] = [];
  const starts = new Set(
    manual.filter((column) => column > range.start.column && column <= range.end.column),
  );
  let start = range.start.column;
  while (start <= range.end.column) {
    const nextManual = manual.find((column) => column > start && column <= range.end.column);
    const limit = nextManual === undefined ? range.end.column : nextManual - 1;
    let end = start - 1;
    const cursor = lastColumnWithinCapacity(geometry, start, limit, capacity);
    if (cursor === null) {
      axes.push({ start, end: limit, offset: geometry.getColumnOffset(start), size: 0 });
      start = limit + 1;
      continue;
    }
    end = cursor;
    const remainingColumn = lastVisibleColumn(geometry, end + 1, limit);
    if (end < limit && (remainingColumn === null || remainingColumn < end + 1)) end = limit;
    const crossing = merged.find(
      (item) => item.start.column <= end && item.end.column > end && item.start.column >= start,
    );
    if (crossing && crossing.end.column <= limit) end = crossing.end.column;
    const last = lastVisibleColumn(geometry, start, end);
    const actualSize =
      last === null
        ? 0
        : geometry.getColumnOffset(last) +
          geometry.getColumnWidth(last) -
          geometry.getColumnOffset(start);
    axes.push({ start, end, offset: geometry.getColumnOffset(start), size: actualSize });
    const nextStart = end + 1;
    if (nextStart <= range.end.column)
      breaks.push({
        index: nextStart,
        kind: starts.has(nextStart) ? "manual" : "automatic",
        offset: geometry.getColumnOffset(nextStart),
      });
    start = nextStart;
  }
  return { axes, breaks };
}

function getPageDimensions(setup: SheetPageSetup): {
  paperSize: Size;
  contentSize: Size;
  printScale: number;
} {
  const paperMm = getPagePaperSize(setup);
  const printScale = setup.scale / 100;
  const paperSize = {
    width: (paperMm.width * PX_PER_MM) / printScale,
    height: (paperMm.height * PX_PER_MM) / printScale,
  };
  return {
    paperSize,
    contentSize: {
      width: Math.max(
        1,
        paperSize.width -
          (setup.margins.left * PX_PER_MM) / printScale -
          (setup.margins.right * PX_PER_MM) / printScale,
      ),
      height: Math.max(
        1,
        paperSize.height -
          (setup.margins.top * PX_PER_MM) / printScale -
          (setup.margins.bottom * PX_PER_MM) / printScale,
      ),
    },
    printScale,
  };
}

function expandLayoutRangeThroughMerges(range: CellRange, merged: readonly CellRange[]): CellRange {
  const expanded: CellRange = {
    start: { ...range.start },
    end: { ...range.end },
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const merge of merged) {
      if (
        merge.start.row <= expanded.end.row &&
        merge.start.column <= expanded.end.column &&
        merge.end.row >= expanded.start.row &&
        merge.end.column >= expanded.start.column
      ) {
        const row = Math.max(expanded.end.row, merge.end.row);
        const column = Math.max(expanded.end.column, merge.end.column);
        changed ||= row !== expanded.end.row || column !== expanded.end.column;
        expanded.end.row = row;
        expanded.end.column = column;
      }
    }
  }
  return expanded;
}

function extendFinalRowPage(options: {
  rows: RowVisibilityIndex;
  range: CellRange;
  capacity: number;
  manual: readonly number[];
  merged: readonly CellRange[];
}): number {
  const { rows, range, capacity, manual, merged } = options;
  const last = createRowPages(rows, range, capacity, manual, merged).axes.at(-1)!;
  const nextManual = manual.find((row) => row > last.start && row < rows.rowCount);
  const limit = nextManual === undefined ? rows.rowCount - 1 : nextManual - 1;
  const pageStart = rows.getBoundaryOffset(last.start) ?? 0;
  let end = range.end.row;
  let cursor = firstVisibleRow(rows, end + 1, limit);
  while (cursor !== null) {
    const cellEnd = rows.getBoundaryOffset(cursor + 1) ?? pageStart;
    if (cellEnd - pageStart > capacity) break;
    end = cursor;
    cursor = firstVisibleRow(rows, cursor + 1, limit);
  }
  return end;
}

function extendFinalColumnPage(options: {
  geometry: SheetGeometry;
  range: CellRange;
  capacity: number;
  manual: readonly number[];
  merged: readonly CellRange[];
}): number {
  const { geometry, range, capacity, manual, merged } = options;
  const last = createColumnPages(geometry, range, capacity, manual, merged).axes.at(-1)!;
  const nextManual = manual.find((column) => column > last.start && column < geometry.columnCount);
  const limit = nextManual === undefined ? geometry.columnCount - 1 : nextManual - 1;
  const pageStart = geometry.getColumnOffset(last.start);
  let end = range.end.column;
  let cursor = firstVisibleColumn(geometry, end + 1, limit);
  while (cursor !== null) {
    const cellEnd = geometry.getColumnOffset(cursor) + geometry.getColumnWidth(cursor);
    if (cellEnd - pageStart > capacity) break;
    end = cursor;
    cursor = firstVisibleColumn(geometry, cursor + 1, limit);
  }
  return end;
}

/**
 * Returns the editable range for page-layout view. The requested sparse-content
 * extent remains compact, but its final row and column page bands are completed
 * with real, unmaterialized blank cells. Print pagination remains independent.
 */
export function getPageLayoutRange(options: {
  geometry: SheetGeometry;
  rows: RowVisibilityIndex;
  setup: SheetPageSetup;
  printRange: CellRange;
  contentRange: CellRange;
  mergedCells?: readonly CellRange[];
}): CellRange {
  const { geometry, rows, setup } = options;
  const printRange: CellRange = {
    start: {
      row: Math.min(options.printRange.start.row, options.printRange.end.row),
      column: Math.min(options.printRange.start.column, options.printRange.end.column),
    },
    end: {
      row: Math.max(options.printRange.start.row, options.printRange.end.row),
      column: Math.max(options.printRange.start.column, options.printRange.end.column),
    },
  };
  const inputEnd = {
    row: Math.max(options.contentRange.start.row, options.contentRange.end.row, printRange.end.row),
    column: Math.max(
      options.contentRange.start.column,
      options.contentRange.end.column,
      printRange.end.column,
    ),
  };
  if (
    inputEnd.row < 0 ||
    inputEnd.column < 0 ||
    inputEnd.row >= geometry.rowCount ||
    inputEnd.column >= geometry.columnCount
  )
    throw new RangeError("Page layout range is outside the grid.");
  if (rows.rowCount !== geometry.rowCount)
    throw new RangeError("Row visibility count must match geometry row count.");
  const dimensions = getPageDimensions(setup);
  const rowManual = [
    ...setup.rowBreaks.filter((row) => row > printRange.start.row && row <= printRange.end.row),
    ...(printRange.start.row > 0 ? [printRange.start.row] : []),
  ].sort((left, right) => left - right);
  const columnManual = [
    ...setup.columnBreaks.filter(
      (column) => column > printRange.start.column && column <= printRange.end.column,
    ),
    ...(printRange.start.column > 0 ? [printRange.start.column] : []),
  ].sort((left, right) => left - right);
  const merged = options.mergedCells ?? [];
  let range: CellRange = { start: { row: 0, column: 0 }, end: inputEnd };
  // A merge can extend one terminal axis, which in turn can expose another merge.
  // Repeat until both axes have a complete page band around all exposed merges.
  for (;;) {
    range = expandLayoutRangeThroughMerges(range, merged);
    if (range.end.row >= geometry.rowCount || range.end.column >= geometry.columnCount)
      throw new RangeError("Merged cell is outside the grid.");
    const end = {
      row: extendFinalRowPage({
        rows,
        range,
        capacity: dimensions.contentSize.height,
        manual: rowManual,
        merged,
      }),
      column: extendFinalColumnPage({
        geometry,
        range,
        capacity: dimensions.contentSize.width,
        manual: columnManual,
        merged,
      }),
    };
    if (end.row === range.end.row && end.column === range.end.column) return range;
    range = { ...range, end };
  }
}

export function createSheetPagination(options: {
  geometry: SheetGeometry;
  rows: RowVisibilityIndex;
  setup: SheetPageSetup;
  printRange: CellRange;
  /** Allocated cells to keep editable in page-layout mode. Defaults to printRange. */ layoutRange?: CellRange;
  mergedCells?: readonly CellRange[];
}): SheetPagination {
  const { geometry, rows, setup } = options;
  const printRange: CellRange = {
    start: {
      row: Math.min(options.printRange.start.row, options.printRange.end.row),
      column: Math.min(options.printRange.start.column, options.printRange.end.column),
    },
    end: {
      row: Math.max(options.printRange.start.row, options.printRange.end.row),
      column: Math.max(options.printRange.start.column, options.printRange.end.column),
    },
  };
  if (
    printRange.end.row >= geometry.rowCount ||
    printRange.end.column >= geometry.columnCount ||
    printRange.start.row < 0 ||
    printRange.start.column < 0
  )
    throw new RangeError("Print range is outside the grid.");
  if (rows.rowCount !== geometry.rowCount)
    throw new RangeError("Row visibility count must match geometry row count.");
  const { paperSize, contentSize, printScale } = getPageDimensions(setup);
  const margins = {
    left: (setup.margins.left * PX_PER_MM) / printScale,
    right: (setup.margins.right * PX_PER_MM) / printScale,
    top: (setup.margins.top * PX_PER_MM) / printScale,
    bottom: (setup.margins.bottom * PX_PER_MM) / printScale,
  };
  const layoutSource = options.layoutRange ?? printRange;
  const layoutRange: CellRange = {
    start: {
      row: Math.min(layoutSource.start.row, layoutSource.end.row),
      column: Math.min(layoutSource.start.column, layoutSource.end.column),
    },
    end: {
      row: Math.max(layoutSource.start.row, layoutSource.end.row),
      column: Math.max(layoutSource.start.column, layoutSource.end.column),
    },
  };
  if (
    layoutRange.end.row >= geometry.rowCount ||
    layoutRange.end.column >= geometry.columnCount ||
    layoutRange.start.row < 0 ||
    layoutRange.start.column < 0
  )
    throw new RangeError("Layout range is outside the grid.");
  if (
    printRange.start.row < layoutRange.start.row ||
    printRange.end.row > layoutRange.end.row ||
    printRange.start.column < layoutRange.start.column ||
    printRange.end.column > layoutRange.end.column
  )
    throw new RangeError("Print range must be contained by layout range.");
  const merged = (options.mergedCells ?? []).filter(
    (range) =>
      range.start.row <= layoutRange.end.row &&
      range.end.row >= layoutRange.start.row &&
      range.start.column <= layoutRange.end.column &&
      range.end.column >= layoutRange.start.column,
  );
  // Force the first printable cell onto a paper boundary. The final printable band may
  // absorb following allocated blank cells until its physical content area is full.
  const rowPages = createRowPages(
    rows,
    layoutRange,
    contentSize.height,
    [
      ...setup.rowBreaks.filter((row) => row > printRange.start.row && row <= printRange.end.row),
      ...(printRange.start.row > layoutRange.start.row ? [printRange.start.row] : []),
    ],
    merged,
  );
  const columnPages = createColumnPages(
    geometry,
    layoutRange,
    contentSize.width,
    [
      ...setup.columnBreaks.filter(
        (column) => column > printRange.start.column && column <= printRange.end.column,
      ),
      ...(printRange.start.column > layoutRange.start.column ? [printRange.start.column] : []),
    ],
    merged,
  );
  const pageGap = PAGE_GAP / printScale;
  const stride = { width: paperSize.width + pageGap, height: paperSize.height + pageGap };
  const printedRows = rowPages.axes.filter(
    (axis) => axis.end >= printRange.start.row && axis.start <= printRange.end.row,
  );
  const printedColumns = columnPages.axes.filter(
    (axis) => axis.end >= printRange.start.column && axis.start <= printRange.end.column,
  );
  function getPage(rowPage: number, columnPage: number): SheetPage | null {
    const row = rowPages.axes[rowPage];
    const column = columnPages.axes[columnPage];
    if (!row || !column) return null;
    const paperRect = {
      x: columnPage * stride.width,
      y: rowPage * stride.height,
      width: paperSize.width,
      height: paperSize.height,
    };
    const contentRect = {
      x: paperRect.x + margins.left,
      y: paperRect.y + margins.top,
      width: contentSize.width,
      height: contentSize.height,
    };
    const printable =
      row.end >= printRange.start.row &&
      row.start <= printRange.end.row &&
      column.end >= printRange.start.column &&
      column.start <= printRange.end.column;
    const printedRow = printedRows.indexOf(row);
    const printedColumn = printedColumns.indexOf(column);
    const pageNumber = !printable
      ? undefined
      : setup.pageOrder === "downThenOver"
        ? printedColumn * printedRows.length + printedRow + 1
        : printedRow * printedColumns.length + printedColumn + 1;
    const clippedRows = {
      start: Math.max(row.start, printRange.start.row),
      end: Math.min(row.end, printRange.end.row),
    };
    const clippedColumns = {
      start: Math.max(column.start, printRange.start.column),
      end: Math.min(column.end, printRange.end.column),
    };
    const sheetRect = printable
      ? {
          x: geometry.getColumnOffset(clippedColumns.start),
          y: rows.getBoundaryOffset(clippedRows.start) ?? 0,
          width:
            geometry.getColumnOffset(clippedColumns.end) +
            geometry.getColumnWidth(clippedColumns.end) -
            geometry.getColumnOffset(clippedColumns.start),
          height:
            (rows.getBoundaryOffset(clippedRows.end + 1) ?? 0) -
            (rows.getBoundaryOffset(clippedRows.start) ?? 0),
        }
      : { x: column.offset, y: row.offset, width: 0, height: 0 };
    return {
      rowPage,
      columnPage,
      pageNumber,
      range: {
        start: { row: row.start, column: column.start },
        end: { row: row.end, column: column.end },
      },
      sheetRect,
      paperRect,
      contentRect,
    };
  }
  function getVisiblePages(rect: Rect, mode: SheetViewMode = "page-layout"): SheetPage[] {
    if (rect.width <= 0 || rect.height <= 0) return [];
    const source = mode === "page-break-preview" ? { width: 0, height: 0 } : stride;
    const axisIndex = (axes: readonly PageAxis[], value: number) =>
      findAxisAt(axes, clamp(value, axes[0]!.offset, axisEndOffset(axes.at(-1)!) - 0.000001));
    const rowStart =
      mode === "page-break-preview"
        ? axisIndex(rowPages.axes, rect.y)
        : clamp(Math.floor(rect.y / source.height), 0, rowPages.axes.length - 1);
    const rowEnd =
      mode === "page-break-preview"
        ? axisIndex(rowPages.axes, rect.y + rect.height - 0.000001)
        : clamp(
            Math.floor((rect.y + rect.height - 0.000001) / source.height),
            0,
            rowPages.axes.length - 1,
          );
    const colStart =
      mode === "page-break-preview"
        ? axisIndex(columnPages.axes, rect.x)
        : clamp(Math.floor(rect.x / source.width), 0, columnPages.axes.length - 1);
    const colEnd =
      mode === "page-break-preview"
        ? axisIndex(columnPages.axes, rect.x + rect.width - 0.000001)
        : clamp(
            Math.floor((rect.x + rect.width - 0.000001) / source.width),
            0,
            columnPages.axes.length - 1,
          );
    if (rowStart === null || rowEnd === null || colStart === null || colEnd === null) return [];
    const pages: SheetPage[] = [];
    for (let row = rowStart; row <= rowEnd; row += 1)
      for (let column = colStart; column <= colEnd; column += 1) {
        const page = getPage(row, column);
        if (
          page &&
          (mode !== "page-break-preview" || page.pageNumber !== undefined) &&
          rectIntersects(mode === "page-break-preview" ? page.sheetRect : page.paperRect, rect)
        )
          pages.push(page);
      }
    return pages;
  }
  return {
    paperSize,
    contentSize,
    printScale,
    printRange,
    pageRows: rowPages.axes,
    pageColumns: columnPages.axes,
    rowBreaks: rowPages.breaks.filter(
      (item) => item.index > printRange.start.row && item.index <= printRange.end.row,
    ),
    columnBreaks: columnPages.breaks.filter(
      (item) => item.index > printRange.start.column && item.index <= printRange.end.column,
    ),
    pageCount: printedRows.length * printedColumns.length,
    pageOrder: setup.pageOrder,
    getPage,
    getVisiblePages,
    getSheetRect: (page) => getPage(page.rowPage, page.columnPage)?.sheetRect ?? null,
  };
}

export type PageLayoutProjection = {
  geometry: SheetGeometry;
  rows: RowVisibilityIndex;
  columnAtOffset: (x: number) => number | null;
  /** Page rectangles in this projection's view-only white-space mode. */
  getPage: (rowPage: number, columnPage: number) => SheetPage | null;
  getVisiblePages: (rect: Rect) => SheetPage[];
};

/** Projects logical cell coordinates onto separated paper rectangles while retaining logical addresses. */
export function createPageLayoutProjection(options: {
  geometry: SheetGeometry;
  rows: RowVisibilityIndex;
  pagination: SheetPagination;
  /** Hides top/bottom paper white space without changing print pagination. */
  showWhiteSpace?: boolean;
  /** View-only space around the projected paper surface. */
  pagePadding?: number;
}): PageLayoutProjection {
  const { geometry: base, rows: source, pagination } = options;
  const showWhiteSpace = options.showWhiteSpace ?? true;
  const pagePadding = options.pagePadding ?? 0;
  const interPageGap = (showWhiteSpace ? PAGE_GAP : HIDDEN_WHITE_SPACE_GAP) / pagination.printScale;
  const paperStride = {
    width: pagination.paperSize.width + PAGE_GAP / pagination.printScale,
    height: showWhiteSpace
      ? pagination.paperSize.height + PAGE_GAP / pagination.printScale
      : pagination.contentSize.height + HIDDEN_WHITE_SPACE_GAP / pagination.printScale,
  };
  const firstPaper = pagination.getPage(0, 0);
  if (!firstPaper) throw new RangeError("Pagination must contain at least one page.");
  const margin = {
    left: firstPaper.contentRect.x - firstPaper.paperRect.x,
    top: showWhiteSpace ? firstPaper.contentRect.y - firstPaper.paperRect.y : 0,
  };
  const lastRowAxis = pagination.pageRows.at(-1)!;
  const lastColumnAxis = pagination.pageColumns.at(-1)!;
  const totalWidth = Math.max(
    pagination.pageColumns.length * paperStride.width -
      PAGE_GAP / pagination.printScale +
      pagePadding * 2,
    pagePadding +
      (pagination.pageColumns.length - 1) * paperStride.width +
      margin.left +
      lastColumnAxis.size +
      pagePadding,
  );
  const totalHeight = Math.max(
    pagination.pageRows.length * paperStride.height - interPageGap + pagePadding * 2,
    pagePadding +
      (pagination.pageRows.length - 1) * paperStride.height +
      margin.top +
      lastRowAxis.size +
      pagePadding,
  );
  const layoutRowCount = lastRowAxis.end + 1;
  const layoutColumnCount = lastColumnAxis.end + 1;
  const lastVisibleLayoutRow = lastVisibleRow(source, 0, lastRowAxis.end);
  const layoutVisibleRowCount =
    lastVisibleLayoutRow === null ? 0 : (source.getVisibleIndex(lastVisibleLayoutRow) ?? -1) + 1;
  function getPage(rowPage: number, columnPage: number): SheetPage | null {
    const page = pagination.getPage(rowPage, columnPage);
    if (!page) return null;
    const paperRect = showWhiteSpace
      ? { ...page.paperRect }
      : {
          x: page.paperRect.x,
          y: rowPage * paperStride.height,
          width: page.paperRect.width,
          height: pagination.contentSize.height,
        };
    paperRect.x += pagePadding;
    paperRect.y += pagePadding;
    return {
      ...page,
      paperRect,
      contentRect: {
        x: (showWhiteSpace ? page.contentRect.x : page.paperRect.x + margin.left) + pagePadding,
        y: (showWhiteSpace ? page.contentRect.y : paperRect.y - pagePadding) + pagePadding,
        width: page.contentRect.width,
        height: showWhiteSpace ? page.contentRect.height : pagination.contentSize.height,
      },
    };
  }
  function getVisiblePages(rect: Rect): SheetPage[] {
    if (rect.width <= 0 || rect.height <= 0) return [];
    const startRow = clamp(
      Math.floor((rect.y - pagePadding) / paperStride.height),
      0,
      pagination.pageRows.length - 1,
    );
    const endRow = clamp(
      Math.floor((rect.y + rect.height - pagePadding - 0.000001) / paperStride.height),
      0,
      pagination.pageRows.length - 1,
    );
    const startColumn = clamp(
      Math.floor((rect.x - pagePadding) / paperStride.width),
      0,
      pagination.pageColumns.length - 1,
    );
    const endColumn = clamp(
      Math.floor((rect.x + rect.width - pagePadding - 0.000001) / paperStride.width),
      0,
      pagination.pageColumns.length - 1,
    );
    const pages: SheetPage[] = [];
    for (let row = startRow; row <= endRow; row += 1)
      for (let column = startColumn; column <= endColumn; column += 1) {
        const page = getPage(row, column);
        if (page && rectIntersects(page.paperRect, rect)) pages.push(page);
      }
    return pages;
  }
  const rowPageFor = (row: number) => findAxisForLogicalIndex(pagination.pageRows, row);
  const columnPageFor = (column: number) => findAxisForLogicalIndex(pagination.pageColumns, column);
  function rowOffset(row: number): number | null {
    const pageIndex = rowPageFor(row);
    const page = pagination.pageRows[pageIndex];
    if (page)
      return (
        pagePadding +
        pageIndex * paperStride.height +
        margin.top +
        (source.getBoundaryOffset(row)! - page.offset)
      );
    const offset = source.getBoundaryOffset(row);
    return offset === null ? null : offset + pagePadding;
  }
  function columnOffset(column: number): number | null {
    const pageIndex = columnPageFor(column);
    const page = pagination.pageColumns[pageIndex];
    return page
      ? pagePadding +
          pageIndex * paperStride.width +
          margin.left +
          (base.getColumnOffset(column) - page.offset)
      : base.getColumnOffset(column) + pagePadding;
  }
  function columnAtOffset(x: number): number | null {
    const pageIndex = Math.floor((x - pagePadding) / paperStride.width);
    const page = pagination.pageColumns[pageIndex];
    if (!page) return null;
    const local = x - pagePadding - pageIndex * paperStride.width - margin.left;
    if (local < 0 || local >= page.size) return null;
    const raw = page.offset + local;
    const column = base.getCellAtPoint({ x: raw, y: 0 })?.column ?? null;
    return column !== null && column >= page.start && column <= page.end ? column : null;
  }
  const rows: RowVisibilityIndex = {
    ...source,
    rowCount: layoutRowCount,
    visibleRowCount: layoutVisibleRowCount,
    isRowVisible(row) {
      return row >= 0 && row < layoutRowCount && source.isRowVisible(row);
    },
    getVisibleIndex(row) {
      return row >= 0 && row < layoutRowCount ? source.getVisibleIndex(row) : null;
    },
    getLogicalRow(index) {
      const row = source.getLogicalRow(index);
      return row !== null && row < layoutRowCount ? row : null;
    },
    getVisibleRow(row) {
      if (row < 0 || row >= layoutRowCount) return null;
      const visible = source.getVisibleRow(row);
      const offset = rowOffset(row);
      return visible && offset !== null ? { ...visible, offset } : null;
    },
    getRowOffset(row) {
      return row >= 0 && row < layoutRowCount ? rowOffset(row) : null;
    },
    getVisibleOffset(index) {
      const row = source.getLogicalRow(index);
      return row === null || row >= layoutRowCount ? null : rowOffset(row);
    },
    getBoundaryOffset(row) {
      if (row === layoutRowCount) return totalHeight;
      if (row < 0 || row > layoutRowCount) return null;
      const pageIndex = rowPageFor(row);
      const page = pagination.pageRows[pageIndex];
      if (page)
        return (
          pagePadding +
          pageIndex * paperStride.height +
          margin.top +
          (source.getBoundaryOffset(row)! - page.offset)
        );
      const offset = source.getBoundaryOffset(row);
      return offset === null ? null : offset + pagePadding;
    },
    getLogicalRowAtOffset(offset) {
      const pageIndex = Math.floor((offset - pagePadding) / paperStride.height);
      const page = pagination.pageRows[pageIndex];
      if (!page) return null;
      const local = offset - pagePadding - pageIndex * paperStride.height - margin.top;
      if (local < 0 || local >= page.size) return null;
      const row = source.getLogicalRowAtOffset(page.offset + local);
      return row !== null && row >= page.start && row <= page.end ? row : null;
    },
    getNextVisibleRow(row) {
      const next = source.getNextVisibleRow(row);
      return next !== null && next < layoutRowCount ? next : null;
    },
    getPreviousVisibleRow(row) {
      const previous = source.getPreviousVisibleRow(row);
      return previous !== null && previous < layoutRowCount ? previous : null;
    },
    getVisibleRowsInViewport(offset, height, overscan = 0) {
      const result: VisibleRow[] = [];
      const first = clamp(
        Math.floor((offset - pagePadding) / paperStride.height),
        0,
        pagination.pageRows.length - 1,
      );
      const last = clamp(
        Math.floor((offset + Math.max(0, height) - pagePadding - 0.000001) / paperStride.height),
        0,
        pagination.pageRows.length - 1,
      );
      for (let pageIndex = first; pageIndex <= last; pageIndex += 1) {
        const page = pagination.pageRows[pageIndex]!;
        const pageTop = pagePadding + pageIndex * paperStride.height + margin.top;
        const localStart = Math.max(0, offset - pageTop);
        const localEnd = Math.min(page.size, offset + height - pageTop);
        if (localEnd <= localStart) continue;
        const candidates = source.getVisibleRowsInViewport(
          page.offset + localStart,
          localEnd - localStart,
          overscan,
        );
        for (const row of candidates) {
          const projected = rowOffset(row.logicalRow);
          if (
            projected !== null &&
            row.logicalRow >= page.start &&
            row.logicalRow <= page.end &&
            projected + row.height > offset &&
            projected < offset + height
          )
            result.push({ ...row, offset: projected });
        }
      }
      return result;
    },
    getTotalHeight: () => totalHeight,
  };
  const projected: SheetGeometry = {
    ...base,
    rowCount: layoutRowCount,
    columnCount: layoutColumnCount,
    getRowOffset(row) {
      const value = rowOffset(row);
      if (value === null) throw new RangeError("Row is outside page layout print range.");
      return value;
    },
    getColumnOffset(column) {
      const value = columnOffset(column);
      if (value === null) throw new RangeError("Column is outside page layout print range.");
      return value;
    },
    getTotalSize: () => ({
      width: totalWidth,
      height: totalHeight,
    }),
    getCellRect(address) {
      const x = columnOffset(address.column);
      const y = rowOffset(address.row);
      if (x === null || y === null) throw new RangeError("Cell address is outside the grid.");
      return {
        x,
        y,
        width: base.getColumnWidth(address.column),
        height: source.getVisibleRow(address.row)?.height ?? 0,
      };
    },
    getCellViewportRect(address, scroll) {
      const rect = this.getCellRect(address);
      return { ...rect, x: rect.x - scroll.x, y: rect.y - scroll.y };
    },
    getCellAtPoint(point) {
      const column = columnAtOffset(point.x);
      const row = rows.getLogicalRowAtOffset(point.y);
      return column === null || row === null ? null : { row, column };
    },
    getVisibleRange(scroll, viewport): VisibleCellRange {
      // The viewport can begin in the view-only paper padding or a page gap.
      // Derive its page window from the axes rather than paper intersections so
      // header and grid item enumeration still reaches every horizontal page.
      const firstRow = clamp(
        Math.floor((scroll.y - pagePadding) / paperStride.height),
        0,
        pagination.pageRows.length - 1,
      );
      const lastRow = clamp(
        Math.floor(
          (scroll.y + Math.max(1, viewport.height) - pagePadding - 0.000001) / paperStride.height,
        ),
        0,
        pagination.pageRows.length - 1,
      );
      const firstColumn = clamp(
        Math.floor((scroll.x - pagePadding) / paperStride.width),
        0,
        pagination.pageColumns.length - 1,
      );
      const lastColumn = clamp(
        Math.floor(
          (scroll.x + Math.max(1, viewport.width) - pagePadding - 0.000001) / paperStride.width,
        ),
        0,
        pagination.pageColumns.length - 1,
      );
      const visible: SheetPage[] = [];
      for (let row = firstRow; row <= lastRow; row += 1)
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const page = getPage(row, column);
          if (page) visible.push(page);
        }
      const fallback = pagination.printRange;
      return {
        startRow: Math.min(...visible.map((page) => page.range.start.row), fallback.end.row),
        endRow: Math.max(...visible.map((page) => page.range.end.row), fallback.start.row),
        startColumn: Math.min(
          ...visible.map((page) => page.range.start.column),
          fallback.end.column,
        ),
        endColumn: Math.max(...visible.map((page) => page.range.end.column), fallback.start.column),
      };
    },
    getScrollPositionForCell(address, _scroll, viewport) {
      const rect = this.getCellRect(address);
      return {
        x: clamp(rect.x, 0, Math.max(0, this.getTotalSize().width - viewport.width)),
        y: clamp(rect.y, 0, Math.max(0, this.getTotalSize().height - viewport.height)),
      };
    },
  };
  return { geometry: projected, rows, columnAtOffset, getPage, getVisiblePages };
}

export function createPageLayoutViewportLayout(options: {
  geometry: SheetGeometry;
  rows: RowVisibilityIndex;
  pagination: SheetPagination;
  viewportSize: Size;
  bodyScrollPosition?: Point;
  mergeResolver?: MergeResolver;
  overscan?: number;
  showWhiteSpace?: boolean;
  pagePadding?: number;
}): SheetViewportLayout {
  const projection = createPageLayoutProjection(options);
  const base = createSheetViewportLayout({
    geometry: projection.geometry,
    rows: projection.rows,
    getColumnAtOffset: projection.columnAtOffset,
    viewportSize: options.viewportSize,
    bodyScrollPosition: options.bodyScrollPosition,
    mergeResolver: options.mergeResolver,
    overscan: options.overscan,
    freeze: { rows: 0, columns: 0 },
  });
  function pageFragments(range: CellRange): SheetViewportPaneRangeRect[] {
    const result: SheetViewportPaneRangeRect[] = [];
    const visible = projection.getVisiblePages({
      x: base.bodyScrollPosition.x,
      y: base.bodyScrollPosition.y,
      width: base.viewportSize.width,
      height: base.viewportSize.height,
    });
    for (const page of visible) {
      if (
        page.range.end.row < range.start.row ||
        page.range.start.row > range.end.row ||
        page.range.end.column < range.start.column ||
        page.range.start.column > range.end.column
      )
        continue;
      const fragment: CellRange = {
        start: {
          row: Math.max(range.start.row, page.range.start.row),
          column: Math.max(range.start.column, page.range.start.column),
        },
        end: {
          row: Math.min(range.end.row, page.range.end.row),
          column: Math.min(range.end.column, page.range.end.column),
        },
      };
      if (fragment.start.row <= fragment.end.row && fragment.start.column <= fragment.end.column)
        result.push(...base.getRangePaneRects(fragment));
    }
    return result;
  }
  return {
    ...base,
    getRangePaneRects: pageFragments,
    getRangeFragments: (range) =>
      pageFragments(range).map(
        ({ paneId, clippedRect }) => ({ paneId, rect: clippedRect }) as SheetViewportRangeFragment,
      ),
  };
}
