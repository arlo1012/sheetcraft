import { formatFormulaAddress } from "./references.js";
import {
  isFormulaError,
  type FormulaAddress,
  type FormulaRange,
  type FormulaResolver,
} from "./types.js";

export type AutoSumRange = FormulaRange & { direction: "vertical" | "horizontal" };

function isNumericCell(address: FormulaAddress, resolveCell: FormulaResolver): boolean {
  const value = resolveCell(address);
  return !isFormulaError(value) && typeof value === "number" && Number.isFinite(value);
}

function createReference(address: FormulaAddress) {
  return {
    ...address,
    rowAbsolute: false,
    columnAbsolute: false,
    start: 0,
    end: 0,
  };
}

export function findAutoSumRange(
  target: FormulaAddress,
  resolveCell: FormulaResolver,
): AutoSumRange | null {
  let row = target.row - 1;
  if (row >= 0 && isNumericCell({ row, column: target.column }, resolveCell)) {
    const end = { row, column: target.column };
    while (row >= 0 && isNumericCell({ row, column: target.column }, resolveCell)) row -= 1;
    const start = { row: row + 1, column: target.column };
    return {
      direction: "vertical",
      start: createReference(start),
      end: createReference(end),
      startOffset: 0,
      endOffset: 0,
    };
  }

  let column = target.column - 1;
  if (column < 0 || !isNumericCell({ row: target.row, column }, resolveCell)) return null;
  const end = { row: target.row, column };
  while (column >= 0 && isNumericCell({ row: target.row, column }, resolveCell)) column -= 1;
  const start = { row: target.row, column: column + 1 };
  return {
    direction: "horizontal",
    start: createReference(start),
    end: createReference(end),
    startOffset: 0,
    endOffset: 0,
  };
}

export function createAutoSumFormula(
  target: FormulaAddress,
  resolveCell: FormulaResolver,
): string | null {
  const range = findAutoSumRange(target, resolveCell);
  return range
    ? `=SUM(${formatFormulaAddress(range.start)}:${formatFormulaAddress(range.end)})`
    : null;
}
