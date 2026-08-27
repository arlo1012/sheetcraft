import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type CellAddress } from "../workbook/workbook";
import { columnIndexToLabel } from "./geometry";

const CELL_ADDRESS_PATTERN = /^\$?([A-Za-z]+)\$?([1-9]\d*)$/;

function columnLabelToIndex(label: string): number | null {
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
