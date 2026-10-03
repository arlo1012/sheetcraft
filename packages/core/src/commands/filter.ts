import { createFormulaError } from "../formula/types.js";
import {
  getSheetFilterValue,
  getSheetFilterValueKey,
  createSheetFilterColumnMatcher,
  doesSheetFilterColumnMatch,
} from "../filter-values.js";
export {
  getSheetFilterValue,
  getSheetFilterValueKey,
  createSheetFilterColumnMatcher,
  doesSheetFilterColumnMatch,
} from "../filter-values.js";
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

function cloneFilter(filter: SheetFilter): SheetFilter {
  return {
    range: { start: { ...filter.range.start }, end: { ...filter.range.end } },
    columns: filter.columns.map((column) => ({
      column: column.column,
      allowedValues: column.allowedValues.map((value) => ({ ...value })),
      ...(column.condition ? { condition: cloneFilterCondition(column.condition) } : {}),
    })),
    ...(filter.advanced
      ? {
          advanced: {
            ...(filter.advanced.criteria
              ? {
                  criteria: {
                    sheetId: filter.advanced.criteria.sheetId,
                    range: {
                      start: { ...filter.advanced.criteria.range.start },
                      end: { ...filter.advanced.criteria.range.end },
                    },
                  },
                }
              : {}),
            uniqueOnly: filter.advanced.uniqueOnly,
            hiddenRows: filter.advanced.hiddenRows.map((interval) => ({ ...interval })),
          },
        }
      : {}),
  };
}

function cloneFilterCondition(
  condition: NonNullable<SheetFilter["columns"][number]["condition"]>,
): NonNullable<SheetFilter["columns"][number]["condition"]> {
  return condition.kind === "compound"
    ? { ...condition, conditions: [{ ...condition.conditions[0] }, { ...condition.conditions[1] }] }
    : condition.kind === "color-set"
      ? { ...condition, colors: [...condition.colors] }
      : { ...condition };
}

function parseCellKey(key: string): CellAddress {
  const separator = key.indexOf(":");
  return {
    row: Number(key.slice(0, separator)),
    column: Number(key.slice(separator + 1)),
  };
}

function compareFilterValues(left: SheetFilterValue, right: SheetFilterValue): number {
  const leftKey = getSheetFilterValueKey(left);
  const rightKey = getSheetFilterValueKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}
function compareCountValues(left: SheetFilterValue, right: SheetFilterValue): number {
  const rank = (value: SheetFilterValue) =>
    value.kind === "number"
      ? 0
      : value.kind === "string"
        ? 1
        : value.kind === "boolean"
          ? 2
          : value.kind === "error"
            ? 3
            : 4;
  const rankDifference = rank(left) - rank(right);
  if (rankDifference !== 0) return rankDifference;
  if (left.kind === "number" && right.kind === "number") return left.value - right.value;
  return compareFilterValues(left, right);
}

/** Counts values visible to a column's filter menu, applying every other active criterion. */
export function getSheetFilterColumnValueCounts(
  sheet: Sheet,
  filterRange: SheetFilter["range"],
  column: number,
  evaluator: SheetEvaluator = createSheetEvaluator(sheet),
): Array<{ value: SheetFilterValue; count: number; address?: CellAddress }> {
  const range = normalizeRange(filterRange);
  assertCellRange(range);
  if (!Number.isInteger(column) || column < range.start.column || column > range.end.column)
    throw new RangeError("Filter column is outside the filter range.");
  const active = sheet.filter;
  const sameFilterRange =
    active?.range.start.row === range.start.row &&
    active.range.end.row === range.end.row &&
    active.range.start.column === range.start.column &&
    active.range.end.column === range.end.column;
  const otherColumns = sameFilterRange
    ? active.columns.filter((entry) => entry.column !== column)
    : [];
  const relevant = new Set([column, ...otherColumns.map((entry) => entry.column)]);
  const rows = new Set<number>();
  for (const key of sheet.cells.keys()) {
    const address = parseCellKey(key);
    if (
      address.row > range.start.row &&
      address.row <= range.end.row &&
      relevant.has(address.column)
    )
      rows.add(address.row);
  }
  const entries = new Map<
    string,
    { value: SheetFilterValue; count: number; address?: CellAddress }
  >();
  const add = (value: SheetFilterValue, count: number, address?: CellAddress) => {
    if (!count) return;
    const key = getSheetFilterValueKey(value);
    const current = entries.get(key);
    if (current) current.count += count;
    else entries.set(key, { value, count, ...(address ? { address } : {}) });
  };
  const matchesOtherByColumn = otherColumns.map((entry) =>
    createSheetFilterColumnMatcher(
      sheet,
      active ?? { range, columns: otherColumns },
      entry,
      evaluator.getComputedValue,
    ),
  );
  const matchesOther = (row: number) => matchesOtherByColumn.every((matches) => matches(row));
  for (const row of rows)
    if (matchesOther(row)) {
      const address = { row, column };
      add(getSheetFilterValue(evaluator.getComputedValue(address)), 1, address);
    }
  const implicitBlankRows = range.end.row - range.start.row - rows.size;
  if (
    implicitBlankRows &&
    otherColumns.every((entry) => doesSheetFilterColumnMatch(entry, { kind: "blank" }))
  )
    add({ kind: "blank" }, implicitBlankRows);
  return [...entries.values()].sort((left, right) => compareCountValues(left.value, right.value));
}

/** Returns computed, canonical distinct values for a data column, excluding its header row. */
export function getSheetFilterColumnDistinctValues(
  sheet: Sheet,
  filterRange: SheetFilter["range"],
  column: number,
  evaluator?: SheetEvaluator,
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
  let formulaEvaluator = evaluator;
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
    const content = cell.content;
    const value = getSheetFilterValue(
      content?.kind === "formula"
        ? (formulaEvaluator ??= createSheetEvaluator(sheet)).getComputedValue(address)
        : content?.kind === "literal"
          ? content.value
          : content?.kind === "error"
            ? content.error
            : content?.kind === "image"
              ? createFormulaError("VALUE")
              : null,
    );
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

function doesRowMatchFilter(
  sheet: Sheet,
  filter: SheetFilter,
  row: number,
  evaluator: SheetEvaluator,
  matchers = filter.columns.map((column) =>
    createSheetFilterColumnMatcher(sheet, filter, column, evaluator.getComputedValue),
  ),
): boolean {
  return matchers.every((matches) => matches(row));
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
  if (!filter) return [];
  if (filter.advanced) return filter.advanced.hiddenRows.map((interval) => ({ ...interval }));
  if (filter.columns.length === 0) return [];
  const dataStart = filter.range.start.row + 1;
  const dataEnd = filter.range.end.row;
  if (filter.columns.some((column) => column.allowedValues.length === 0 && !column.condition)) {
    return [{ start: dataStart, end: dataEnd }];
  }
  const columnSet = new Set(filter.columns.map((column) => column.column));
  const matchers = filter.columns.map((column) =>
    createSheetFilterColumnMatcher(sheet, filter, column, evaluator.getComputedValue),
  );
  const candidateRows = new Set<number>();
  for (const key of sheet.cells.keys()) {
    const address = parseCellKey(key);
    if (address.row >= dataStart && address.row <= dataEnd && columnSet.has(address.column)) {
      candidateRows.add(address.row);
    }
  }
  const blankRowMatches = filter.columns.every((column) =>
    doesSheetFilterColumnMatch(column, { kind: "blank" }),
  );
  const hidden: HiddenRowInterval[] = [];
  let cursor = dataStart;
  for (const row of [...candidateRows].sort((left, right) => left - right)) {
    if (!blankRowMatches) addHiddenInterval(hidden, cursor, row - 1);
    if (!doesRowMatchFilter(sheet, filter, row, evaluator, matchers))
      addHiddenInterval(hidden, row, row);
    cursor = row + 1;
  }
  if (!blankRowMatches) addHiddenInterval(hidden, cursor, dataEnd);
  return hidden;
}

export function createSetSheetFilterCommand(
  sheetId: string,
  filter: SheetFilter | null,
): SetSheetFilterCommand {
  return {
    type: "setSheetFilter",
    sheetId,
    filter: filter === null ? null : cloneFilter(filter),
  };
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
