import {
  createCellKey,
  createSheetEvaluator,
  type CellAddress,
  type Cell,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "./workbook.js";
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

const DIRECT_RANGE_CELL_LIMIT = 1_024;

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

function parseCellKey(key: string): CellAddress {
  const separator = key.indexOf(":");
  return {
    row: Number(key.slice(0, separator)),
    column: Number(key.slice(separator + 1)),
  };
}

function getRangeSize(range: CellRange): number {
  return (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1);
}

function* getSelectedContentCells(sheet: Sheet, range: CellRange): Generator<[CellAddress, Cell]> {
  if (getRangeSize(range) <= DIRECT_RANGE_CELL_LIMIT) {
    for (let row = range.start.row; row <= range.end.row; row += 1) {
      for (let column = range.start.column; column <= range.end.column; column += 1) {
        const cell = sheet.cells.get(createCellKey({ row, column }));
        if (cell?.content !== undefined) yield [{ row, column }, cell];
      }
    }
    return;
  }

  for (const [key, cell] of sheet.cells) {
    if (cell.content === undefined) continue;
    const address = parseCellKey(key);
    if (
      address.row >= range.start.row &&
      address.row <= range.end.row &&
      address.column >= range.start.column &&
      address.column <= range.end.column
    ) {
      yield [address, cell];
    }
  }
}

export function getSelectionSummary(
  sheet: Sheet,
  range: CellRange,
  evaluator?: SheetEvaluator,
): SelectionSummary {
  const normalized = normalizeRange(range);
  let count = 0;
  let numericCount = 0;
  let sum = 0;
  let minimum = 0;
  let maximum = 0;

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

  const rangeSize = getRangeSize(normalized);
  for (const [address, cell] of getSelectedContentCells(sheet, normalized)) {
    const content = cell.content;
    if (!content) continue;
    if (content.kind === "formula") {
      evaluator ??= createSheetEvaluator(sheet);
      addValue(evaluator.getComputedValue(address));
    } else if (content.kind === "literal") {
      addValue(content.value);
    } else if (content.kind === "error") {
      addValue(content.error);
    } else {
      addValue(null);
    }
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
