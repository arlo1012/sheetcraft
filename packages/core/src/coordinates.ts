import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type CellAddress } from "./workbook.js";

const CELL_ADDRESS_PATTERN = /^\$?([A-Za-z]+)\$?([1-9]\d*)$/;

export function columnIndexToLabel(column: number): string {
  if (!Number.isInteger(column) || column < 0) {
    throw new RangeError("Column index must be a non-negative integer.");
  }

  let value = column + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export function columnLabelToIndex(label: string): number | null {
  let column = 0;

  for (const character of label.toUpperCase()) {
    const digit = character.charCodeAt(0) - 64;
    if (digit < 1 || digit > 26) {
      return null;
    }
    column = column * 26 + digit;
    if (column > MAX_SHEET_COLUMNS) {
      return null;
    }
  }

  return column - 1;
}

export function formatCellAddress(address: CellAddress): string {
  return `${columnIndexToLabel(address.column)}${address.row + 1}`;
}

export const getCellAddressLabel = formatCellAddress;

export function parseCellAddress(input: string): CellAddress | null {
  const match = CELL_ADDRESS_PATTERN.exec(input.trim());
  if (!match) {
    return null;
  }

  const columnLabel = match[1];
  const rowLabel = match[2];
  if (!columnLabel || !rowLabel) {
    return null;
  }

  const column = columnLabelToIndex(columnLabel);
  const row = Number(rowLabel) - 1;
  if (column === null || !Number.isSafeInteger(row) || row < 0 || row >= MAX_SHEET_ROWS) {
    return null;
  }

  return { row, column };
}
