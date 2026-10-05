import {
  normalizePivotTable,
  type PivotAggregate,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
export type PivotArea = "filters" | "columns" | "rows" | "values";
export type PivotFieldChoice = { field: number; label: string; numeric: boolean };
export type PivotFieldDrag = { field: number; area?: PivotArea; index?: number };
export function pivotAreaFields(table: SheetPivotTable, area: PivotArea): number[] {
  return area === "rows"
    ? table.rowFields
    : area === "columns"
      ? table.columnFields
      : table[area].map((item) => item.field);
}
export function removePivotField(
  table: SheetPivotTable,
  area: PivotArea,
  index: number,
): SheetPivotTable {
  const next = normalizePivotTable(table);
  if (area === "rows") next.rowFields.splice(index, 1);
  else if (area === "columns") next.columnFields.splice(index, 1);
  else next[area].splice(index, 1);
  return next;
}
/** Field identity is exclusive across the three dimension areas; measures may repeat. */
export function placePivotField(
  table: SheetPivotTable,
  drag: PivotFieldDrag,
  area: PivotArea,
  at: number,
  choice: PivotFieldChoice,
  caption: (aggregate: PivotAggregate, field: string) => string,
): SheetPivotTable {
  let next = normalizePivotTable(table);
  const value =
    drag.area === "values" && drag.index !== undefined ? next.values[drag.index] : undefined;
  const filter =
    drag.area === "filters" && drag.index !== undefined ? next.filters[drag.index] : undefined;
  if (drag.area && drag.index !== undefined) {
    next = removePivotField(next, drag.area, drag.index);
    if (drag.area === area && drag.index < at) at--;
  }
  if (area !== "values") {
    const existing = pivotAreaFields(next, area).indexOf(drag.field);
    if (existing >= 0 && existing < at) at--;
    next.rowFields = next.rowFields.filter((field) => field !== drag.field);
    next.columnFields = next.columnFields.filter((field) => field !== drag.field);
    next.filters = next.filters.filter((entry) => entry.field !== drag.field);
  }
  const index = Math.max(0, Math.min(at, pivotAreaFields(next, area).length));
  if (area === "rows") next.rowFields.splice(index, 0, drag.field);
  else if (area === "columns") next.columnFields.splice(index, 0, drag.field);
  else if (area === "filters")
    next.filters.splice(index, 0, filter ?? { field: drag.field, values: [], all: true });
  else {
    const aggregate = choice.numeric ? "sum" : "count";
    next.values.splice(
      index,
      0,
      value ?? { field: drag.field, aggregate, caption: caption(aggregate, choice.label) },
    );
  }
  return next;
}
