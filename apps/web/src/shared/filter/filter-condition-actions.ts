export const BASIC_NUMERIC_FILTER_CONDITION_ACTIONS = [
  "equals",
  "notEquals",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
] as const;

export const TEXT_FILTER_CONDITION_ACTIONS = [
  "equals",
  "notEquals",
  "contains",
  "doesNotContain",
  "beginsWith",
  "endsWith",
] as const;

export const NUMERIC_FILTER_CONDITION_ACTIONS = [
  ...BASIC_NUMERIC_FILTER_CONDITION_ACTIONS,
  "between",
  "rank",
  "aboveAverage",
  "belowAverage",
  "custom",
] as const;

export const DATE_FILTER_CONDITION_ACTIONS = [
  ...BASIC_NUMERIC_FILTER_CONDITION_ACTIONS,
  "between",
  "custom",
] as const;

export type FilterConditionAction =
  | (typeof TEXT_FILTER_CONDITION_ACTIONS)[number]
  | (typeof NUMERIC_FILTER_CONDITION_ACTIONS)[number];
