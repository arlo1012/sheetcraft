import { formatCellValueForDisplay, parseCellInput } from "./input.js";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  getCellValue,
  type CellAddress,
  type CellRange,
  type CellValue,
  type Sheet,
} from "./workbook.js";

export type CellValueMatrix = CellValue[][];

export type CellMatrixSize = {
  rowCount: number;
  columnCount: number;
};

export type PastePlan = {
  anchor: CellAddress;
  range: CellRange;
  values: CellValueMatrix;
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

export function getCellMatrixSize(values: readonly (readonly CellValue[])[]): CellMatrixSize {
  const firstRow = values[0];
  if (!firstRow || firstRow.length === 0) {
    throw new RangeError("A cell matrix must contain at least one cell.");
  }

  const columnCount = firstRow.length;
  if (values.some((row) => row.length !== columnCount)) {
    throw new RangeError("A cell matrix must be rectangular.");
  }

  return { rowCount: values.length, columnCount };
}

export function getCellRangeValues(sheet: Sheet, range: CellRange): CellValueMatrix {
  const normalized = normalizeRange(range);
  const values: CellValueMatrix = [];

  for (let row = normalized.start.row; row <= normalized.end.row; row += 1) {
    const rowValues: CellValue[] = [];
    for (let column = normalized.start.column; column <= normalized.end.column; column += 1) {
      rowValues.push(getCellValue(sheet, { row, column }));
    }
    values.push(rowValues);
  }

  return values;
}

function encodeTsvField(value: CellValue): string {
  const text = formatCellValueForDisplay(value);
  return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeCellValuesToTsv(values: readonly (readonly CellValue[])[]): string {
  getCellMatrixSize(values);
  return values.map((row) => row.map(encodeTsvField).join("\t")).join("\r\n");
}

function readTsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let endedWithRowSeparator = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    endedWithRowSeparator = false;

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
      continue;
    }
    if (character === "\t") {
      row.push(field);
      field = "";
      continue;
    }
    if (character === "\r" || character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      endedWithRowSeparator = true;
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }

    field += character;
  }

  if (!endedWithRowSeparator || row.length > 0 || field !== "") {
    row.push(field);
    rows.push(row);
  }

  return rows.length > 0 ? rows : [[""]];
}

export function parseTsvToCellValues(text: string): CellValueMatrix {
  const rows = readTsvRows(text);
  const columnCount = Math.max(...rows.map((row) => row.length));

  return rows.map((row) =>
    Array.from({ length: columnCount }, (_, column) => parseCellInput(row[column] ?? "")),
  );
}

function createRangeFromMatrix(anchor: CellAddress, size: CellMatrixSize): CellRange | null {
  const end = {
    row: anchor.row + size.rowCount - 1,
    column: anchor.column + size.columnCount - 1,
  };
  if (
    anchor.row < 0 ||
    anchor.column < 0 ||
    end.row >= MAX_SHEET_ROWS ||
    end.column >= MAX_SHEET_COLUMNS
  ) {
    return null;
  }

  return { start: { ...anchor }, end };
}

function tileCellValues(
  values: readonly (readonly CellValue[])[],
  targetSize: CellMatrixSize,
): CellValueMatrix {
  const sourceSize = getCellMatrixSize(values);
  return Array.from({ length: targetSize.rowCount }, (_, row) =>
    Array.from(
      { length: targetSize.columnCount },
      (_, column) => values[row % sourceSize.rowCount]?.[column % sourceSize.columnCount] ?? null,
    ),
  );
}

export function createPastePlan(
  values: readonly (readonly CellValue[])[],
  targetRange: CellRange,
  activeCell: CellAddress,
  options?: { pasteFromActiveCell?: boolean },
): PastePlan | null {
  const sourceSize = getCellMatrixSize(values);
  const normalizedTarget = normalizeRange(targetRange);
  const targetSize = {
    rowCount: normalizedTarget.end.row - normalizedTarget.start.row + 1,
    columnCount: normalizedTarget.end.column - normalizedTarget.start.column + 1,
  };
  const targetIsSingleCell = targetSize.rowCount === 1 && targetSize.columnCount === 1;

  if (targetIsSingleCell || options?.pasteFromActiveCell) {
    const range = createRangeFromMatrix(activeCell, sourceSize);
    return range
      ? {
          anchor: { ...activeCell },
          range,
          values: values.map((row) => [...row]),
        }
      : null;
  }

  if (
    targetSize.rowCount % sourceSize.rowCount !== 0 ||
    targetSize.columnCount % sourceSize.columnCount !== 0
  ) {
    return null;
  }

  return {
    anchor: { ...normalizedTarget.start },
    range: normalizedTarget,
    values: tileCellValues(values, targetSize),
  };
}
