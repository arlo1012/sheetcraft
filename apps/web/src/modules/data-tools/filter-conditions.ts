import {
  datePartsToExcelSerial,
  excelSerialToDateParts,
  type ExcelDateSystem,
} from "@idea10/core/formula";
import type { SheetFilterValueCondition } from "@idea10/core/workbook";

export type FilterConditionKind = "values" | SheetFilterValueCondition["kind"];
export type FilterConditionOperator = SheetFilterValueCondition["operator"];
export type FilterConditionDraft = {
  kind: FilterConditionKind;
  operator: FilterConditionOperator;
  first: string;
  second: string;
};
export const TEXT_FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "doesNotContain",
  "beginsWith",
  "endsWith",
] as const;
export const NUMBER_FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "between",
  "notBetween",
] as const;

function formatDate(serial: number, dateSystem: ExcelDateSystem): string {
  try {
    const parts = excelSerialToDateParts(serial, dateSystem);
    return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  } catch {
    return String(serial);
  }
}

export function createFilterConditionDraft(
  condition: SheetFilterValueCondition | undefined,
  dateSystem: ExcelDateSystem,
): FilterConditionDraft {
  if (!condition) return { kind: "values", operator: "equals", first: "", second: "" };
  const format = (value: string | number) =>
    condition.kind === "date" && typeof value === "number"
      ? formatDate(value, dateSystem)
      : String(value);
  return {
    kind: condition.kind,
    operator: condition.operator,
    first: format(condition.value),
    second: "value2" in condition && condition.value2 !== undefined ? format(condition.value2) : "",
  };
}

function parseNumber(value: string, kind: "number" | "date", dateSystem: ExcelDateSystem): number {
  if (!value.trim()) return Number.NaN;
  if (kind === "number") return Number(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  try {
    return datePartsToExcelSerial(
      {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      },
      dateSystem,
    );
  } catch {
    return Number.NaN;
  }
}

export function buildFilterCondition(
  draft: FilterConditionDraft,
  dateSystem: ExcelDateSystem,
): { valid: true; condition?: SheetFilterValueCondition } | { valid: false } {
  if (draft.kind === "values") return { valid: true };
  if (draft.kind === "text") {
    if (!TEXT_FILTER_OPERATORS.some((operator) => operator === draft.operator))
      return { valid: false };
    return {
      valid: true,
      condition: {
        kind: "text",
        operator: draft.operator as (typeof TEXT_FILTER_OPERATORS)[number],
        value: draft.first,
      },
    };
  }
  if (!NUMBER_FILTER_OPERATORS.some((operator) => operator === draft.operator))
    return { valid: false };
  const value = parseNumber(draft.first, draft.kind, dateSystem);
  const between = draft.operator === "between" || draft.operator === "notBetween";
  const value2 = between ? parseNumber(draft.second, draft.kind, dateSystem) : undefined;
  if (!Number.isFinite(value) || (between && (!Number.isFinite(value2) || value > value2!)))
    return { valid: false };
  return {
    valid: true,
    condition: {
      kind: draft.kind,
      operator: draft.operator as (typeof NUMBER_FILTER_OPERATORS)[number],
      value,
      ...(value2 === undefined ? {} : { value2 }),
    },
  };
}
