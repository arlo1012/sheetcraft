import { isFormulaError, type FormulaValue } from "./formula/types.js";
import { getSheetFilterValue, doesSheetFilterColumnMatch } from "./filter-values.js";
import {
  normalizeSheetFilterCondition,
  type CellValue,
  type SheetFilterCondition,
} from "./workbook.js";
import type { SheetPivotTable } from "./pivot-tables.js";
import {
  addPivotValue,
  createPivotAccumulator,
  getPivotAggregateValue,
  type PivotAccumulator,
} from "./pivot-aggregate.js";

export type PivotLabelCondition = Extract<
  SheetFilterCondition,
  { kind: "text" | "number" | "date" | "compound" }
>;
type NumericCondition = Extract<SheetFilterCondition, { kind: "number" | "date" }> & {
  kind: "number";
};
export type PivotValueCondition =
  | NumericCondition
  | { kind: "compound"; operator: "and" | "or"; conditions: [NumericCondition, NumericCondition] }
  | (Extract<SheetFilterCondition, { kind: "rank" }> & { mode?: "items" | "percent" | "sum" })
  | Extract<SheetFilterCondition, { kind: "average" }>;
export type PivotAxisFilter = {
  axis: "rows" | "columns";
  field: number;
  /** Absent means all members; an empty list means none. */
  values?: CellValue[];
  labelCondition?: PivotLabelCondition;
  valueCondition?: { measure: number; condition: PivotValueCondition };
};
const key = (value: FormulaValue) =>
  value === null || value === "" ? "blank" : JSON.stringify(value);
const primitive = (value: unknown): value is CellValue =>
  value === null ||
  typeof value === "boolean" ||
  (typeof value === "string" && value.length <= 32767) ||
  (typeof value === "number" && Number.isFinite(value));
function condition(
  value: SheetFilterCondition,
  numeric: boolean,
): PivotLabelCondition | PivotValueCondition {
  if (!value || typeof value !== "object") throw new RangeError("Invalid pivot condition.");
  if (numeric && value.kind === "rank") {
    const rank = value as Extract<PivotValueCondition, { kind: "rank" }>;
    const mode = rank.mode ?? (rank.percent ? "percent" : "items");
    if (
      !["items", "percent", "sum"].includes(mode) ||
      typeof rank.bottom !== "boolean" ||
      typeof rank.percent !== "boolean" ||
      !Number.isFinite(rank.count) ||
      rank.count <= 0 ||
      (mode === "items" && (!Number.isInteger(rank.count) || rank.count > 500)) ||
      (mode === "percent" && rank.count > 100)
    )
      throw new RangeError("Invalid pivot rank.");
    return {
      kind: "rank",
      bottom: rank.bottom,
      percent: mode === "percent",
      count: rank.count,
      ...(rank.mode !== undefined ? { mode } : {}),
    };
  }
  const next = normalizeSheetFilterCondition(value);
  const kinds = numeric
    ? ["number", "compound", "rank", "average"]
    : ["text", "number", "date", "compound"];
  if (
    !kinds.includes(next.kind) ||
    (numeric && next.kind === "compound" && next.conditions.some((item) => item.kind !== "number"))
  )
    throw new RangeError("Invalid pivot condition.");
  return next as PivotLabelCondition | PivotValueCondition;
}
export function normalizePivotAxisFilters(table: SheetPivotTable): PivotAxisFilter[] | undefined {
  if (table.axisFilters === undefined) return undefined;
  if (!Array.isArray(table.axisFilters) || table.axisFilters.length > 64)
    throw new RangeError("Invalid pivot axis filters.");
  const seen = new Set<string>();
  return table.axisFilters.map((filter) => {
    if (
      !filter ||
      !["rows", "columns"].includes(filter.axis) ||
      !Number.isInteger(filter.field) ||
      !(filter.axis === "rows" ? table.rowFields : table.columnFields).includes(filter.field)
    )
      throw new RangeError("Invalid pivot filter field.");
    const identity = `${filter.axis}:${filter.field}`;
    if (seen.has(identity)) throw new RangeError("Duplicate pivot filter.");
    seen.add(identity);
    if (
      filter.values !== undefined &&
      (!Array.isArray(filter.values) ||
        filter.values.length > 10000 ||
        filter.values.some((value) => !primitive(value)))
    )
      throw new RangeError("Invalid pivot filter values.");
    const value = filter.valueCondition;
    if (
      value !== undefined &&
      (!value ||
        typeof value !== "object" ||
        !Number.isInteger(value.measure) ||
        value.measure < 0 ||
        value.measure >= table.values.length)
    )
      throw new RangeError("Invalid pivot filter measure.");
    return {
      axis: filter.axis,
      field: filter.field,
      ...(filter.values !== undefined ? { values: [...filter.values] } : {}),
      ...(filter.labelCondition !== undefined
        ? { labelCondition: condition(filter.labelCondition, false) as PivotLabelCondition }
        : {}),
      ...(value
        ? {
            valueCondition: {
              measure: value.measure,
              condition: condition(value.condition, true) as PivotValueCondition,
            },
          }
        : {}),
    };
  });
}
function matches(value: FormulaValue, rule: PivotLabelCondition): boolean {
  return doesSheetFilterColumnMatch(
    { column: 0, allowedValues: [], condition: rule },
    getSheetFilterValue(value),
  );
}
/** Axis value rules are evaluated on member aggregates, then retained records are reaggregated. */
export function filterPivotRecords(
  table: SheetPivotTable,
  records: FormulaValue[][],
  getValue: (record: FormulaValue[], field: number) => FormulaValue = (record, field) =>
    record[field] ?? null,
): FormulaValue[][] {
  const filters = table.axisFilters ?? [];
  const memberFilters = filters.map((filter) => ({
    filter,
    allowed: filter.values === undefined ? undefined : new Set(filter.values.map(key)),
  }));
  const labelFiltered = records.filter((record) =>
    memberFilters.every(({ filter, allowed }) => {
      const value = record[filter.field] ?? null;
      return (
        (allowed === undefined || allowed.has(key(value))) &&
        (!filter.labelCondition || matches(value, filter.labelCondition))
      );
    }),
  );
  const selections = filters.flatMap((filter) => {
    if (!filter.valueCondition) return [];
    const { measure, condition: rule } = filter.valueCondition;
    const field = table.values[measure]!;
    const members = new Map<string, PivotAccumulator>();
    for (const record of labelFiltered) {
      const member = key(record[filter.field] ?? null);
      const acc = members.get(member) ?? createPivotAccumulator();
      addPivotValue(acc, getValue(record, field.field));
      members.set(member, acc);
    }
    const values = [...members].map(([member, acc]) => ({
      member,
      value: getPivotAggregateValue(acc, field.aggregate),
    }));
    const numbers = values
      .flatMap(({ value }) => (typeof value === "number" ? [value] : []))
      .sort((a, b) => a - b);
    const mean = numbers.reduce((sum, value) => sum + value / numbers.length, 0);
    let cutoff: number | undefined;
    if (rule.kind === "rank" && numbers.length) {
      const mode = rule.mode ?? (rule.percent ? "percent" : "items");
      const ranked = rule.bottom ? numbers : [...numbers].reverse();
      if (mode === "items") cutoff = ranked[Math.min(ranked.length, rule.count) - 1];
      else {
        const target =
          mode === "percent"
            ? (numbers.reduce((sum, value) => sum + value, 0) * rule.count) / 100
            : rule.count;
        let total = 0;
        for (const value of ranked) {
          total += value;
          cutoff = value;
          if (total >= target) break;
        }
      }
    }
    const allowed = new Set(
      values
        .filter(({ value }) => {
          if (value === null || isFormulaError(value)) return false;
          if (rule.kind === "rank")
            return (
              typeof value === "number" &&
              cutoff !== undefined &&
              (rule.bottom ? value <= cutoff : value >= cutoff)
            );
          if (rule.kind === "average")
            return (
              typeof value === "number" &&
              numbers.length > 0 &&
              (rule.above ? value > mean : value < mean)
            );
          return matches(value, rule);
        })
        .map(({ member }) => member),
    );
    return [{ field: filter.field, allowed }];
  });
  return labelFiltered.filter((record) =>
    selections.every(({ field, allowed }) => allowed.has(key(record[field] ?? null))),
  );
}
