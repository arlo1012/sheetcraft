import type { CellAddress, CellRange, Sheet } from "./workbook.js";
import {
  assertCellAddress,
  assertCellRange,
  normalizeRange,
  parseCellKey,
} from "./commands/helpers.js";

function occupiedAddresses(sheet: Sheet): CellAddress[] {
  return [...sheet.cells].flatMap(([key, cell]) => (cell.content ? [parseCellKey(key)] : []));
}

function hasContentInRow(
  addresses: readonly CellAddress[],
  row: number,
  left: number,
  right: number,
): boolean {
  return addresses.some(
    (address) => address.row === row && address.column >= left && address.column <= right,
  );
}

function hasContentInColumn(
  addresses: readonly CellAddress[],
  column: number,
  top: number,
  bottom: number,
): boolean {
  return addresses.some(
    (address) => address.column === column && address.row >= top && address.row <= bottom,
  );
}

/**
 * Resolves an Excel-style current region.  A blank row or column forms a
 * boundary; sparse cells within the resulting rectangle remain part of it.
 */
export function resolveContiguousDataRange(sheet: Sheet, anchor: CellAddress): CellRange {
  assertCellAddress(anchor);
  const addresses = occupiedAddresses(sheet);
  if (!addresses.some((address) => address.row === anchor.row && address.column === anchor.column))
    return { start: { ...anchor }, end: { ...anchor } };

  let top = anchor.row;
  let bottom = anchor.row;
  let left = anchor.column;
  let right = anchor.column;
  let changed = true;
  while (changed) {
    changed = false;
    while (hasContentInRow(addresses, top - 1, left, right)) {
      top -= 1;
      changed = true;
    }
    while (hasContentInRow(addresses, bottom + 1, left, right)) {
      bottom += 1;
      changed = true;
    }
    while (hasContentInColumn(addresses, left - 1, top, bottom)) {
      left -= 1;
      changed = true;
    }
    while (hasContentInColumn(addresses, right + 1, top, bottom)) {
      right += 1;
      changed = true;
    }
  }
  return { start: { row: top, column: left }, end: { row: bottom, column: right } };
}

/** Uses an explicit multi-cell selection as-is, and resolves a single cell to its current region. */
export function resolveDataRange(sheet: Sheet, selection: CellRange): CellRange {
  const range = normalizeRange(selection);
  assertCellRange(range);
  return range.start.row === range.end.row && range.start.column === range.end.column
    ? resolveContiguousDataRange(sheet, range.start)
    : range;
}
