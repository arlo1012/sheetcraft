import { cloneCellStyle, type CellStyle } from "../style.js";
import {
  isCellAddressInBounds,
  type CellAddress,
  type CellRange,
  type SheetSparseState,
  type Workbook,
} from "../workbook.js";

export function assertCellAddress(address: CellAddress): void {
  if (!isCellAddressInBounds(address)) {
    throw new RangeError(`Cell address ${address.row}:${address.column} is outside the sheet.`);
  }
}

export function normalizeRange(range: CellRange): CellRange {
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

export function assertCellRange(range: CellRange): void {
  assertCellAddress(range.start);
  assertCellAddress(range.end);
}

export function getSheetOrThrow(workbook: Workbook, sheetId: string) {
  const sheet = workbook.sheets.get(sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${sheetId} does not exist.`);
  }
  return sheet;
}

export function parseCellKey(key: string): CellAddress {
  const separator = key.indexOf(":");
  return {
    row: Number(key.slice(0, separator)),
    column: Number(key.slice(separator + 1)),
  };
}

export function cloneSparseState(state: SheetSparseState): SheetSparseState {
  return {
    cells: state.cells.map((cell) => ({
      address: { ...cell.address },
      ...(cell.value === undefined ? {} : { value: cell.value }),
      ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
    })),
    rowHeights: state.rowHeights.map((dimension) => ({ ...dimension })),
    columnWidths: state.columnWidths.map((dimension) => ({ ...dimension })),
  };
}

export function cloneStyle(style: CellStyle | null | undefined): CellStyle | null {
  return cloneCellStyle(style ?? undefined) ?? null;
}
