import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, isSheetAddressInBounds } from "./sheet-limits.js";
import type { CellAddress, CellRange, SheetDimensionAxis } from "./workbook.js";

export type MergedCellRange = CellRange;

function cloneRange(range: CellRange): MergedCellRange {
  return {
    start: { ...range.start },
    end: { ...range.end },
  };
}

function assertCellRange(range: CellRange): void {
  if (!range || typeof range !== "object" || !range.start || !range.end) {
    throw new TypeError("A merged cell range must contain start and end addresses.");
  }
  if (!isSheetAddressInBounds(range.start) || !isSheetAddressInBounds(range.end)) {
    throw new RangeError("A merged cell range must be inside the sheet.");
  }
}

function compareRanges(left: MergedCellRange, right: MergedCellRange): number {
  return (
    left.start.row - right.start.row ||
    left.start.column - right.start.column ||
    left.end.row - right.end.row ||
    left.end.column - right.end.column
  );
}

function getAxisMaximum(axis: SheetDimensionAxis): number {
  if (axis === "row") return MAX_SHEET_ROWS;
  if (axis === "column") return MAX_SHEET_COLUMNS;
  throw new TypeError("Merged cell axis must be row or column.");
}

function assertAxisChange(axis: SheetDimensionAxis, index: number, count: number): number {
  const maximum = getAxisMaximum(axis);
  if (!Number.isInteger(index) || index < 0 || index >= maximum) {
    throw new RangeError("Merged cell axis index is outside the sheet.");
  }
  if (!Number.isInteger(count) || count <= 0 || count > maximum - index) {
    throw new RangeError("Merged cell axis count is outside the sheet.");
  }
  return maximum;
}

function getAxisStart(range: MergedCellRange, axis: SheetDimensionAxis): number {
  return axis === "row" ? range.start.row : range.start.column;
}

function getAxisEnd(range: MergedCellRange, axis: SheetDimensionAxis): number {
  return axis === "row" ? range.end.row : range.end.column;
}

function withAxisRange(
  range: MergedCellRange,
  axis: SheetDimensionAxis,
  start: number,
  end: number,
): MergedCellRange {
  return axis === "row"
    ? {
        start: { row: start, column: range.start.column },
        end: { row: end, column: range.end.column },
      }
    : { start: { row: range.start.row, column: start }, end: { row: range.end.row, column: end } };
}

export function normalizeMergedCellRange(range: CellRange): MergedCellRange {
  assertCellRange(range);
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

export function isSingleCellRange(range: CellRange): boolean {
  const normalized = normalizeMergedCellRange(range);
  return (
    normalized.start.row === normalized.end.row && normalized.start.column === normalized.end.column
  );
}

export function isCellAddressInMergedCellRange(address: CellAddress, range: CellRange): boolean {
  const normalized = normalizeMergedCellRange(range);
  return (
    address.row >= normalized.start.row &&
    address.row <= normalized.end.row &&
    address.column >= normalized.start.column &&
    address.column <= normalized.end.column
  );
}

export function doesMergedCellRangeContainRange(
  container: CellRange,
  contained: CellRange,
): boolean {
  const normalizedContainer = normalizeMergedCellRange(container);
  const normalizedContained = normalizeMergedCellRange(contained);
  return (
    normalizedContainer.start.row <= normalizedContained.start.row &&
    normalizedContainer.end.row >= normalizedContained.end.row &&
    normalizedContainer.start.column <= normalizedContained.start.column &&
    normalizedContainer.end.column >= normalizedContained.end.column
  );
}

export function doMergedCellRangesIntersect(left: CellRange, right: CellRange): boolean {
  const normalizedLeft = normalizeMergedCellRange(left);
  const normalizedRight = normalizeMergedCellRange(right);
  return !(
    normalizedLeft.end.row < normalizedRight.start.row ||
    normalizedRight.end.row < normalizedLeft.start.row ||
    normalizedLeft.end.column < normalizedRight.start.column ||
    normalizedRight.end.column < normalizedLeft.start.column
  );
}

export function validateMergedCellRanges(ranges: readonly CellRange[]): MergedCellRange[] {
  const normalized = ranges.map(normalizeMergedCellRange).sort(compareRanges);
  const expirationOrder = [...normalized].sort(
    (left, right) =>
      left.end.row - right.end.row ||
      left.start.column - right.start.column ||
      left.end.column - right.end.column,
  );
  let active: MergeIntervalNode | undefined;
  let expirationIndex = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const range = normalized[index];
    if (!range) continue;
    if (isSingleCellRange(range)) {
      throw new RangeError("A merged cell range must contain more than one cell.");
    }
    while (
      (expirationOrder[expirationIndex]?.end.row ?? Number.POSITIVE_INFINITY) < range.start.row
    ) {
      const expired = expirationOrder[expirationIndex];
      if (expired) active = removeMergeInterval(active, expired);
      expirationIndex += 1;
    }
    if (findOverlappingMergeInterval(active, range.start.column, range.end.column)) {
      throw new RangeError("Merged cell ranges must not overlap.");
    }
    active = insertMergeInterval(active, range);
  }
  return normalized.map(cloneRange);
}

/**
 * A row sweep keeps only ranges whose inclusive row spans overlap the current
 * range. The active intervals are indexed by their column spans, so validation
 * stays O(n log n) for plans such as one merge per selected row.
 */
type MergeIntervalNode = {
  range: MergedCellRange;
  priority: number;
  maxEndColumn: number;
  left?: MergeIntervalNode;
  right?: MergeIntervalNode;
};

function compareMergeIntervalKeys(left: MergedCellRange, right: MergedCellRange): number {
  return (
    left.start.column - right.start.column ||
    left.end.column - right.end.column ||
    left.start.row - right.start.row ||
    left.end.row - right.end.row
  );
}

function mergeIntervalPriority(range: MergedCellRange): number {
  let value =
    Math.imul(range.start.row + 1, 0x9e3779b1) ^
    Math.imul(range.start.column + 1, 0x85ebca6b) ^
    Math.imul(range.end.row + 1, 0xc2b2ae35) ^
    Math.imul(range.end.column + 1, 0x27d4eb2f);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function refreshMergeInterval(node: MergeIntervalNode): MergeIntervalNode {
  node.maxEndColumn = Math.max(
    node.range.end.column,
    node.left?.maxEndColumn ?? Number.NEGATIVE_INFINITY,
    node.right?.maxEndColumn ?? Number.NEGATIVE_INFINITY,
  );
  return node;
}

function rotateMergeIntervalLeft(node: MergeIntervalNode): MergeIntervalNode {
  const pivot = node.right;
  if (!pivot) return node;
  node.right = pivot.left;
  pivot.left = refreshMergeInterval(node);
  return refreshMergeInterval(pivot);
}

function rotateMergeIntervalRight(node: MergeIntervalNode): MergeIntervalNode {
  const pivot = node.left;
  if (!pivot) return node;
  node.left = pivot.right;
  pivot.right = refreshMergeInterval(node);
  return refreshMergeInterval(pivot);
}

function insertMergeInterval(
  node: MergeIntervalNode | undefined,
  range: MergedCellRange,
): MergeIntervalNode {
  if (!node) {
    return {
      range,
      priority: mergeIntervalPriority(range),
      maxEndColumn: range.end.column,
    };
  }
  if (compareMergeIntervalKeys(range, node.range) < 0) {
    node.left = insertMergeInterval(node.left, range);
    if ((node.left?.priority ?? 0) > node.priority) return rotateMergeIntervalRight(node);
  } else {
    node.right = insertMergeInterval(node.right, range);
    if ((node.right?.priority ?? 0) > node.priority) return rotateMergeIntervalLeft(node);
  }
  return refreshMergeInterval(node);
}

function removeMergeInterval(
  node: MergeIntervalNode | undefined,
  range: MergedCellRange,
): MergeIntervalNode | undefined {
  if (!node) return undefined;
  const comparison = compareMergeIntervalKeys(range, node.range);
  if (comparison < 0) {
    node.left = removeMergeInterval(node.left, range);
    return refreshMergeInterval(node);
  }
  if (comparison > 0) {
    node.right = removeMergeInterval(node.right, range);
    return refreshMergeInterval(node);
  }
  if (!node.left) return node.right;
  if (!node.right) return node.left;
  if (node.left.priority > node.right.priority) {
    const root = rotateMergeIntervalRight(node);
    root.right = removeMergeInterval(root.right, range);
    return refreshMergeInterval(root);
  }
  const root = rotateMergeIntervalLeft(node);
  root.left = removeMergeInterval(root.left, range);
  return refreshMergeInterval(root);
}

function findOverlappingMergeInterval(
  node: MergeIntervalNode | undefined,
  startColumn: number,
  endColumn: number,
): MergedCellRange | undefined {
  if (!node || node.maxEndColumn < startColumn) return undefined;
  const left = findOverlappingMergeInterval(node.left, startColumn, endColumn);
  if (left) return left;
  if (node.range.start.column <= endColumn && node.range.end.column >= startColumn) {
    return node.range;
  }
  if (node.range.start.column > endColumn) return undefined;
  return findOverlappingMergeInterval(node.right, startColumn, endColumn);
}

export function getMergedCellRangeAtAddress(
  ranges: readonly CellRange[],
  address: CellAddress,
): MergedCellRange | undefined {
  for (const range of ranges) {
    if (isCellAddressInMergedCellRange(address, range)) {
      return normalizeMergedCellRange(range);
    }
  }
  return undefined;
}

export function getMergedCellAnchor(
  ranges: readonly CellRange[],
  address: CellAddress,
): CellAddress | undefined {
  const range = getMergedCellRangeAtAddress(ranges, address);
  return range ? { ...range.start } : undefined;
}

function rowSegmentKey(start: number, end: number): string {
  return `${start}:${end}`;
}

function addRangeToRowSegments(
  index: Map<string, MergedCellRange[]>,
  range: MergedCellRange,
  start = 0,
  end = MAX_SHEET_ROWS - 1,
): void {
  if (range.end.row < start || range.start.row > end) return;
  if (range.start.row <= start && range.end.row >= end) {
    const key = rowSegmentKey(start, end);
    const entries = index.get(key) ?? [];
    entries.push(range);
    index.set(key, entries);
    return;
  }
  const middle = Math.floor((start + end) / 2);
  addRangeToRowSegments(index, range, start, middle);
  addRangeToRowSegments(index, range, middle + 1, end);
}

function getRangeAtColumn(
  ranges: readonly MergedCellRange[] | undefined,
  column: number,
): MergedCellRange | undefined {
  if (!ranges) return undefined;
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((ranges[middle]?.start.column ?? 0) <= column) low = middle + 1;
    else high = middle;
  }
  const candidate = ranges[low - 1];
  return candidate && column <= candidate.end.column ? candidate : undefined;
}

/**
 * A read-only merge lookup index for render and hit-test paths. Construction
 * validates and clones its input; queries follow one row-segment path and run
 * a column binary search at each level, never scanning every merged range.
 */
export class MergedCellRangeResolver {
  private readonly rangesByRowSegment = new Map<string, MergedCellRange[]>();

  constructor(ranges: readonly CellRange[]) {
    for (const range of validateMergedCellRanges(ranges)) {
      addRangeToRowSegments(this.rangesByRowSegment, range);
    }
    for (const entries of this.rangesByRowSegment.values()) {
      entries.sort((left, right) => left.start.column - right.start.column);
    }
  }

  getRangeAtAddress(address: CellAddress): MergedCellRange | undefined {
    if (!isSheetAddressInBounds(address)) return undefined;
    let start = 0;
    let end = MAX_SHEET_ROWS - 1;
    while (start <= end) {
      const range = getRangeAtColumn(
        this.rangesByRowSegment.get(rowSegmentKey(start, end)),
        address.column,
      );
      if (range) return cloneRange(range);
      if (start === end) return undefined;
      const middle = Math.floor((start + end) / 2);
      if (address.row <= middle) end = middle;
      else start = middle + 1;
    }
    return undefined;
  }

  getAnchor(address: CellAddress): CellAddress | undefined {
    const range = this.getRangeAtAddress(address);
    return range ? { ...range.start } : undefined;
  }
}

export function expandSelectionToMergedCellRanges(
  selection: CellRange,
  ranges: readonly CellRange[],
): CellRange {
  let expanded = normalizeMergedCellRange(selection);
  let changed = true;

  while (changed) {
    changed = false;
    for (const range of ranges) {
      const normalized = normalizeMergedCellRange(range);
      if (!doMergedCellRangesIntersect(expanded, normalized)) continue;
      const next = normalizeMergedCellRange({
        start: {
          row: Math.min(expanded.start.row, normalized.start.row),
          column: Math.min(expanded.start.column, normalized.start.column),
        },
        end: {
          row: Math.max(expanded.end.row, normalized.end.row),
          column: Math.max(expanded.end.column, normalized.end.column),
        },
      });
      if (
        next.start.row !== expanded.start.row ||
        next.start.column !== expanded.start.column ||
        next.end.row !== expanded.end.row ||
        next.end.column !== expanded.end.column
      ) {
        expanded = next;
        changed = true;
      }
    }
  }

  return expanded;
}

export function transformMergedCellRangesForAxisInsert(
  ranges: readonly CellRange[],
  axis: SheetDimensionAxis,
  index: number,
  count = 1,
): MergedCellRange[] {
  const maximum = assertAxisChange(axis, index, count);
  return validateMergedCellRanges(ranges).flatMap((range) => {
    const start = getAxisStart(range, axis);
    const end = getAxisEnd(range, axis);
    if (index <= start) {
      const nextStart = start + count;
      if (nextStart >= maximum) return [];
      const transformed = withAxisRange(range, axis, nextStart, Math.min(maximum - 1, end + count));
      return isSingleCellRange(transformed) ? [] : [transformed];
    }
    const transformed =
      index <= end ? withAxisRange(range, axis, start, Math.min(maximum - 1, end + count)) : range;
    return isSingleCellRange(transformed) ? [] : [transformed];
  });
}

export function transformMergedCellRangesForAxisDelete(
  ranges: readonly CellRange[],
  axis: SheetDimensionAxis,
  index: number,
  count = 1,
): MergedCellRange[] {
  assertAxisChange(axis, index, count);
  const deletedEnd = index + count - 1;
  return validateMergedCellRanges(ranges).flatMap((range) => {
    const start = getAxisStart(range, axis);
    const end = getAxisEnd(range, axis);
    if (end < index) return [range];
    if (start > deletedEnd) return [withAxisRange(range, axis, start - count, end - count)];

    const nextStart = start < index ? start : index;
    const nextEnd = end > deletedEnd ? end - count : index - 1;
    if (nextEnd < nextStart) return [];
    const transformed = withAxisRange(range, axis, nextStart, nextEnd);
    return isSingleCellRange(transformed) ? [] : [transformed];
  });
}
