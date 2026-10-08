import type { ExcelDateSystem } from "@idea10/core/formula";
import type { SheetFilterCondition, SheetFilterValueCondition } from "@idea10/core/workbook";
import {
  buildFilterCondition,
  createFilterConditionDraft,
  type FilterConditionOperator,
} from "./filter-conditions";
import type { FilterConditionAction } from "./filter-condition-actions";

export type FilterValueKind = SheetFilterValueCondition["kind"];
export type CustomFilterRow = {
  kind: FilterValueKind;
  operator: FilterConditionOperator | "";
  value: string;
  value2: string;
};
export type CustomFilterDraft = {
  first: CustomFilterRow;
  second: CustomFilterRow;
  join: "and" | "or";
};

function emptyRow(kind: FilterValueKind): CustomFilterRow {
  return { kind, operator: "", value: "", value2: "" };
}
function rowFor(
  condition: SheetFilterValueCondition,
  dateSystem: ExcelDateSystem,
): CustomFilterRow {
  const draft = createFilterConditionDraft(condition, dateSystem);
  return {
    kind: condition.kind,
    operator: condition.operator,
    value: draft.first,
    value2: draft.second,
  };
}

export function createCustomFilterDraft(
  kind: FilterValueKind,
  condition: SheetFilterCondition | undefined,
  dateSystem: ExcelDateSystem,
  action: FilterConditionAction = "custom",
): CustomFilterDraft {
  const draft: CustomFilterDraft = {
    first: { ...emptyRow(kind), operator: "equals" },
    second: emptyRow(kind),
    join: "and",
  };
  if (action === "custom") {
    if (condition?.kind === "compound") {
      draft.first = rowFor(condition.conditions[0], dateSystem);
      draft.second = rowFor(condition.conditions[1], dateSystem);
      draft.join = condition.operator;
      return draft;
    }
    if (condition?.kind === "text" || condition?.kind === "number" || condition?.kind === "date") {
      draft.first = rowFor(condition, dateSystem);
      if (condition.operator === "between" || condition.operator === "notBetween") {
        draft.first.operator = condition.operator === "between" ? "greaterThanOrEqual" : "lessThan";
        draft.second = {
          ...emptyRow(condition.kind),
          operator: condition.operator === "between" ? "lessThanOrEqual" : "greaterThan",
          value: draft.first.value2,
        };
        draft.first.value2 = "";
        draft.join = condition.operator === "between" ? "and" : "or";
      }
      return draft;
    }
    return draft;
  }
  if (action === "between" || action === "notBetween") {
    draft.first.operator = action === "between" ? "greaterThanOrEqual" : "lessThan";
    draft.second.operator = action === "between" ? "lessThanOrEqual" : "greaterThan";
    draft.join = action === "between" ? "and" : "or";
  } else if (action !== "rank" && action !== "aboveAverage" && action !== "belowAverage") {
    draft.first.operator = action;
  }
  return draft;
}

function buildRow(
  row: CustomFilterRow,
  dateSystem: ExcelDateSystem,
): SheetFilterValueCondition | undefined {
  if (!row.operator) return undefined;
  const textOperator =
    row.operator === "contains" ||
    row.operator === "doesNotContain" ||
    row.operator === "beginsWith" ||
    row.operator === "doesNotBeginWith" ||
    row.operator === "endsWith" ||
    row.operator === "doesNotEndWith";
  const textValue =
    row.kind === "number" &&
    (row.operator === "equals" || row.operator === "notEquals") &&
    row.value.trim() !== "" &&
    !Number.isFinite(Number(row.value));
  const result = buildFilterCondition(
    {
      kind: textOperator || textValue ? "text" : row.kind,
      operator: row.operator,
      first: row.value,
      second: row.value2,
    },
    dateSystem,
  );
  return result.valid ? result.condition : undefined;
}

export function buildCustomFilterCondition(
  draft: CustomFilterDraft,
  dateSystem: ExcelDateSystem,
): SheetFilterCondition | undefined {
  const first = buildRow(draft.first, dateSystem);
  if (!first) return undefined;
  if (!draft.second.operator) return draft.second.value.trim() ? undefined : first;
  const second = buildRow(draft.second, dateSystem);
  return second
    ? { kind: "compound", operator: draft.join, conditions: [first, second] }
    : undefined;
}
