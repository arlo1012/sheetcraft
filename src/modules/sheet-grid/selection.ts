import type { CellAddress } from "../workbook/workbook";

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
