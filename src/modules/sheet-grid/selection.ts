import type { CellAddress, CellRange } from "../workbook/workbook";

export type CellSelection = {
  active: CellAddress;
  anchor: CellAddress;
  focus: CellAddress;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function moveCellAddress(
  address: CellAddress,
  delta: { rows?: number; columns?: number },
  bounds: { rowCount: number; columnCount: number },
): CellAddress {
  return {
    row: clamp(address.row + (delta.rows ?? 0), 0, bounds.rowCount - 1),
    column: clamp(address.column + (delta.columns ?? 0), 0, bounds.columnCount - 1),
  };
}

export function areCellAddressesEqual(left: CellAddress, right: CellAddress): boolean {
  return left.row === right.row && left.column === right.column;
}

export function createCellSelection(address: CellAddress): CellSelection {
  return {
    active: { ...address },
    anchor: { ...address },
    focus: { ...address },
  };
}

export function normalizeCellRange(start: CellAddress, end: CellAddress): CellRange {
  return {
    start: {
      row: Math.min(start.row, end.row),
      column: Math.min(start.column, end.column),
    },
    end: {
      row: Math.max(start.row, end.row),
      column: Math.max(start.column, end.column),
    },
  };
}

export function getSelectionRange(selection: CellSelection): CellRange {
  return normalizeCellRange(selection.anchor, selection.focus);
}

export function isCellInRange(address: CellAddress, range: CellRange): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}

export function isSingleCellSelection(selection: CellSelection): boolean {
  return areCellAddressesEqual(selection.anchor, selection.focus);
}

export function extendCellSelection(selection: CellSelection, focus: CellAddress): CellSelection {
  return {
    active: { ...selection.active },
    anchor: { ...selection.anchor },
    focus: { ...focus },
  };
}

export function moveCellSelection(
  selection: CellSelection,
  delta: { rows?: number; columns?: number },
  bounds: { rowCount: number; columnCount: number },
  extend: boolean,
): CellSelection {
  if (extend) {
    return extendCellSelection(selection, moveCellAddress(selection.focus, delta, bounds));
  }

  return createCellSelection(moveCellAddress(selection.active, delta, bounds));
}

export function moveActiveCellWithinSelection(
  selection: CellSelection,
  direction: "forward-row" | "backward-row" | "forward-column" | "backward-column",
): CellSelection {
  const range = getSelectionRange(selection);
  const rowCount = range.end.row - range.start.row + 1;
  const columnCount = range.end.column - range.start.column + 1;
  const rowOffset = selection.active.row - range.start.row;
  const columnOffset = selection.active.column - range.start.column;
  const isRowOrder = direction === "forward-row" || direction === "backward-row";
  const length = rowCount * columnCount;
  const currentIndex = isRowOrder
    ? rowOffset * columnCount + columnOffset
    : columnOffset * rowCount + rowOffset;
  const step = direction === "forward-row" || direction === "forward-column" ? 1 : -1;
  const nextIndex = (currentIndex + step + length) % length;
  const nextAddress = isRowOrder
    ? {
        row: range.start.row + Math.floor(nextIndex / columnCount),
        column: range.start.column + (nextIndex % columnCount),
      }
    : {
        row: range.start.row + (nextIndex % rowCount),
        column: range.start.column + Math.floor(nextIndex / rowCount),
      };

  return { ...selection, active: nextAddress };
}

function getAxisAutoScrollDelta(position: number, start: number, end: number): number {
  const edgeSize = Math.min(40, Math.max(16, (end - start) / 4));
  const maximumDelta = 24;
  if (position < start + edgeSize) {
    return -Math.ceil(Math.min(1, (start + edgeSize - position) / edgeSize) * maximumDelta);
  }
  if (position > end - edgeSize) {
    return Math.ceil(Math.min(1, (position - (end - edgeSize)) / edgeSize) * maximumDelta);
  }
  return 0;
}

export function getSelectionAutoScrollDelta(
  pointer: { x: number; y: number },
  viewport: { left: number; top: number; right: number; bottom: number },
): { x: number; y: number } {
  return {
    x: getAxisAutoScrollDelta(pointer.x, viewport.left, viewport.right),
    y: getAxisAutoScrollDelta(pointer.y, viewport.top, viewport.bottom),
  };
}
