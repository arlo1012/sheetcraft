import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
} from "../workbook/workbook";

export type SelectionMode = "cells" | "rows" | "columns" | "all";

export type CellSelection = {
  active: CellAddress;
  anchor: CellAddress;
  focus: CellAddress;
  mode: SelectionMode;
};

export type SelectionBounds = {
  rowCount: number;
  columnCount: number;
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
    mode: "cells",
  };
}

export function getSelectionMode(selection: CellSelection): SelectionMode {
  return selection.mode;
}

export function createAxisSelection(
  mode: Exclude<SelectionMode, "cells">,
  address: CellAddress,
): CellSelection {
  return {
    active: { ...address },
    anchor: { ...address },
    focus: { ...address },
    mode,
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

export function getSelectionRange(selection: CellSelection, bounds?: SelectionBounds): CellRange {
  const range = normalizeCellRange(selection.anchor, selection.focus);
  const rowEnd = (bounds?.rowCount ?? MAX_SHEET_ROWS) - 1;
  const columnEnd = (bounds?.columnCount ?? MAX_SHEET_COLUMNS) - 1;
  const mode = getSelectionMode(selection);
  if (mode === "rows") {
    return {
      start: { row: range.start.row, column: 0 },
      end: { row: range.end.row, column: columnEnd },
    };
  }
  if (mode === "columns") {
    return {
      start: { row: 0, column: range.start.column },
      end: { row: rowEnd, column: range.end.column },
    };
  }
  if (mode === "all") {
    return {
      start: { row: 0, column: 0 },
      end: { row: rowEnd, column: columnEnd },
    };
  }
  return range;
}

export function isCellSelected(address: CellAddress, selection: CellSelection): boolean {
  const range = normalizeCellRange(selection.anchor, selection.focus);
  const mode = getSelectionMode(selection);
  if (mode === "all") {
    return true;
  }
  if (mode === "rows") {
    return address.row >= range.start.row && address.row <= range.end.row;
  }
  if (mode === "columns") {
    return address.column >= range.start.column && address.column <= range.end.column;
  }
  return isCellInRange(address, range);
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
  return (
    getSelectionMode(selection) === "cells" &&
    areCellAddressesEqual(selection.anchor, selection.focus)
  );
}

export function extendCellSelection(selection: CellSelection, focus: CellAddress): CellSelection {
  return {
    active: { ...selection.active },
    anchor: { ...selection.anchor },
    focus: { ...focus },
    mode: "cells",
  };
}

export function extendAxisSelection(
  selection: CellSelection,
  mode: Exclude<SelectionMode, "cells">,
  address: CellAddress,
): CellSelection {
  if (getSelectionMode(selection) !== mode) {
    return createAxisSelection(mode, address);
  }
  return {
    active: { ...selection.active },
    anchor: { ...selection.anchor },
    focus: { ...address },
    mode,
  };
}

export function moveCellSelection(
  selection: CellSelection,
  delta: { rows?: number; columns?: number },
  bounds: { rowCount: number; columnCount: number },
  extend: boolean,
): CellSelection {
  if (getSelectionMode(selection) !== "cells") {
    return createCellSelection(moveCellAddress(selection.active, delta, bounds));
  }
  if (extend) {
    return extendCellSelection(selection, moveCellAddress(selection.focus, delta, bounds));
  }

  return createCellSelection(moveCellAddress(selection.active, delta, bounds));
}

export function moveActiveCellWithinSelection(
  selection: CellSelection,
  direction: "forward-row" | "backward-row" | "forward-column" | "backward-column",
): CellSelection {
  if (getSelectionMode(selection) !== "cells") {
    return createCellSelection(selection.active);
  }
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
