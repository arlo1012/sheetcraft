import {
  COUNTIF,
  DATE,
  IF,
  MATCH,
  NA,
  PMT,
  ROUND,
  SUM,
  SUMIFS,
  TEXT,
  WORKDAY,
} from "@formulajs/formulajs";

/** Pure adapter examples: parsed arguments go in, library results come out. */
export const formulaAdapter = {
  sum: (values: unknown[]) => SUM(...values),
  round: (value: number, digits: number) => ROUND(value, digits),
  countIf: (values: unknown[], criteria: string) => COUNTIF(values, criteria),
  sumIfs: (sumRange: unknown[], criteriaRange: unknown[], criteria: string) =>
    SUMIFS(sumRange, criteriaRange, criteria),
  if: (condition: unknown, whenTrue: unknown, whenFalse: unknown) =>
    IF(condition, whenTrue, whenFalse),
  match: (needle: unknown, values: unknown[], matchType: number) =>
    MATCH(needle, values, matchType),
  notAvailable: () => NA(),
  date: (year: number, month: number, day: number) => DATE(year, month, day),
  workday: (start: Date, days: number) => WORKDAY(start, days),
  payment: (rate: number, periods: number, presentValue: number) =>
    PMT(rate, periods, presentValue),
  text: (value: number, format: string) => TEXT(value, format),
};
