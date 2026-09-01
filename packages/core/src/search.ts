import { formatCellValueForDisplay } from "./input.js";
import type { CellAddress, Sheet } from "./workbook.js";

export type SheetSearchDirection = "forward" | "backward";

function parseCellKey(key: string): CellAddress | null {
  const separator = key.indexOf(":");
  if (separator < 1 || separator === key.length - 1) {
    return null;
  }

  const row = Number(key.slice(0, separator));
  const column = Number(key.slice(separator + 1));
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
}

function compareAddresses(left: CellAddress, right: CellAddress): number {
  return left.row - right.row || left.column - right.column;
}

export function findCellByText(
  sheet: Sheet,
  query: string,
  from: CellAddress,
  direction: SheetSearchDirection = "forward",
): CellAddress | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  let nearest: CellAddress | null = null;
  let wrap: CellAddress | null = null;
  for (const [key, cell] of sheet.cells) {
    if (
      !formatCellValueForDisplay(cell.value ?? null)
        .toLowerCase()
        .includes(normalizedQuery)
    ) {
      continue;
    }

    const address = parseCellKey(key);
    if (!address) {
      continue;
    }

    const relativePosition = compareAddresses(address, from);
    if (direction === "forward") {
      if (!wrap || compareAddresses(address, wrap) < 0) {
        wrap = address;
      }
      if (relativePosition > 0 && (!nearest || compareAddresses(address, nearest) < 0)) {
        nearest = address;
      }
    } else {
      if (!wrap || compareAddresses(address, wrap) > 0) {
        wrap = address;
      }
      if (relativePosition < 0 && (!nearest || compareAddresses(address, nearest) > 0)) {
        nearest = address;
      }
    }
  }

  return nearest ?? wrap;
}
