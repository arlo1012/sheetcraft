import { formatComputedValueForDisplay } from "./input.js";
import {
  createSheetEvaluator,
  type CellAddress,
  type Sheet,
  type SheetEvaluator,
} from "./workbook.js";

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
  evaluator: SheetEvaluator = createSheetEvaluator(sheet),
): CellAddress | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  let nearest: CellAddress | null = null;
  let wrap: CellAddress | null = null;
  for (const [key] of sheet.cells) {
    const address = parseCellKey(key);
    if (
      !address ||
      !formatComputedValueForDisplay(evaluator.getComputedValue(address))
        .toLowerCase()
        .includes(normalizedQuery)
    ) {
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
