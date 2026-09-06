import { createSheetEvaluator, type CellRange, type Sheet } from "./workbook.js";
import { isFormulaError, type FormulaValue } from "./formula/types.js";

export type SelectionSummary = {
  average: number;
  count: number;
  maximum: number;
  minimum: number;
  numericCount: number;
  selectedCellCount: number;
  sum: number;
};

function normalizeRange(range: CellRange): CellRange {
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

function parseCellKey(key: string): { row: number; column: number } {
  const separator = key.indexOf(":");
  return {
    row: Number(key.slice(0, separator)),
    column: Number(key.slice(separator + 1)),
  };
}

export function getSelectionSummary(sheet: Sheet, range: CellRange): SelectionSummary {
  const normalized = normalizeRange(range);
  let count = 0;
  let numericCount = 0;
  let sum = 0;
  let minimum = 0;
  let maximum = 0;
  const evaluator = createSheetEvaluator(sheet);

  const addValue = (value: FormulaValue): void => {
    if (value === null || isFormulaError(value)) {
      return;
    }
    count += 1;
    if (typeof value === "number" && Number.isFinite(value)) {
      if (numericCount === 0) {
        minimum = value;
        maximum = value;
      } else {
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      numericCount += 1;
      sum += value;
    }
  };

  const rangeSize =
    (normalized.end.row - normalized.start.row + 1) *
    (normalized.end.column - normalized.start.column + 1);
  for (const [key, cell] of sheet.cells) {
    if (cell.content === undefined) continue;
    const address = parseCellKey(key);
    if (
      address.row < normalized.start.row ||
      address.row > normalized.end.row ||
      address.column < normalized.start.column ||
      address.column > normalized.end.column
    ) {
      continue;
    }
    addValue(evaluator.getComputedValue(address));
  }

  return {
    average: numericCount === 0 ? 0 : sum / numericCount,
    count,
    maximum: Object.is(maximum, -0) ? 0 : maximum,
    minimum: Object.is(minimum, -0) ? 0 : minimum,
    numericCount,
    selectedCellCount: rangeSize,
    sum: Object.is(sum, -0) ? 0 : sum,
  };
}
