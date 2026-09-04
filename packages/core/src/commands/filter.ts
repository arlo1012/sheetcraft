import { isFormulaError, type FormulaValue } from "../formula/types.js";
import {
  createSheetEvaluator,
  createSheetSparseState,
  replaceSheetSparseState,
  type CellAddress,
  type Sheet,
  type SheetEvaluator,
  type SheetFilter,
  type SheetFilterValue,
  type Workbook,
} from "../workbook.js";
import type { RestoreFullSheetStateCommand, SetSheetFilterCommand } from "./contracts.js";
import {
  assertCellAddress,
  assertCellRange,
  getSheetOrThrow,
  normalizeRange,
  validateCommandPayload,
} from "./helpers.js";

export type HiddenRowInterval = { start: number; end: number };

export function getSheetFilterValue(value: FormulaValue): SheetFilterValue {
  if (value === null) return { kind: "blank" };
  if (isFormulaError(value)) return { kind: "error", code: value.code };
  if (typeof value === "number") return { kind: "number", value };
  if (typeof value === "string") return { kind: "string", value };
  return { kind: "boolean", value };
}

export function getSheetFilterValueKey(value: SheetFilterValue): string {
  return value.kind === "blank"
    ? "blank"
    : value.kind === "error"
      ? `error:${value.code}`
      : `${value.kind}:${String(value.value)}`;
}

export function areSheetFilterValuesEqual(
  left: SheetFilterValue,
  right: SheetFilterValue,
): boolean {
  return getSheetFilterValueKey(left) === getSheetFilterValueKey(right);
}

function cloneFilter(filter: SheetFilter): SheetFilter {
  return {
    range: { start: { ...filter.range.start }, end: { ...filter.range.end } },
    columns: filter.columns.map((column) => ({
      column: column.column,
      allowedValues: column.allowedValues.map((value) => ({ ...value })),
    })),
  };
}

function parseCellKey(key: string): CellAddress {
  const separator = key.indexOf(":");
  return { row: Number(key.slice(0, separator)), column: Number(key.slice(separator + 1)) };
}

function compareFilterValues(left: SheetFilterValue, right: SheetFilterValue): number {
  const leftKey = getSheetFilterValueKey(left);
  const rightKey = getSheetFilterValueKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

/** Returns computed, canonical distinct values for a data column, excluding its header row. */
export function getSheetFilterColumnDistinctValues(
  sheet: Sheet,
  filterRange: SheetFilter["range"],
  column: number,
  evaluator: SheetEvaluator = createSheetEvaluator(sheet),
): SheetFilterValue[] {
  const range = normalizeRange(filterRange);
  assertCellRange(range);
  if (!Number.isInteger(column)) {
    throw new RangeError("Filter column must be an integer.");
  }
  assertCellAddress({ row: range.start.row, column });
  if (column < range.start.column || column > range.end.column) {
    throw new RangeError("Filter column is outside the filter range.");
  }
  const values = new Map<string, SheetFilterValue>();
  const occupiedRows = new Set<number>();
  let hasBlank = false;
  for (const [key, cell] of sheet.cells) {
    const address = parseCellKey(key);
    if (
      address.column !== column ||
      address.row <= range.start.row ||
      address.row > range.end.row
    ) {
      continue;
    }
    if (cell.content) occupiedRows.add(address.row);
    const value = getSheetFilterValue(evaluator.getComputedValue(address));
    if (value.kind === "blank") hasBlank = true;
    else values.set(getSheetFilterValueKey(value), value);
  }
  if (occupiedRows.size < range.end.row - range.start.row) hasBlank = true;
  if (hasBlank) values.set("blank", { kind: "blank" });
  return [...values.values()].sort(compareFilterValues);
}

function addHiddenInterval(intervals: HiddenRowInterval[], start: number, end: number): void {
  if (start > end) return;
  const previous = intervals.at(-1);
  if (previous && start <= previous.end + 1) previous.end = Math.max(previous.end, end);
  else intervals.push({ start, end });
}

function doesRowMatchFilter(filter: SheetFilter, row: number, evaluator: SheetEvaluator): boolean {
  return filter.columns.every((column) => {
    const value = getSheetFilterValue(evaluator.getComputedValue({ row, column: column.column }));
    return column.allowedValues.some((allowed) => areSheetFilterValuesEqual(allowed, value));
  });
}

/**
 * Derives hidden row intervals without materializing the filter's rectangular
 * data range. Rows without sparse cells use a single shared blank-row result.
 */
export function createSheetFilterHiddenRowIntervals(
  sheet: Sheet,
  evaluator: SheetEvaluator = createSheetEvaluator(sheet),
): HiddenRowInterval[] {
  const filter = sheet.filter;
  if (!filter || filter.columns.length === 0) return [];
  const dataStart = filter.range.start.row + 1;
  const dataEnd = filter.range.end.row;
  if (filter.columns.some((column) => column.allowedValues.length === 0)) {
    return [{ start: dataStart, end: dataEnd }];
  }
  const columnSet = new Set(filter.columns.map((column) => column.column));
  const candidateRows = new Set<number>();
  for (const key of sheet.cells.keys()) {
    const address = parseCellKey(key);
    if (address.row >= dataStart && address.row <= dataEnd && columnSet.has(address.column)) {
      candidateRows.add(address.row);
    }
  }
  const blankRowMatches = filter.columns.every((column) =>
    column.allowedValues.some((value) => value.kind === "blank"),
  );
  const hidden: HiddenRowInterval[] = [];
  let cursor = dataStart;
  for (const row of [...candidateRows].sort((left, right) => left - right)) {
    if (!blankRowMatches) addHiddenInterval(hidden, cursor, row - 1);
    if (!doesRowMatchFilter(filter, row, evaluator)) addHiddenInterval(hidden, row, row);
    cursor = row + 1;
  }
  if (!blankRowMatches) addHiddenInterval(hidden, cursor, dataEnd);
  return hidden;
}

export function createSetSheetFilterCommand(
  sheetId: string,
  filter: SheetFilter | null,
): SetSheetFilterCommand {
  return { type: "setSheetFilter", sheetId, filter: filter === null ? null : cloneFilter(filter) };
}

export function createSetSheetFilterCriteriaCommand(
  sheetId: string,
  range: SheetFilter["range"],
  columns: SheetFilter["columns"],
): SetSheetFilterCommand {
  return createSetSheetFilterCommand(sheetId, { range, columns });
}

export function createClearSheetFilterCommand(sheetId: string): SetSheetFilterCommand {
  return createSetSheetFilterCommand(sheetId, null);
}

export function applySetSheetFilterCommand(
  workbook: Workbook,
  command: SetSheetFilterCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const filter = validateCommandPayload("filter", command.filter, () =>
    command.filter === null ? null : cloneFilter(command.filter),
  );
  const previous = createSheetSparseState(sheet);
  const state = { ...previous, filter };
  return validateCommandPayload("filter", command.filter, () =>
    replaceSheetSparseState(sheet, state),
  )
    ? { type: "restoreSheetState", sheetId: command.sheetId, state: previous }
    : null;
}
