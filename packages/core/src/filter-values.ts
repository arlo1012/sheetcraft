import { isFormulaError, type FormulaValue } from "./formula/types.js";
import { createCellColorResolver } from "./cell-color.js";
import type {
  CellAddress,
  Sheet,
  SheetFilterColumn,
  SheetFilterCondition,
  SheetFilter,
  SheetFilterValue,
  SheetFilterValueCondition,
} from "./workbook.js";

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

export function createSheetFilterColumnMatcher(
  sheet: Sheet,
  filter: SheetFilter,
  column: SheetFilterColumn,
  getValue: (address: CellAddress) => FormulaValue,
): (row: number) => boolean {
  const condition = column.condition;
  const values =
    condition?.kind === "rank" || condition?.kind === "average"
      ? Array.from({ length: filter.range.end.row - filter.range.start.row }, (_, index) =>
          getSheetFilterValue(
            getValue({ row: filter.range.start.row + index + 1, column: column.column }),
          ),
        ).flatMap((value) =>
          value.kind === "number" && Number.isFinite(value.value) ? [value.value] : [],
        )
      : [];
  const sorted = [...values].sort((left, right) => left - right);
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
  return (row) => {
    const address = { row, column: column.column };
    const value = getSheetFilterValue(getValue(address));
    const valuesMatch =
      (condition !== undefined && column.allowedValues.length === 0) ||
      column.allowedValues.some((allowed) => areSheetFilterValuesEqual(allowed, value));
    if (!valuesMatch || !condition) return valuesMatch;
    if (condition.kind === "color" || condition.kind === "color-set") {
      const color = resolveColor!(address, condition.target);
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
  const filter = sheet.filter;
  if (!filter || row <= filter.range.start.row || row > filter.range.end.row) return false;
  if (filter.advanced)
    return filter.advanced.hiddenRows.some(
      (interval) => row >= interval.start && row <= interval.end,
    );
  return filter.columns.some(
    (column) => !createSheetFilterColumnMatcher(sheet, filter, column, getValue)(row),
  );
}
