import {
  cloneCellContent,
  createWorkbookEvaluator,
  createSheetSparseState,
  getCellContent,
  getCellStyle,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
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
  RestoreTableTransactionCommand,
  SplitColumnCommand,
  SplitTextOptions,
} from "./contracts.js";
import { convertSplitColumnField, splitText } from "./split-text.js";
import {
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
} from "./helpers.js";
import { applyResizeTableCommand, createRestoreTableTransactionCommand } from "../tables.js";

type RemoveDuplicatesTarget = {
  range: CellRange;
  hasHeader: boolean;
  tableId?: string;
  tableRange?: CellRange;
};

function removeDuplicatesTarget(
  workbook: Workbook,
  command: RemoveDuplicatesCommand,
): RemoveDuplicatesTarget {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (!command.tableId)
    return {
      range: resolveDataRange(sheet, normalizeRange(command.range)),
      hasHeader: command.hasHeader === true,
    };
  const table = (sheet.tables ?? []).find((entry) => entry.id === command.tableId);
  if (!table) throw invalidCommandPayload("tableId", command.tableId, "Table does not exist.");
  return {
    range: {
      start: { ...table.range.start, row: table.range.start.row + (table.headerRow ? 1 : 0) },
      end: { ...table.range.end, row: table.range.end.row - (table.totalRow ? 1 : 0) },
    },
    hasHeader: false,
    tableId: table.id,
    tableRange: { start: { ...table.range.start }, end: { ...table.range.end } },
  };
}

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

/** Pure preview used by UI before issuing a split command. */
export function previewSplitColumn(text: string, options: SplitTextOptions): string[] {
  return splitText(text, options);
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
    const text = valueAsText(workbook, command.sheetId, {
      row,
      column: command.sourceColumn,
    });
    return splitText(text, command);
  });
  // A downward destination may overlap a later source row. Capture styles before
  // the first write so each output row keeps its original source formatting.
  const sourceStyles = rows.map((row) =>
    cloneCellStyle(getCellStyle(sheet, { row, column: command.sourceColumn })),
  );
  const fieldCount = Math.max(1, ...parsed.map((fields) => fields.length));
  const outputFieldOffsets = Array.from({ length: fieldCount }, (_, offset) => offset).filter(
    (offset) => command.columnTypes?.[offset] !== "skip",
  );
  const width = outputFieldOffsets.length;
  if (command.destinationColumn + width > MAX_SHEET_COLUMNS)
    throw invalidCommandPayload(
      "destinationColumn",
      command.destinationColumn,
      "Split result exceeds sheet columns.",
    );
  const destinationRow = command.destinationRow ?? range.start.row;
  if (
    !Number.isInteger(destinationRow) ||
    destinationRow < 0 ||
    destinationRow + rows.length > MAX_SHEET_ROWS
  )
    throw invalidCommandPayload("destinationRow", command.destinationRow);
  const destinationRange = {
    start: { row: destinationRow, column: command.destinationColumn },
    end: {
      row: destinationRow + rows.length - 1,
      column: command.destinationColumn + Math.max(0, width - 1),
    },
  };
  const intersectsRange = (merged: CellRange, candidate: CellRange) =>
    !(
      merged.end.row < candidate.start.row ||
      merged.start.row > candidate.end.row ||
      merged.end.column < candidate.start.column ||
      merged.start.column > candidate.end.column
    );
  if (
    sheet.mergedCells.some(
      (merged) =>
        intersectsRange(merged, range) || (width > 0 && intersectsRange(merged, destinationRange)),
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
    const wouldOverwrite = rows.some((sourceRow, rowOffset) =>
      Array.from({ length: width }, (_, offset) => command.destinationColumn + offset).some(
        (column) =>
          !(column === command.sourceColumn && destinationRow + rowOffset === sourceRow) &&
          getCellContent(sheet, { row: destinationRow + rowOffset, column }) !== null,
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
    const sourceStyle = sourceStyles[index];
    const fields = parsed[index] ?? [];
    for (let outputOffset = 0; outputOffset < outputFieldOffsets.length; outputOffset += 1) {
      const offset = outputFieldOffsets[outputOffset]!;
      const type = command.columnTypes?.[offset] ?? "general";
      const address = {
        row: destinationRow + index,
        column: command.destinationColumn + outputOffset,
      };
      const raw = fields[offset] ?? "";
      const converted = convertSplitColumnField(
        raw,
        type,
        command.dateOrders?.[offset],
        workbook.dateSystem,
      );
      setCellContent(sheet, address, { kind: "literal", value: converted.value });
      // Always set a style (or clear it), otherwise an overwritten target can
      // retain a date/currency format unrelated to the parsed result.
      const style = cloneCellStyle(sourceStyle) ?? {};
      if (converted.numberFormat) style.numberFormat = converted.numberFormat;
      else if (command.columnTypes?.[offset] === "general") delete style.numberFormat;
      setCellStyle(sheet, address, Object.keys(style).length ? style : null);
      changed = true;
    }
  }
  return restore(command.sheetId, previous, changed);
}

export function createRemoveDuplicatesCommand(
  sheetId: string,
  range: RemoveDuplicatesCommand["range"],
  keyColumns: readonly number[],
  options?: { hasHeader?: boolean; tableId?: string },
): RemoveDuplicatesCommand {
  return {
    type: "removeDuplicates",
    sheetId,
    range: { start: { ...range.start }, end: { ...range.end } },
    keyColumns: [...keyColumns],
    ...(options?.hasHeader ? { hasHeader: true } : {}),
    ...(options?.tableId ? { tableId: options.tableId } : {}),
  };
}

/** Returns the number of rows a dedupe operation would remove without changing the sheet. */
export function getRemoveDuplicatesCount(
  workbook: Workbook,
  command: RemoveDuplicatesCommand,
): number {
  const target = removeDuplicatesTarget(workbook, command);
  const range = target.range;
  const evaluator = createWorkbookEvaluator(workbook, command.sheetId);
  const seen = new Set<string>();
  let duplicates = 0;
  for (let row = range.start.row + (target.hasHeader ? 1 : 0); row <= range.end.row; row += 1) {
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
): RestoreFullSheetStateCommand | RestoreTableTransactionCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const target = removeDuplicatesTarget(workbook, command);
  const range = target.range;
  assertCellRange(range);
  if (
    !command.keyColumns.length ||
    command.keyColumns.some(
      (column) =>
        !Number.isInteger(column) || column < range.start.column || column > range.end.column,
    )
  )
    throw invalidCommandPayload("keyColumns", command.keyColumns);
  const start = range.start.row + (target.hasHeader ? 1 : 0);
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
  const previous = target.tableId
    ? createRestoreTableTransactionCommand(workbook)
    : createSheetSparseState(sheet);
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
  if (target.tableId && target.tableRange) {
    applyResizeTableCommand(workbook, {
      type: "resizeTable",
      sheetId: command.sheetId,
      tableId: target.tableId,
      range: {
        start: { ...target.tableRange.start },
        end: {
          ...target.tableRange.end,
          row: target.tableRange.end.row - (range.end.row - start + 1 - retained.length),
        },
      },
    });
    return previous as RestoreTableTransactionCommand;
  }
  return restore(command.sheetId, previous as ReturnType<typeof createSheetSparseState>, true);
}
