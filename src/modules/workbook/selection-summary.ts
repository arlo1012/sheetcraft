import { getCellValue, type CellRange, type CellValue, type Sheet } from "./workbook";

export type SelectionSummary = {
  average: number;
  count: number;
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

  const addValue = (value: CellValue): void => {
    if (value === null) {
      return;
    }
    count += 1;
    if (typeof value === "number" && Number.isFinite(value)) {
      numericCount += 1;
      sum += value;
    }
  };

  const rangeSize =
    (normalized.end.row - normalized.start.row + 1) *
    (normalized.end.column - normalized.start.column + 1);
  if (rangeSize <= sheet.cells.size) {
    for (let row = normalized.start.row; row <= normalized.end.row; row += 1) {
      for (let column = normalized.start.column; column <= normalized.end.column; column += 1) {
        addValue(getCellValue(sheet, { row, column }));
      }
    }
  } else {
    for (const [key, cell] of sheet.cells) {
      if (cell.value === undefined) {
        continue;
      }
      const address = parseCellKey(key);
      if (
        address.row < normalized.start.row ||
        address.row > normalized.end.row ||
        address.column < normalized.start.column ||
        address.column > normalized.end.column
      ) {
        continue;
      }
      addValue(cell.value);
    }
  }

  return {
    average: numericCount === 0 ? 0 : sum / numericCount,
    count,
    sum: Object.is(sum, -0) ? 0 : sum,
  };
}
