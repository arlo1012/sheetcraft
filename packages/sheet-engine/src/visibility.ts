export type HiddenRowInterval = {
  start: number;
  end: number;
};

export type VisibleRow = {
  logicalRow: number;
  visibleIndex: number;
  offset: number;
  height: number;
};

export type RowVisibilityIndex = {
  readonly rowCount: number;
  readonly visibleRowCount: number;
  isRowVisible: (logicalRow: number) => boolean;
  getVisibleIndex: (logicalRow: number) => number | null;
  getLogicalRow: (visibleIndex: number) => number | null;
  getVisibleRow: (logicalRow: number) => VisibleRow | null;
  /**
   * Returns the physical offset immediately before a logical row boundary.
   * Hidden rows contribute no height, so this is defined even when the row at
   * the boundary is hidden.
   */
  getBoundaryOffset: (logicalRow: number) => number | null;
  getRowOffset: (logicalRow: number) => number | null;
  getVisibleOffset: (visibleIndex: number) => number | null;
  getLogicalRowAtOffset: (offset: number) => number | null;
  getNextVisibleRow: (logicalRow: number) => number | null;
  getPreviousVisibleRow: (logicalRow: number) => number | null;
  getVisibleRowsInViewport: (
    offset: number,
    viewportHeight: number,
    overscan?: number,
  ) => VisibleRow[];
  getTotalHeight: () => number;
};

type VisibleSegment = {
  start: number;
  end: number;
  visibleStart: number;
  offsetStart: number;
  height: number;
  overrideRows: number[];
  overrideSizes: number[];
  cumulativeDeltas: number[];
};

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertSafeHeight(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Total row height must be a non-negative safe integer.");
  }
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function isLogicalRow(logicalRow: number, rowCount: number): boolean {
  return Number.isSafeInteger(logicalRow) && logicalRow >= 0 && logicalRow < rowCount;
}

function normalizeHiddenIntervals(
  rowCount: number,
  hiddenRows: Iterable<number>,
  hiddenIntervals: Iterable<HiddenRowInterval>,
): HiddenRowInterval[] {
  const intervals: HiddenRowInterval[] = [];
  for (const row of hiddenRows) {
    assertNonNegativeInteger(row, "Hidden row");
    if (row < rowCount) intervals.push({ start: row, end: row });
  }
  for (const interval of hiddenIntervals) {
    assertNonNegativeInteger(interval.start, "Hidden interval start");
    assertNonNegativeInteger(interval.end, "Hidden interval end");
    const start = Math.min(interval.start, interval.end);
    const end = Math.min(rowCount - 1, Math.max(interval.start, interval.end));
    if (start <= end) intervals.push({ start, end });
  }
  intervals.sort((left, right) => left.start - right.start || left.end - right.end);

  const normalized: HiddenRowInterval[] = [];
  for (const interval of intervals) {
    const previous = normalized.at(-1);
    if (previous && interval.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      normalized.push({ ...interval });
    }
  }
  return normalized;
}

function findSegmentByLogicalRow(
  segments: readonly VisibleSegment[],
  logicalRow: number,
): VisibleSegment | undefined {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const segment = segments[middle]!;
    if (logicalRow < segment.start) high = middle - 1;
    else if (logicalRow > segment.end) low = middle + 1;
    else return segment;
  }
  return undefined;
}

function findSegmentByVisibleIndex(
  segments: readonly VisibleSegment[],
  visibleIndex: number,
): VisibleSegment | undefined {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const segment = segments[middle]!;
    const end = segment.visibleStart + segment.end - segment.start;
    if (visibleIndex < segment.visibleStart) high = middle - 1;
    else if (visibleIndex > end) low = middle + 1;
    else return segment;
  }
  return undefined;
}

function findSegmentByOffset(
  segments: readonly VisibleSegment[],
  offset: number,
): VisibleSegment | undefined {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const segment = segments[middle]!;
    if (offset < segment.offsetStart) high = middle - 1;
    else if (offset >= segment.offsetStart + segment.height) low = middle + 1;
    else return segment;
  }
  return undefined;
}

function getDeltaBefore(segment: VisibleSegment, logicalRow: number): number {
  const position = lowerBound(segment.overrideRows, logicalRow) - 1;
  return position >= 0 ? segment.cumulativeDeltas[position]! : 0;
}

function getRowOffsetInSegment(
  segment: VisibleSegment,
  logicalRow: number,
  defaultRowHeight: number,
): number {
  return (
    segment.offsetStart +
    (logicalRow - segment.start) * defaultRowHeight +
    getDeltaBefore(segment, logicalRow)
  );
}

function getRowHeightInSegment(
  segment: VisibleSegment,
  logicalRow: number,
  defaultRowHeight: number,
): number {
  const position = lowerBound(segment.overrideRows, logicalRow);
  return segment.overrideRows[position] === logicalRow
    ? segment.overrideSizes[position]!
    : defaultRowHeight;
}

export function createRowVisibilityIndex(options: {
  rowCount: number;
  defaultRowHeight: number;
  rowHeights?: ReadonlyMap<number, number>;
  hiddenRows?: Iterable<number>;
  hiddenIntervals?: Iterable<HiddenRowInterval>;
}): RowVisibilityIndex {
  const rowCount = options.rowCount;
  const defaultRowHeight = options.defaultRowHeight;
  assertNonNegativeInteger(rowCount, "Row count");
  assertPositiveInteger(defaultRowHeight, "Default row height");

  const hiddenIntervals = normalizeHiddenIntervals(
    rowCount,
    options.hiddenRows ?? [],
    options.hiddenIntervals ?? [],
  );
  const segments: VisibleSegment[] = [];
  let start = 0;
  for (const hidden of hiddenIntervals) {
    if (start < hidden.start) {
      segments.push({
        start,
        end: hidden.start - 1,
        visibleStart: 0,
        offsetStart: 0,
        height: 0,
        overrideRows: [],
        overrideSizes: [],
        cumulativeDeltas: [],
      });
    }
    start = hidden.end + 1;
  }
  if (start < rowCount) {
    segments.push({
      start,
      end: rowCount - 1,
      visibleStart: 0,
      offsetStart: 0,
      height: 0,
      overrideRows: [],
      overrideSizes: [],
      cumulativeDeltas: [],
    });
  }

  const overrides = [...(options.rowHeights ?? new Map())]
    .map(([row, height]) => {
      assertNonNegativeInteger(row, "Row height index");
      assertPositiveInteger(height, "Row height");
      return { row, height };
    })
    .filter(({ row, height }) => row < rowCount && height !== defaultRowHeight)
    .sort((left, right) => left.row - right.row);
  let overrideIndex = 0;
  let visibleRowCount = 0;
  let totalHeight = 0;
  for (const segment of segments) {
    while (overrideIndex < overrides.length && overrides[overrideIndex]!.row < segment.start) {
      overrideIndex += 1;
    }
    let cumulativeDelta = 0;
    while (overrideIndex < overrides.length && overrides[overrideIndex]!.row <= segment.end) {
      const override = overrides[overrideIndex]!;
      segment.overrideRows.push(override.row);
      segment.overrideSizes.push(override.height);
      cumulativeDelta += override.height - defaultRowHeight;
      segment.cumulativeDeltas.push(cumulativeDelta);
      overrideIndex += 1;
    }
    const rowSpan = segment.end - segment.start + 1;
    segment.visibleStart = visibleRowCount;
    segment.offsetStart = totalHeight;
    segment.height = rowSpan * defaultRowHeight + cumulativeDelta;
    assertSafeHeight(segment.height);
    visibleRowCount += rowSpan;
    totalHeight += segment.height;
    assertSafeHeight(totalHeight);
  }
  const segmentStarts = segments.map((segment) => segment.start);

  function getVisibleRow(logicalRow: number): VisibleRow | null {
    if (!isLogicalRow(logicalRow, rowCount)) return null;
    const segment = findSegmentByLogicalRow(segments, logicalRow);
    if (!segment) return null;
    return {
      logicalRow,
      visibleIndex: segment.visibleStart + logicalRow - segment.start,
      offset: getRowOffsetInSegment(segment, logicalRow, defaultRowHeight),
      height: getRowHeightInSegment(segment, logicalRow, defaultRowHeight),
    };
  }

  function getLogicalRow(visibleIndex: number): number | null {
    if (
      !Number.isSafeInteger(visibleIndex) ||
      visibleIndex < 0 ||
      visibleIndex >= visibleRowCount
    ) {
      return null;
    }
    const segment = findSegmentByVisibleIndex(segments, visibleIndex);
    return segment ? segment.start + visibleIndex - segment.visibleStart : null;
  }

  function getLogicalRowAtOffset(offset: number): number | null {
    if (!Number.isFinite(offset) || offset < 0 || offset >= totalHeight) return null;
    const segment = findSegmentByOffset(segments, offset);
    if (!segment) return null;
    let low = segment.start;
    let high = segment.end;
    while (low <= high) {
      const logicalRow = low + Math.floor((high - low) / 2);
      const rowOffset = getRowOffsetInSegment(segment, logicalRow, defaultRowHeight);
      const rowEnd = rowOffset + getRowHeightInSegment(segment, logicalRow, defaultRowHeight);
      if (offset < rowOffset) high = logicalRow - 1;
      else if (offset >= rowEnd) low = logicalRow + 1;
      else return logicalRow;
    }
    return null;
  }

  function getBoundaryOffset(logicalRow: number): number | null {
    if (!Number.isSafeInteger(logicalRow) || logicalRow < 0 || logicalRow > rowCount) {
      return null;
    }
    if (logicalRow === 0) return 0;
    if (logicalRow === rowCount) return totalHeight;

    const containingSegment = findSegmentByLogicalRow(segments, logicalRow);
    if (containingSegment) {
      return getRowOffsetInSegment(containingSegment, logicalRow, defaultRowHeight);
    }

    const insertion = lowerBound(segmentStarts, logicalRow);
    const previous = insertion > 0 ? segments[insertion - 1] : undefined;
    return previous ? previous.offsetStart + previous.height : 0;
  }

  function getNextVisibleRow(logicalRow: number): number | null {
    if (!isLogicalRow(logicalRow, rowCount)) return null;
    const next = findSegmentByLogicalRow(segments, logicalRow + 1);
    if (next) return logicalRow + 1;
    const insertion = lowerBound(segmentStarts, logicalRow + 1);
    return segments[insertion]?.start ?? null;
  }

  function getPreviousVisibleRow(logicalRow: number): number | null {
    if (!isLogicalRow(logicalRow, rowCount)) return null;
    const previous = findSegmentByLogicalRow(segments, logicalRow - 1);
    if (previous) return logicalRow - 1;
    const insertion = lowerBound(segmentStarts, logicalRow);
    return insertion > 0 ? segments[insertion - 1]!.end : null;
  }

  return {
    rowCount,
    visibleRowCount,
    isRowVisible(logicalRow) {
      return getVisibleRow(logicalRow) !== null;
    },
    getVisibleIndex(logicalRow) {
      return getVisibleRow(logicalRow)?.visibleIndex ?? null;
    },
    getLogicalRow,
    getVisibleRow,
    getBoundaryOffset,
    getRowOffset(logicalRow) {
      return getVisibleRow(logicalRow)?.offset ?? null;
    },
    getVisibleOffset(visibleIndex) {
      const logicalRow = getLogicalRow(visibleIndex);
      return logicalRow === null ? null : (getVisibleRow(logicalRow)?.offset ?? null);
    },
    getLogicalRowAtOffset,
    getNextVisibleRow,
    getPreviousVisibleRow,
    getVisibleRowsInViewport(offset, viewportHeight, overscan = 0) {
      if (
        !Number.isFinite(offset) ||
        !Number.isFinite(viewportHeight) ||
        viewportHeight <= 0 ||
        totalHeight === 0
      ) {
        return [];
      }
      const startOffset = Math.max(0, offset);
      if (startOffset >= totalHeight) return [];
      const startRow = getLogicalRowAtOffset(startOffset);
      const endOffset = Math.min(totalHeight, startOffset + viewportHeight);
      const rowAtEndOffset = getLogicalRowAtOffset(endOffset);
      const endRow =
        rowAtEndOffset === null
          ? getLogicalRow(visibleRowCount - 1)
          : getVisibleRow(rowAtEndOffset)?.offset === endOffset
            ? getPreviousVisibleRow(rowAtEndOffset)
            : rowAtEndOffset;
      if (startRow === null || endRow === null) return [];
      const startIndex = getVisibleRow(startRow)?.visibleIndex ?? null;
      const endIndex = getVisibleRow(endRow)?.visibleIndex ?? null;
      if (startIndex === null || endIndex === null) return [];
      const normalizedOverscan = Number.isFinite(overscan) ? Math.max(0, Math.floor(overscan)) : 0;
      const rows: VisibleRow[] = [];
      const first = Math.max(0, startIndex - normalizedOverscan);
      const last = Math.min(visibleRowCount - 1, endIndex + normalizedOverscan);
      for (let visibleIndex = first; visibleIndex <= last; visibleIndex += 1) {
        const logicalRow = getLogicalRow(visibleIndex);
        if (logicalRow === null) continue;
        const row = getVisibleRow(logicalRow);
        if (row) rows.push(row);
      }
      return rows;
    },
    getTotalHeight: () => totalHeight,
  };
}
