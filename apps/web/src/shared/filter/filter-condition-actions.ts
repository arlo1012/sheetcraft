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
  "doesNotBeginWith",
  "endsWith",
  "doesNotEndWith",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "between",
  "notBetween",
] as const;

export const NUMERIC_FILTER_CONDITION_ACTIONS = [
  ...BASIC_NUMERIC_FILTER_CONDITION_ACTIONS,
  "between",
  "notBetween",
  "rank",
  "aboveAverage",
  "belowAverage",
  "custom",
] as const;

export const DATE_FILTER_CONDITION_ACTIONS = [
  ...BASIC_NUMERIC_FILTER_CONDITION_ACTIONS,
  "between",
  "notBetween",
  "custom",
] as const;

export type FilterConditionAction =
  | (typeof TEXT_FILTER_CONDITION_ACTIONS)[number]
  | (typeof NUMERIC_FILTER_CONDITION_ACTIONS)[number];
