import { isFormulaError, type FormulaValue } from "./formula/types.js";
import type {
  CellAddress,
  Sheet,
  SheetFilterColumn,
  SheetFilterCondition,
  SheetFilterValue,
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

function matchesCondition(value: SheetFilterValue, condition: SheetFilterCondition): boolean {
  if (condition.kind === "text") {
    const text =
      value.kind === "blank"
        ? ""
        : value.kind === "error"
          ? `#${value.code}!`
          : String(value.value);
    const expected = condition.value;
    switch (condition.operator) {
      case "contains":
        return text.includes(expected);
      case "doesNotContain":
        return !text.includes(expected);
      case "beginsWith":
        return text.startsWith(expected);
      case "endsWith":
        return text.endsWith(expected);
      case "equals":
        return text === expected;
      case "notEquals":
        return text !== expected;
    }
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

/** Value lists and conditions are both active when supplied for a column. */
export function doesSheetFilterColumnMatch(
  column: SheetFilterColumn,
  value: SheetFilterValue,
): boolean {
  const valuesMatch =
    (column.condition !== undefined && column.allowedValues.length === 0) ||
    column.allowedValues.some((allowed) => areSheetFilterValuesEqual(allowed, value));
  return valuesMatch && (!column.condition || matchesCondition(value, column.condition));
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
  return filter.columns.some((column) => {
    const value = getSheetFilterValue(getValue({ row, column: column.column }));
    return !doesSheetFilterColumnMatch(column, value);
  });
}
