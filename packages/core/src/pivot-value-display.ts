import { createFormulaError, isFormulaError, type FormulaValue } from "./formula/types.js";
import { PIVOT_DISPLAY_TYPES, type PivotValueDisplay } from "./pivot-tables.js";

const FIELD_TYPES = new Set([
  "percent",
  "difference",
  "percentDiff",
  "runTotal",
  "percentOfRunningTotal",
  "percentOfParent",
  "rankAscending",
  "rankDescending",
]);
export function normalizePivotValueDisplay(
  display: PivotValueDisplay,
  rows: number[],
  columns: number[],
): PivotValueDisplay {
  if (!display || !PIVOT_DISPLAY_TYPES.includes(display.type))
    throw new RangeError("Invalid pivot display calculation.");
  if (
    FIELD_TYPES.has(display.type) &&
    (!Number.isInteger(display.baseField) || ![...rows, ...columns].includes(display.baseField!))
  )
    throw new RangeError("Invalid pivot display base field.");
  if (display.baseItem !== undefined) {
    const item = display.baseItem;
    if (
      !item ||
      !["previous", "next", "value"].includes(item.kind) ||
      (item.kind === "value" &&
        !(
          item.value === null ||
          typeof item.value === "boolean" ||
          (typeof item.value === "string" && item.value.length <= 32767) ||
          (typeof item.value === "number" && Number.isFinite(item.value))
        ))
    )
      throw new RangeError("Invalid pivot display base item.");
  }
  if (["percent", "difference", "percentDiff"].includes(display.type) && !display.baseItem)
    throw new RangeError("Missing pivot display base item.");
  return {
    type: display.type,
    ...(FIELD_TYPES.has(display.type) ? { baseField: display.baseField } : {}),
    ...(["percent", "difference", "percentDiff"].includes(display.type) && display.baseItem
      ? { baseItem: { ...display.baseItem } }
      : {}),
  };
}
export type PivotDisplayCache = {
  prepared: Set<string>;
  siblings: Map<string, FormulaValue[]>;
  series: Map<
    string,
    {
      values: FormulaValue[];
      running: FormulaValue[];
      total: FormulaValue;
      ascending: Map<number, number>;
      descending: Map<number, number>;
    }
  >;
};
export function createPivotDisplayCache(): PivotDisplayCache {
  return { prepared: new Set(), siblings: new Map(), series: new Map() };
}
export type PivotDisplayContext = {
  cache?: PivotDisplayCache;
  row: FormulaValue[];
  column: FormulaValue[];
  rowFields: number[];
  columnFields: number[];
  rows: FormulaValue[][];
  columns: FormulaValue[][];
  raw: (row: FormulaValue[], column: FormulaValue[]) => FormulaValue;
};
const key = (value: FormulaValue) => JSON.stringify(value);
function divide(value: FormulaValue, base: FormulaValue): FormulaValue {
  if (isFormulaError(value)) return value;
  if (isFormulaError(base)) return base;
  if (value === null) return null;
  if (typeof base !== "number" || base === 0) return createFormulaError("DIV0");
  const result = (typeof value === "number" ? value : 0) / base;
  return Number.isFinite(result) ? result : createFormulaError("NUM");
}
export function displayPivotValue(
  display: PivotValueDisplay | undefined,
  context: PivotDisplayContext,
): FormulaValue {
  const { row, column, raw } = context;
  const value = raw(row, column);
  const type = display?.type ?? "normal";
  if (type === "normal" || value === null || isFormulaError(value)) return value;
  if (type === "percentOfTotal") return divide(value, raw([], []));
  if (type === "percentOfRow") return divide(value, raw(row, []));
  if (type === "percentOfCol") return divide(value, raw([], column));
  if (type === "percentOfParentRow") return divide(value, raw(row.slice(0, -1), column));
  if (type === "percentOfParentCol") return divide(value, raw(row, column.slice(0, -1)));
  if (type === "index") {
    const grand = raw([], []),
      rowTotal = raw(row, []),
      colTotal = raw([], column);
    for (const v of [grand, rowTotal, colTotal]) if (isFormulaError(v)) return v;
    if (
      typeof value !== "number" ||
      typeof grand !== "number" ||
      typeof rowTotal !== "number" ||
      typeof colTotal !== "number"
    )
      return null;
    const rowRatio = divide(value, rowTotal),
      grandRatio = divide(grand, colTotal);
    if (isFormulaError(rowRatio)) return rowRatio;
    if (isFormulaError(grandRatio)) return grandRatio;
    const result = (rowRatio as number) * (grandRatio as number);
    return Number.isFinite(result) ? result : createFormulaError("NUM");
  }
  const onRows = context.rowFields.includes(display!.baseField!);
  const fields = onRows ? context.rowFields : context.columnFields;
  const members = onRows ? row : column;
  const level = fields.indexOf(display!.baseField!);
  if (level < 0 || members.length <= level) return null;
  const at = (members: FormulaValue[]) => (onRows ? raw(members, column) : raw(row, members));
  if (type === "percentOfParent") return divide(value, at(members.slice(0, level)));
  const cache = context.cache ?? createPivotDisplayCache();
  const groupId = JSON.stringify([onRows, level]);
  const siblingId = (prefix: FormulaValue[]) => JSON.stringify([onRows, level, prefix]);
  if (!cache.prepared.has(groupId)) {
    const seen = new Map<string, Set<string>>();
    for (const entry of onRows ? context.rows : context.columns) {
      const id = siblingId(entry.slice(0, level)),
        item = entry[level] ?? null;
      const groupSeen = seen.get(id) ?? new Set<string>();
      if (!groupSeen.has(key(item))) {
        const items = cache.siblings.get(id) ?? [];
        items.push(item);
        cache.siblings.set(id, items);
        groupSeen.add(key(item));
        seen.set(id, groupSeen);
      }
    }
    cache.prepared.add(groupId);
  }
  const siblings = cache.siblings.get(siblingId(members.slice(0, level))) ?? [];
  const current = siblings.findIndex((item) => key(item) === key(members[level]!));
  const replace = (item: FormulaValue) => [
    ...members.slice(0, level),
    item,
    ...members.slice(level + 1),
  ];
  if (["runTotal", "percentOfRunningTotal", "rankAscending", "rankDescending"].includes(type)) {
    const seriesKey = JSON.stringify([
      onRows,
      level,
      members.slice(0, level),
      members.slice(level + 1),
      onRows ? column : row,
    ]);
    let series = cache.series.get(seriesKey);
    if (!series) {
      const values = siblings.map((item) => at(replace(item)));
      let total: FormulaValue = 0;
      const running = values.map((value) => {
        if (typeof total === "number") {
          if (isFormulaError(value)) total = value;
          else if (typeof value === "number") {
            total += value;
            if (!Number.isFinite(total)) total = createFormulaError("NUM");
          }
        }
        return total;
      });
      const ascending = new Map<number, number>(),
        descending = new Map<number, number>();
      const numbers = values
        .filter((v): v is number => typeof v === "number")
        .sort((a, b) => a - b);
      numbers.forEach((value, index) => {
        if (!ascending.has(value)) ascending.set(value, index + 1);
      });
      numbers.reverse().forEach((value, index) => {
        if (!descending.has(value)) descending.set(value, index + 1);
      });
      series = { values, running, total, ascending, descending };
      cache.series.set(seriesKey, series);
    }
    if (type === "runTotal" || type === "percentOfRunningTotal") {
      const total = series.running[current] ?? null;
      return type === "runTotal" ? total : divide(total, series.total);
    }
    return typeof value === "number"
      ? ((type === "rankAscending" ? series.ascending : series.descending).get(value) ?? null)
      : null;
  }
  const baseItem = display!.baseItem!;
  const item =
    baseItem.kind === "value"
      ? baseItem.value
      : siblings[current + (baseItem.kind === "previous" ? -1 : 1)];
  if (item === undefined) return null;
  // Excel leaves the base item itself blank for differences.
  if (type !== "percent" && key(item) === key(members[level]!)) return null;
  const base = at(replace(item));
  if (isFormulaError(base)) return base;
  if (type === "percent") return divide(value, base);
  if (typeof value !== "number" || typeof base !== "number") return null;
  const difference = value - base;
  return type === "difference"
    ? Number.isFinite(difference)
      ? difference
      : createFormulaError("NUM")
    : divide(difference, base);
}
