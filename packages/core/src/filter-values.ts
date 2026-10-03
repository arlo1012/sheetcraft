import { isFormulaError, type FormulaValue } from "./formula/types.js";
import { createCellColorResolver } from "./cell-color.js";
import type {
  CellAddress,
  CellRange,
  Sheet,
  SheetFilterColumn,
  SheetFilterCondition,
  SheetFilter,
  SheetFilterValue,
  SheetFilterValueCondition,
} from "./workbook.js";

function mergedRangeAt(sheet: Sheet, address: CellAddress): CellRange | undefined {
  return sheet.mergedCells.find(
    (range) =>
      address.row >= range.start.row &&
      address.row <= range.end.row &&
      address.column >= range.start.column &&
      address.column <= range.end.column,
  );
}

/** Whether a filter's data rows and criterion columns actually contain a merged cell. */
export function hasSheetFilterMergedCells(
  sheet: Sheet,
  range: CellRange,
  columns: Iterable<number>,
): boolean {
  if (sheet.mergedCells.length === 0) return false;
  const dataStart = range.start.row + 1;
  const selectedColumns = [...new Set(columns)];
  return sheet.mergedCells.some(
    (merged) =>
      merged.end.row >= dataStart &&
      merged.start.row <= range.end.row &&
      selectedColumns.some(
        (column) => column >= merged.start.column && column <= merged.end.column,
      ),
  );
}

/** Materializes relevant merged blocks once for a merged-filter range scan. */
export function createSheetFilterMergedRows(
  sheet: Sheet,
  range: CellRange,
  columns: Iterable<number>,
): ReadonlyMap<number, readonly CellRange[]> {
  const selectedColumns = [...new Set(columns)];
  const dataStart = range.start.row + 1;
  const rows = new Map<number, CellRange[]>();
  for (const merged of sheet.mergedCells) {
    if (
      merged.end.row < dataStart ||
      merged.start.row > range.end.row ||
      !selectedColumns.some(
        (column) => column >= merged.start.column && column <= merged.end.column,
      )
    )
      continue;
    for (
      let row = Math.max(dataStart, merged.start.row);
      row <= Math.min(range.end.row, merged.end.row);
      row += 1
    ) {
      const current = rows.get(row);
      if (current) current.push(merged);
      else rows.set(row, [merged]);
    }
  }
  return rows;
}

/**
 * Coalesces overlapping relevant merged ranges into row blocks. A filter must
 * show or hide one complete block so overlapping merges cannot split rows.
 */
export function getSheetFilterMergedRowBlocks(
  sheet: Sheet,
  range: CellRange,
  columns: Iterable<number>,
): Array<{ start: number; end: number }> {
  const selectedColumns = [...new Set(columns)];
  const dataStart = range.start.row + 1;
  const intervals = sheet.mergedCells
    .filter(
      (merged) =>
        merged.end.row >= dataStart &&
        merged.start.row <= range.end.row &&
        selectedColumns.some(
          (column) => column >= merged.start.column && column <= merged.end.column,
        ),
    )
    .map((merged) => ({
      start: Math.max(dataStart, merged.start.row),
      end: Math.min(range.end.row, merged.end.row),
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const blocks: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const previous = blocks.at(-1);
    if (previous && interval.start <= previous.end)
      previous.end = Math.max(previous.end, interval.end);
    else blocks.push(interval);
  }
  return blocks;
}

function mergedRangeAtRow(
  rows: ReadonlyMap<number, readonly CellRange[]> | undefined,
  address: CellAddress,
): CellRange | undefined {
  return rows
    ?.get(address.row)
    ?.find((range) => address.column >= range.start.column && address.column <= range.end.column);
}

/** Reads a merged cell through its top-left anchor when merged filtering is enabled. */
export function getSheetFilterCellValue(
  sheet: Sheet,
  address: CellAddress,
  getValue: (address: CellAddress) => FormulaValue,
  allowMergedCells = false,
  mergedRows?: ReadonlyMap<number, readonly CellRange[]>,
): SheetFilterValue {
  const merged = allowMergedCells
    ? (mergedRangeAtRow(mergedRows, address) ??
      (sheet.mergedCells.length ? mergedRangeAt(sheet, address) : undefined))
    : undefined;
  return getSheetFilterValue(getValue(merged?.start ?? address));
}

/** Returns the merged block containing a filter cell, when merged filtering is enabled. */
export function getSheetFilterMergedRange(
  sheet: Sheet,
  address: CellAddress,
  allowMergedCells = false,
  mergedRows?: ReadonlyMap<number, readonly CellRange[]>,
): CellRange | undefined {
  return allowMergedCells
    ? (mergedRangeAtRow(mergedRows, address) ??
        (sheet.mergedCells.length ? mergedRangeAt(sheet, address) : undefined))
    : undefined;
}

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

function wildcardPattern(value: string): string {
  let pattern = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === "~" && index + 1 < value.length) {
      pattern += value[index + 1]!.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
      index += 1;
    } else if (character === "*") pattern += ".*";
    else if (character === "?") pattern += ".";
    else pattern += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return pattern;
}

function matchesCondition(value: SheetFilterValue, condition: SheetFilterValueCondition): boolean {
  if (condition.kind === "text") {
    const text =
      value.kind === "blank"
        ? ""
        : value.kind === "error"
          ? `#${value.code}!`
          : String(value.value);
    const pattern = wildcardPattern(condition.value);
    const expression =
      condition.operator === "contains" || condition.operator === "doesNotContain"
        ? pattern
        : condition.operator === "beginsWith"
          ? `^${pattern}`
          : condition.operator === "endsWith"
            ? `${pattern}$`
            : `^${pattern}$`;
    const matches = new RegExp(expression, "iu").test(text);
    return condition.operator === "doesNotContain" || condition.operator === "notEquals"
      ? !matches
      : matches;
  }
  const number = value.kind === "number" ? value.value : Number.NaN;
  const second = condition.value2;
  switch (condition.operator) {
    case "equals":
      return number === condition.value;
    case "notEquals":
      return number !== condition.value;
    case "greaterThan":
      return number > condition.value;
    case "greaterThanOrEqual":
      return number >= condition.value;
    case "lessThan":
      return number < condition.value;
    case "lessThanOrEqual":
      return number <= condition.value;
    case "between":
      return second !== undefined && number >= condition.value && number <= second;
    case "notBetween":
      return second !== undefined && (number < condition.value || number > second);
  }
}

function matchesBasicCondition(value: SheetFilterValue, condition: SheetFilterCondition): boolean {
  if (condition.kind === "compound") {
    const [first, second] = condition.conditions;
    const firstMatches = matchesCondition(value, first);
    return condition.operator === "and"
      ? firstMatches && matchesCondition(value, second)
      : firstMatches || matchesCondition(value, second);
  }
  return condition.kind === "text" || condition.kind === "number" || condition.kind === "date"
    ? matchesCondition(value, condition)
    : false;
}

/** Value lists and conditions are both active when supplied for a column. */
export function doesSheetFilterColumnMatch(
  column: SheetFilterColumn,
  value: SheetFilterValue,
): boolean {
  const valuesMatch =
    (column.condition !== undefined && column.allowedValues.length === 0) ||
    column.allowedValues.some((allowed) => areSheetFilterValuesEqual(allowed, value));
  return valuesMatch && (!column.condition || matchesBasicCondition(value, column.condition));
}

function numericValuesForFilterColumn(
  sheet: Sheet,
  filter: SheetFilter,
  column: number,
  getValue: (address: CellAddress) => FormulaValue,
): number[] {
  const values: number[] = [];
  for (let row = filter.range.start.row + 1; row <= filter.range.end.row; row += 1) {
    const value = getSheetFilterCellValue(
      sheet,
      { row, column },
      getValue,
      filter.allowMergedCells,
    );
    if (value.kind === "number" && Number.isFinite(value.value)) values.push(value.value);
  }
  return values;
}

/** Creates a row-aware matcher for conditions whose result depends on displayed style or column data. */
export function createSheetFilterColumnMatcher(
  sheet: Sheet,
  filter: SheetFilter,
  column: SheetFilterColumn,
  getValue: (address: CellAddress) => FormulaValue,
): (row: number, mergedRows?: ReadonlyMap<number, readonly CellRange[]>) => boolean {
  const condition = column.condition;
  const needsNumbers = condition?.kind === "rank" || condition?.kind === "average";
  const values = needsNumbers
    ? numericValuesForFilterColumn(sheet, filter, column.column, getValue)
    : [];
  const sorted = needsNumbers ? [...values].sort((left, right) => left - right) : [];
  const average = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : Number.NaN;
  const resolveColor =
    condition?.kind === "color" || condition?.kind === "color-set"
      ? createCellColorResolver(sheet, { getComputedValue: getValue })
      : undefined;
  const selectedColors =
    condition?.kind === "color"
      ? new Set([condition.color === null ? null : condition.color.toLowerCase()])
      : condition?.kind === "color-set"
        ? new Set(condition.colors.map((color) => (color === null ? null : color.toLowerCase())))
        : undefined;
  return (row, mergedRows) => {
    const address = { row, column: column.column };
    const merged = getSheetFilterMergedRange(sheet, address, filter.allowMergedCells, mergedRows);
    const value = getSheetFilterCellValue(
      sheet,
      address,
      getValue,
      filter.allowMergedCells,
      mergedRows,
    );
    const valuesMatch =
      (condition !== undefined && column.allowedValues.length === 0) ||
      column.allowedValues.some((allowed) => areSheetFilterValuesEqual(allowed, value));
    if (!valuesMatch || !condition) return valuesMatch;
    if (condition.kind === "color" || condition.kind === "color-set") {
      const color = resolveColor!(merged?.start ?? address, condition.target);
      return color !== undefined && selectedColors!.has(color);
    }
    if (condition.kind === "rank") {
      if (value.kind !== "number" || !Number.isFinite(value.value) || !sorted.length) return false;
      const count = Math.min(
        sorted.length,
        condition.percent
          ? Math.max(1, Math.ceil((sorted.length * condition.count) / 100))
          : condition.count,
      );
      const cutoff = condition.bottom ? sorted[count - 1]! : sorted[sorted.length - count]!;
      return condition.bottom ? value.value <= cutoff : value.value >= cutoff;
    }
    if (condition.kind === "average")
      return (
        value.kind === "number" &&
        Number.isFinite(value.value) &&
        (condition.above ? value.value > average : value.value < average)
      );
    return matchesBasicCondition(value, condition);
  };
}

/** Tests one data row using canonical stored criteria, independently of a rendering layer. */
export function isSheetRowFiltered(
  sheet: Sheet,
  row: number,
  getValue: (address: CellAddress) => FormulaValue,
): boolean {
  return [sheet.filter, ...(sheet.tables ?? []).map((table) => table.filter)].some((filter) => {
    if (!filter || row <= filter.range.start.row || row > filter.range.end.row) return false;
    if (filter.advanced)
      return filter.advanced.hiddenRows.some(
        (interval) => row >= interval.start && row <= interval.end,
      );
    const matchers = filter.columns.map((column) =>
      createSheetFilterColumnMatcher(sheet, filter, column, getValue),
    );
    const doesRowMatch = (candidateRow: number) =>
      matchers.every((matches) => matches(candidateRow));
    if (!doesRowMatch(row)) return true;
    if (!filter.allowMergedCells) return false;
    const block = getSheetFilterMergedRowBlocks(
      sheet,
      filter.range,
      filter.columns.map((column) => column.column),
    ).find((candidate) => row >= candidate.start && row <= candidate.end);
    if (!block) return false;
    for (let blockRow = block.start; blockRow <= block.end; blockRow += 1)
      if (!doesRowMatch(blockRow)) return true;
    return false;
  });
}
