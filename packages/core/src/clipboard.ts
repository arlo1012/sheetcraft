import { cloneCellSparkline, type CellSparkline } from "./sparklines.js";
import { getCellSparkline } from "./workbook.js";
import {
  formatComputedValueForDisplay,
  formatCellValueForDisplay,
  parseCellInput,
} from "./input.js";
export {
  clearConditionalFormatRanges,
  copyConditionalFormatRules,
} from "./conditional-formatting-transfer.js";
import { translateFormulaForCopy } from "./formula/references.js";
import { isFormulaError, type CellContent, type FormulaValue } from "./formula/types.js";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  createSheetEvaluator,
  cloneCellContent,
  cloneCellNote,
  getCellContent,
  getCellNote,
  type CellAddress,
  type CellRange,
  type CellValue,
  type Sheet,
  type SheetEvaluator,
} from "./workbook.js";

export type CellValueMatrix = CellValue[][];
export type CellContentMatrix = (CellContent | null)[][];
export type CellSparklineMatrix = (CellSparkline | null)[][];
export type CellNoteMatrix = (import("./workbook.js").CellNote | null)[][];
export type CellComputedValueMatrix = FormulaValue[][];

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

export function getCellMatrixSize<Value>(values: readonly (readonly Value[])[]): CellMatrixSize {
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

export function getCellRangeContents(sheet: Sheet, range: CellRange): CellContentMatrix {
  const normalized = normalizeRange(range);
  const contents: CellContentMatrix = [];

  for (let row = normalized.start.row; row <= normalized.end.row; row += 1) {
    const rowContents: Array<CellContent | null> = [];
    for (let column = normalized.start.column; column <= normalized.end.column; column += 1) {
      rowContents.push(getCellContent(sheet, { row, column }));
    }
    contents.push(rowContents);
  }

  return contents;
}

/** A cloned sparse-note projection that follows the copied cell rectangle. */
export function getCellRangeNotes(sheet: Sheet, range: CellRange): CellNoteMatrix {
  const normalized = normalizeRange(range);
  const notes: CellNoteMatrix = [];
  for (let row = normalized.start.row; row <= normalized.end.row; row += 1) {
    const rowNotes: Array<import("./workbook.js").CellNote | null> = [];
    for (let column = normalized.start.column; column <= normalized.end.column; column += 1) {
      rowNotes.push(cloneCellNote(getCellNote(sheet, { row, column })) ?? null);
    }
    notes.push(rowNotes);
  }
  return notes;
}

export function getCellRangeSparklines(sheet: Sheet, range: CellRange): CellSparklineMatrix {
  const normalized = normalizeRange(range);
  const result: CellSparklineMatrix = [];
  for (let row = normalized.start.row; row <= normalized.end.row; row++) {
    const values: Array<CellSparkline | null> = [];
    for (let column = normalized.start.column; column <= normalized.end.column; column++)
      values.push(cloneCellSparkline(getCellSparkline(sheet, { row, column })) ?? null);
    result.push(values);
  }
  return result;
}

export function getCellRangeComputedValues(
  sheet: Sheet,
  range: CellRange,
  evaluator: SheetEvaluator = createSheetEvaluator(sheet),
): CellComputedValueMatrix {
  const normalized = normalizeRange(range);
  const values: CellComputedValueMatrix = [];
  for (let row = normalized.start.row; row <= normalized.end.row; row += 1) {
    const rowValues: FormulaValue[] = [];
    for (let column = normalized.start.column; column <= normalized.end.column; column += 1) {
      rowValues.push(evaluator.getComputedValue({ row, column }));
    }
    values.push(rowValues);
  }
  return values;
}

/** Values-only clipboard projection. Formula errors become their display token text. */
export function getCellRangeValues(
  sheet: Sheet,
  range: CellRange,
  evaluator?: SheetEvaluator,
): CellValueMatrix {
  const normalized = normalizeRange(range);
  return getCellRangeComputedValues(sheet, range, evaluator).map((row, rowIndex) =>
    row.map((value, columnIndex) =>
      getCellContent(sheet, {
        row: normalized.start.row + rowIndex,
        column: normalized.start.column + columnIndex,
      })?.kind === "image"
        ? null
        : isFormulaError(value)
          ? formatComputedValueForDisplay(value)
          : value,
    ),
  );
}

export function translateCellContentForCopy(
  content: CellContent | null,
  source: CellAddress,
  destination: CellAddress,
): CellContent | null {
  if (!content) return null;
  if (content.kind !== "formula") return cloneCellContent(content);
  return {
    kind: "formula",
    formula: {
      source: translateFormulaForCopy(content.formula.source, {
        row: destination.row - source.row,
        column: destination.column - source.column,
      }),
    },
  };
}

/**
 * Produces raw contents for a copy paste. Formula references move with every
 * individual source-to-destination cell; callers use the unmodified content
 * matrix for cut/move operations.
 */
export function translateCellContentMatrixForCopy(
  contents: readonly (readonly (CellContent | null)[])[],
  sourceAnchor: CellAddress,
  destinationAnchor: CellAddress,
): CellContentMatrix {
  getCellMatrixSize(contents);
  return contents.map((row, rowOffset) =>
    row.map((content, columnOffset) =>
      translateCellContentForCopy(
        content,
        { row: sourceAnchor.row + rowOffset, column: sourceAnchor.column + columnOffset },
        { row: destinationAnchor.row + rowOffset, column: destinationAnchor.column + columnOffset },
      ),
    ),
  );
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

/** Parses TSV fields without coercing their text representation. */
export function parseTsvToCellTexts(text: string): string[][] {
  const rows = readTsvRows(text);
  const columnCount = Math.max(...rows.map((row) => row.length));

  return rows.map((row) => Array.from({ length: columnCount }, (_, column) => row[column] ?? ""));
}

export function parseTsvToCellValues(text: string): CellValueMatrix {
  return parseTsvToCellTexts(text).map((row) => row.map(parseCellInput));
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

export function tileCellMatrix<Value>(
  values: readonly (readonly Value[])[],
  targetSize: CellMatrixSize,
): Value[][] {
  const sourceSize = getCellMatrixSize(values);
  if (
    !Number.isInteger(targetSize.rowCount) ||
    !Number.isInteger(targetSize.columnCount) ||
    targetSize.rowCount <= 0 ||
    targetSize.columnCount <= 0
  ) {
    throw new RangeError("A target cell matrix must contain at least one cell.");
  }
  return Array.from({ length: targetSize.rowCount }, (_, row) =>
    Array.from({ length: targetSize.columnCount }, (_, column) => {
      const sourceRow = values[row % sourceSize.rowCount];
      if (!sourceRow) {
        throw new RangeError("A cell matrix must contain at least one cell.");
      }
      return sourceRow[column % sourceSize.columnCount] as Value;
    }),
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
    values: tileCellMatrix(values, targetSize),
  };
}
