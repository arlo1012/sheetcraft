import {
  cloneCellContent,
  createWorkbookEvaluator,
  createSheetSparseState,
  getCellContent,
  getCellStyle,
  MAX_SHEET_COLUMNS,
  setCellContent,
  setCellStyle,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { CellContent } from "../formula/types.js";
import { cloneCellStyle } from "../style.js";
import { translateFormulaForCopy } from "../formula/references.js";
import { resolveDataRange } from "../data-range.js";
import type {
  RemoveDuplicatesCommand,
  RestoreFullSheetStateCommand,
  SplitColumnCommand,
} from "./contracts.js";
import {
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
} from "./helpers.js";

function snapshotBeforeChange(
  workbook: Workbook,
  sheetId: string,
): {
  sheet: ReturnType<typeof getSheetOrThrow>;
  previous: ReturnType<typeof createSheetSparseState>;
} {
  const sheet = getSheetOrThrow(workbook, sheetId);
  return { sheet, previous: createSheetSparseState(sheet) };
}

function restore(
  sheetId: string,
  previous: ReturnType<typeof createSheetSparseState>,
  changed: boolean,
): RestoreFullSheetStateCommand | null {
  return changed ? { type: "restoreSheetState", sheetId, state: previous } : null;
}

function valueAsText(workbook: Workbook, sheetId: string, address: CellAddress): string {
  const value = createWorkbookEvaluator(workbook, sheetId).getComputedValue(address);
  return value === null ? "" : typeof value === "object" ? `#${value.code}!` : String(value);
}

/** Parses CSV-style quoted fields as well as ordinary one-character delimiters. */
export function splitDelimitedText(text: string, delimiter: string, quoted = true): string[] {
  if (!delimiter) throw new RangeError("A delimiter is required.");
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted && char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else inQuotes = !inQuotes;
    } else if (
      !inQuotes &&
      (delimiter.length === 1 ? char === delimiter : delimiter.includes(char))
    ) {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  return fields;
}

/** Pure preview used by UI before issuing a split command. */
export function previewSplitColumn(
  text: string,
  options: Pick<SplitColumnCommand, "mode" | "delimiter" | "fixedWidths" | "parseQuoted">,
): string[] {
  return options.mode === "delimiter"
    ? splitDelimitedText(text, options.delimiter ?? ",", options.parseQuoted !== false)
    : splitFixedWidthText(text, options.fixedWidths ?? []);
}

export function splitFixedWidthText(text: string, widths: readonly number[]): string[] {
  if (!widths.length || widths.some((width) => !Number.isInteger(width) || width <= 0))
    throw new RangeError("Fixed widths must be positive integers.");
  const fields: string[] = [];
  let offset = 0;
  for (const width of widths) {
    fields.push(text.slice(offset, offset + width));
    offset += width;
  }
  fields.push(text.slice(offset));
  return fields;
}

export function createSplitColumnCommand(
  sheetId: string,
  sourceColumn: number,
  range: CellRange,
  options: Omit<SplitColumnCommand, "type" | "sheetId" | "sourceColumn" | "range">,
): SplitColumnCommand {
  return {
    type: "splitColumn",
    sheetId,
    sourceColumn,
    range: { ...range, start: { ...range.start }, end: { ...range.end } },
    ...options,
  };
}

export function applySplitColumnCommand(
  workbook: Workbook,
  command: SplitColumnCommand,
): RestoreFullSheetStateCommand | null {
  const { sheet, previous } = snapshotBeforeChange(workbook, command.sheetId);
  const occupiedRows = [...sheet.cells].flatMap(([key, cell]) =>
    cell.content && Number(key.slice(key.indexOf(":") + 1)) === command.sourceColumn
      ? [Number(key.slice(0, key.indexOf(":")))]
      : [],
  );
  if (!command.range && occupiedRows.length === 0) return null;
  const inferredRange = command.range ?? {
    start: { row: Math.min(...occupiedRows), column: command.sourceColumn },
    end: { row: Math.max(...occupiedRows), column: command.sourceColumn },
  };
  const range = resolveDataRange(sheet, normalizeRange(inferredRange));
  assertCellRange(range);
  if (command.sourceColumn < range.start.column || command.sourceColumn > range.end.column)
    throw invalidCommandPayload("sourceColumn", command.sourceColumn);
  if (!Number.isInteger(command.destinationColumn) || command.destinationColumn < 0)
    throw invalidCommandPayload("destinationColumn", command.destinationColumn);
  const rows = Array.from(
    { length: range.end.row - range.start.row + 1 },
    (_, offset) => range.start.row + offset,
  );
  const parsed = rows.map((row) => {
    const text = valueAsText(workbook, command.sheetId, { row, column: command.sourceColumn });
    return command.mode === "delimiter"
      ? splitDelimitedText(text, command.delimiter ?? ",", command.parseQuoted !== false)
      : splitFixedWidthText(text, command.fixedWidths ?? []);
  });
  const width = Math.max(1, ...parsed.map((fields) => fields.length));
  if (command.destinationColumn + width > MAX_SHEET_COLUMNS)
    throw invalidCommandPayload(
      "destinationColumn",
      command.destinationColumn,
      "Split result exceeds sheet columns.",
    );
  if (
    sheet.mergedCells.some(
      (merged) =>
        !(
          merged.end.row < range.start.row ||
          merged.start.row > range.end.row ||
          merged.end.column < range.start.column ||
          merged.start.column > range.end.column
        ),
    )
  )
    throw invalidCommandPayload("range", command.range, "Splitting merged cells is not supported.");
  if (
    sheet.filter &&
    !(
      sheet.filter.range.end.row < range.start.row ||
      sheet.filter.range.start.row > range.end.row ||
      sheet.filter.range.end.column < range.start.column ||
      sheet.filter.range.start.column > range.end.column
    )
  )
    throw invalidCommandPayload(
      "range",
      command.range,
      "Splitting an active filtered range is not supported.",
    );
  if (!command.overwrite) {
    const wouldOverwrite = rows.some((row) =>
      Array.from({ length: width }, (_, offset) => command.destinationColumn + offset).some(
        (column) =>
          column !== command.sourceColumn && getCellContent(sheet, { row, column }) !== null,
      ),
    );
    if (wouldOverwrite)
      throw invalidCommandPayload(
        "overwrite",
        command.overwrite,
        "Splitting would overwrite existing cells.",
      );
  }
  let changed = false;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const source = { row, column: command.sourceColumn };
    const sourceStyle = cloneCellStyle(getCellStyle(sheet, source));
    const fields = parsed[index] ?? [];
    for (let offset = 0; offset < width; offset += 1) {
      const address = { row, column: command.destinationColumn + offset };
      const raw = fields[offset] ?? "";
      const type = command.columnTypes?.[offset] ?? "general";
      const value =
        type === "general" && raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
      setCellContent(sheet, address, { kind: "literal", value });
      if (sourceStyle) setCellStyle(sheet, address, cloneCellStyle(sourceStyle));
      changed = true;
    }
  }
  return restore(command.sheetId, previous, changed);
}

export function createRemoveDuplicatesCommand(
  sheetId: string,
  range: RemoveDuplicatesCommand["range"],
  keyColumns: readonly number[],
  options?: { hasHeader?: boolean },
): RemoveDuplicatesCommand {
  return {
    type: "removeDuplicates",
    sheetId,
    range: { start: { ...range.start }, end: { ...range.end } },
    keyColumns: [...keyColumns],
    ...(options?.hasHeader ? { hasHeader: true } : {}),
  };
}

/** Returns the number of rows a dedupe operation would remove without changing the sheet. */
export function getRemoveDuplicatesCount(
  workbook: Workbook,
  command: RemoveDuplicatesCommand,
): number {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const range = resolveDataRange(sheet, normalizeRange(command.range));
  const evaluator = createWorkbookEvaluator(workbook, command.sheetId);
  const seen = new Set<string>();
  let duplicates = 0;
  for (let row = range.start.row + (command.hasHeader ? 1 : 0); row <= range.end.row; row += 1) {
    const key = JSON.stringify(
      command.keyColumns.map((column) => evaluator.getComputedValue({ row, column })),
    );
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function cloneForRowMove(
  content: CellContent | null,
  from: CellAddress,
  to: CellAddress,
): CellContent | null {
  if (!content || content.kind !== "formula") return content ? cloneCellContent(content) : null;
  return {
    kind: "formula",
    formula: {
      source: translateFormulaForCopy(content.formula.source, {
        row: to.row - from.row,
        column: 0,
      }),
    },
  };
}

export function applyRemoveDuplicatesCommand(
  workbook: Workbook,
  command: RemoveDuplicatesCommand,
): RestoreFullSheetStateCommand | null {
  const { sheet, previous } = snapshotBeforeChange(workbook, command.sheetId);
  const range = resolveDataRange(sheet, normalizeRange(command.range));
  assertCellRange(range);
  if (
    !command.keyColumns.length ||
    command.keyColumns.some(
      (column) =>
        !Number.isInteger(column) || column < range.start.column || column > range.end.column,
    )
  )
    throw invalidCommandPayload("keyColumns", command.keyColumns);
  const start = range.start.row + (command.hasHeader ? 1 : 0);
  const evaluator = createWorkbookEvaluator(workbook, command.sheetId);
  const seen = new Set<string>();
  const retained: number[] = [];
  for (let row = start; row <= range.end.row; row += 1) {
    const key = JSON.stringify(
      command.keyColumns.map((column) => evaluator.getComputedValue({ row, column })),
    );
    if (!seen.has(key)) {
      seen.add(key);
      retained.push(row);
    }
  }
  if (retained.length === range.end.row - start + 1) return null;
  for (let offset = 0; offset <= range.end.row - start; offset += 1) {
    const destinationRow = start + offset;
    const sourceRow = retained[offset];
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const destination = { row: destinationRow, column };
      if (sourceRow === undefined) {
        setCellContent(sheet, destination, null);
        setCellStyle(sheet, destination, null);
        continue;
      }
      const source = { row: sourceRow, column };
      setCellContent(
        sheet,
        destination,
        cloneForRowMove(getCellContent(sheet, source), source, destination),
      );
      setCellStyle(sheet, destination, cloneCellStyle(getCellStyle(sheet, source)));
    }
  }
  return restore(command.sheetId, previous, true);
}
