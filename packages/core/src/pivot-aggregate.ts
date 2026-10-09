import { createFormulaError, isFormulaError, type FormulaValue } from "./formula/types.js";
import type { PivotAggregate } from "./pivot-tables.js";

export type PivotAccumulator = {
  sum: number;
  product: number;
  m2: number;
  distinct?: Set<string>;
  mean: number;
  count: number;
  countAll: number;
  min: number;
  max: number;
  error?: Extract<FormulaValue, { kind: string }>;
};
export function createPivotAccumulator(): PivotAccumulator {
  return {
    product: 1,
    m2: 0,
    sum: 0,
    mean: 0,
    count: 0,
    countAll: 0,
    min: Infinity,
    max: -Infinity,
  };
}
export function addPivotValue(acc: PivotAccumulator, value: FormulaValue, distinct = false): void {
  if (distinct) {
    acc.distinct ??= new Set();
    acc.distinct.add(
      value === null || value === ""
        ? "blank"
        : isFormulaError(value)
          ? `error:${value.code}`
          : `${typeof value}:${String(value)}`,
    );
  }
  if (value !== null && value !== "") acc.countAll++;
  if (isFormulaError(value)) acc.error ??= value;
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  acc.sum += value;
  acc.product *= value;
  const previousMean = acc.mean;
  acc.count++;
  acc.mean = acc.mean * (1 - 1 / acc.count) + value / acc.count;
  if (acc.count > 1) acc.m2 += (value - previousMean) * (value - acc.mean);
  acc.min = Math.min(acc.min, value);
  acc.max = Math.max(acc.max, value);
}
export function getPivotAggregateValue(
  acc: PivotAccumulator | undefined,
  type: PivotAggregate,
): FormulaValue {
  if (type === "count") return acc?.countAll ?? 0;
  if (type === "countNums") return acc?.count ?? 0;
  if (type === "distinctCount") return acc?.distinct?.size ?? 0;
  if (acc?.error) return acc.error;
  if (type === "stdev" || type === "var" || type === "stdevp" || type === "varp") {
    const sample = type === "stdev" || type === "var";
    if (!acc || acc.count < (sample ? 2 : 1)) return createFormulaError("DIV0");
    const variance = Math.max(0, acc.m2 / (acc.count - (sample ? 1 : 0)));
    const number = type.startsWith("stdev") ? Math.sqrt(variance) : variance;
    return Number.isFinite(number) ? number : createFormulaError("NUM");
  }
  if (!acc?.count) return type === "average" ? null : 0;
  const number =
    type === "product"
      ? acc.product
      : type === "sum"
        ? acc.sum
        : type === "average"
          ? acc.mean
          : type === "min"
            ? acc.min
            : acc.max;
  return Number.isFinite(number) ? number : createFormulaError("NUM");
}
