import { excelSerialToDateParts, type ExcelDateSystem } from "./formula/date-system.js";
import type { FormulaValue } from "./formula/types.js";

export type PivotDateGroupUnit =
  | "seconds"
  | "minutes"
  | "hours"
  | "days"
  | "months"
  | "quarters"
  | "years";
export type PivotFieldGroup = {
  field: number;
  start: number;
  end: number;
  /** Native groupItems, including the below/above-boundary members. */
  labels?: string[];
  autoStart?: boolean;
  autoEnd?: boolean;
} & (
  | { kind: "number"; interval: number; integerOnly?: boolean }
  | { kind: "date"; unit: PivotDateGroupUnit; interval: number }
);
const units: PivotDateGroupUnit[] = [
  "seconds",
  "minutes",
  "hours",
  "days",
  "months",
  "quarters",
  "years",
];
const dayLabel = (serial: number, system: ExcelDateSystem) => {
  const p = excelSerialToDateParts(Math.floor(serial), system);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};
const formatNumber = (value: number) => String(Number(value.toPrecision(12)));
const numberGroupCount = (group: PivotFieldGroup) =>
  Math.max(1, Math.ceil((group.end - group.start) / group.interval - 1e-10));
export function normalizePivotGroups(
  groups: PivotFieldGroup[] | undefined,
  width: number,
): PivotFieldGroup[] | undefined {
  if (groups === undefined) return undefined;
  if (
    !Array.isArray(groups) ||
    groups.length > 32 ||
    new Set(groups.map((group) => group?.field)).size !== groups.length
  )
    throw new RangeError("Invalid pivot groups.");
  return groups.map((group) => {
    if (
      !group ||
      !Number.isInteger(group.field) ||
      group.field < 0 ||
      group.field >= width ||
      !Number.isFinite(group.start) ||
      !Number.isFinite(group.end) ||
      group.start > group.end ||
      !Number.isFinite(group.interval) ||
      group.interval <= 0 ||
      (group.kind !== "number" && group.kind !== "date") ||
      [group.autoStart, group.autoEnd].some(
        (value) => value !== undefined && typeof value !== "boolean",
      ) ||
      (group.kind === "date" &&
        (!units.includes(group.unit) ||
          group.start < 0 ||
          !Number.isInteger(group.interval) ||
          (group.unit !== "days" && group.interval !== 1))) ||
      (group.kind === "number" &&
        ((group.integerOnly !== undefined && typeof group.integerOnly !== "boolean") ||
          (group.end - group.start) / group.interval > 9997)) ||
      (group.kind === "date" &&
        group.unit === "days" &&
        (Math.floor(group.end) - Math.floor(group.start)) / group.interval > 9997) ||
      (group.labels !== undefined &&
        (!Array.isArray(group.labels) ||
          group.labels.length < 3 ||
          group.labels.length > 10000 ||
          group.labels.some(
            (label) => typeof label !== "string" || !label || label.length > 32767,
          )))
    )
      throw new RangeError("Invalid pivot group.");
    return { ...group, ...(group.labels ? { labels: [...group.labels] } : {}) };
  });
}
export function getPivotGroupLabels(group: PivotFieldGroup, system: ExcelDateSystem): string[] {
  let labels: string[];
  if (group.kind === "number") {
    const count = numberGroupCount(group);
    if (!Number.isInteger(count) || count < 1 || count > 9998)
      throw new RangeError("Pivot grouping exceeds 10,000 items.");
    labels = Array.from({ length: count }, (_, index) => {
      const start = group.start + index * group.interval;
      const next = start + group.interval;
      // An exact upper boundary belongs to the preceding bin, rather than a singleton bin.
      const exactEnd = Math.abs((next - group.end) / group.interval) < 1e-10;
      const high =
        next -
        (group.integerOnly !== false &&
        Number.isInteger(group.interval) &&
        Number.isInteger(group.start) &&
        !exactEnd
          ? 1
          : 0);
      const end = group.autoEnd ? high : Math.min(group.end, high);
      return `${formatNumber(start)}-${formatNumber(end)}`;
    });
  } else {
    const start = excelSerialToDateParts(group.start, system),
      end = excelSerialToDateParts(group.end, system);
    if (group.unit === "years")
      labels = Array.from({ length: end.year - start.year + 1 }, (_, index) =>
        String(start.year + index),
      );
    else if (group.unit === "quarters") labels = ["Q1", "Q2", "Q3", "Q4"];
    else if (group.unit === "months")
      labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    else if (group.unit === "days") {
      if ((Math.floor(group.end) - Math.floor(group.start)) / group.interval > 9997)
        throw new RangeError("Pivot grouping exceeds 10,000 items.");
      labels = Array.from(
        {
          length:
            Math.floor((Math.floor(group.end) - Math.floor(group.start)) / group.interval) + 1,
        },
        (_, index) => dayLabel(Math.floor(group.start) + index * group.interval, system),
      );
    } else
      labels = Array.from({ length: group.unit === "hours" ? 24 : 60 }, (_, index) =>
        String(index).padStart(2, "0"),
      );
  }
  if (labels.length > 9998) throw new RangeError("Pivot grouping exceeds 10,000 items.");
  const generated = [
    `<${group.kind === "number" ? formatNumber(group.start) : dayLabel(group.start, system)}`,
    ...labels,
    `>${group.kind === "number" ? formatNumber(group.end) : dayLabel(group.end, system)}`,
  ];
  if (group.labels && group.labels.length !== generated.length)
    throw new RangeError("Invalid pivot group labels.");
  return group.labels ? [...group.labels] : generated;
}
export function getPivotGroupedValue(
  value: FormulaValue,
  group: PivotFieldGroup,
  system: ExcelDateSystem,
): string {
  return groupedValue(value, group, system, getPivotGroupLabels(group, system));
}
function groupedValue(
  value: FormulaValue,
  group: PivotFieldGroup,
  system: ExcelDateSystem,
  labels: string[],
): string {
  if (typeof value !== "number")
    throw new RangeError(
      "Pivot grouping requires numeric or date values without blanks, text or errors.",
    );
  if (value < group.start) return labels[0]!;
  if (value > group.end) return labels.at(-1)!;
  let index: number;
  if (group.kind === "number")
    index = Math.min(
      numberGroupCount(group) - 1,
      Math.floor((value - group.start) / group.interval + 1e-10),
    );
  else {
    const p = excelSerialToDateParts(value, system);
    const start = excelSerialToDateParts(group.start, system);
    index =
      group.unit === "years"
        ? p.year - start.year
        : group.unit === "quarters"
          ? Math.floor((p.month - 1) / 3)
          : group.unit === "months"
            ? p.month - 1
            : group.unit === "days"
              ? Math.floor((Math.floor(value) - Math.floor(group.start)) / group.interval)
              : group.unit === "hours"
                ? p.hour
                : group.unit === "minutes"
                  ? p.minute
                  : p.second;
  }
  return labels[index + 1]!;
}
export function groupPivotRecords(
  records: FormulaValue[][],
  groups: PivotFieldGroup[] | undefined,
  system: ExcelDateSystem,
): FormulaValue[][] {
  if (!groups?.length) return records;
  // Precompute the bounded label arrays once for the entire source.
  const prepared = groups.map((group) => ({
    ...group,
    labels: getPivotGroupLabels(group, system),
  }));
  return records.map((record) => {
    if (record.every((value) => value === null || value === "")) return record;
    const next = [...record];
    for (const group of prepared)
      next[group.field] = groupedValue(record[group.field] ?? null, group, system, group.labels);
    return next;
  });
}

/** Auto bounds are recalculated only on refresh, never when inspecting an existing cache. */
export function refreshPivotGroupBounds(
  groups: PivotFieldGroup[] | undefined,
  records: FormulaValue[][],
  system: ExcelDateSystem,
): PivotFieldGroup[] | undefined {
  return groups?.map((group) => {
    if (!group.autoStart && !group.autoEnd && group.kind !== "number") return group;
    let min = Infinity,
      max = -Infinity,
      integerOnly = true;
    for (const record of records) {
      if (record.every((value) => value === null || value === "")) continue;
      const value = record[group.field];
      if (typeof value !== "number")
        throw new RangeError("Pivot grouping requires numeric values.");
      min = Math.min(min, value);
      max = Math.max(max, value);
      integerOnly &&= Number.isInteger(value);
    }
    if (min === Infinity) return group;
    const start = group.autoStart ? min : group.start,
      end = group.autoEnd ? max : group.end;
    const numberTypeChanged =
      group.kind === "number" && (group.integerOnly !== false) !== integerOnly;
    if (start === group.start && end === group.end && !numberTypeChanged) return group;
    const next: PivotFieldGroup = { ...group, start, end, labels: undefined };
    if (next.kind === "number") {
      if (integerOnly) delete next.integerOnly;
      else next.integerOnly = false;
    }
    if (
      group.kind === "date" &&
      ["months", "quarters", "hours", "minutes", "seconds"].includes(group.unit) &&
      group.labels
    ) {
      const labels = getPivotGroupLabels(next, system);
      labels.splice(1, labels.length - 2, ...group.labels.slice(1, -1));
      next.labels = labels;
    }
    return next;
  });
}
