import { createFormulaError, isFormulaError, type FormulaValue } from "./formula/types.js";
import type { PivotAggregate } from "./pivot-tables.js";

export type PivotAccumulator = {
  sum: number;
  mean: number;
  count: number;
  countAll: number;
  min: number;
  max: number;
  error?: Extract<FormulaValue, { kind: string }>;
};
export function createPivotAccumulator(): PivotAccumulator {
  return { sum: 0, mean: 0, count: 0, countAll: 0, min: Infinity, max: -Infinity };
}
export function addPivotValue(acc: PivotAccumulator, value: FormulaValue): void {
  if (value !== null && value !== "") acc.countAll++;
  if (isFormulaError(value)) acc.error ??= value;
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  acc.sum += value;
  acc.count++;
  acc.mean = acc.mean * (1 - 1 / acc.count) + value / acc.count;
  acc.min = Math.min(acc.min, value);
  acc.max = Math.max(acc.max, value);
}
export function getPivotAggregateValue(
  acc: PivotAccumulator | undefined,
  type: PivotAggregate,
): FormulaValue {
  if (type === "count") return acc?.countAll ?? 0;
  if (acc?.error) return acc.error;
  if (!acc?.count) return type === "average" ? null : 0;
  const number =
    type === "sum" ? acc.sum : type === "average" ? acc.mean : type === "min" ? acc.min : acc.max;
  return Number.isFinite(number) ? number : createFormulaError("NUM");
}
