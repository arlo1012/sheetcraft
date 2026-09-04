import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  isCellAddressInBounds,
  type CellAddress,
  type CellRange,
  type SheetDimensionAxis,
} from "./workbook.js";

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
  if (!isCellAddressInBounds(range.start) || !isCellAddressInBounds(range.end)) {
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
  for (let index = 0; index < normalized.length; index += 1) {
    const range = normalized[index];
    if (!range) continue;
    if (isSingleCellRange(range)) {
      throw new RangeError("A merged cell range must contain more than one cell.");
    }
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = normalized[previousIndex];
      if (previous && doMergedCellRangesIntersect(previous, range)) {
        throw new RangeError("Merged cell ranges must not overlap.");
      }
    }
  }
  return normalized.map(cloneRange);
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
