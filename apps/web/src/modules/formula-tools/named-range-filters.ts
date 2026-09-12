import type { NamedRangeRow } from "./named-range-types";

export type NamedRangeFilter = "sheet" | "workbook" | "errors" | "no-errors" | "defined" | "table";
const FILTER_GROUPS = [
  ["sheet", "workbook"],
  ["errors", "no-errors"],
  ["defined", "table"],
] as const;

/** A filter toggles independently of other groups; opposite choices replace each other. */
export function updateNamedRangeFilters(
  current: readonly string[],
  next: readonly string[],
): NamedRangeFilter[] {
  const added = next.find((value) => !current.includes(value));
  const group = FILTER_GROUPS.find((items) => items.some((item) => item === added));
  return next.filter(
    (value): value is NamedRangeFilter =>
      FILTER_GROUPS.some((items) => items.some((item) => item === value)) &&
      (!group || value === added || !group.some((item) => item === value)),
  );
}

export function matchesNamedRangeFilters(
  row: NamedRangeRow,
  filters: readonly NamedRangeFilter[],
): boolean {
  return filters.every((filter) => {
    switch (filter) {
      case "sheet":
        return row.scopeSheetId !== undefined;
      case "workbook":
        return row.scopeSheetId === undefined;
      case "errors":
        return row.hasError === true;
      case "no-errors":
        return row.hasError !== true;
      case "defined":
        return (row.kind ?? "defined") === "defined";
      case "table":
        return row.kind === "table";
    }
  });
}
