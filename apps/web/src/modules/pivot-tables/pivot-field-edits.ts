import {
  normalizePivotTable,
  type PivotAggregate,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
export type PivotArea = "filters" | "columns" | "rows" | "values";
export type PivotFieldChoice = {
  field: number;
  label: string;
  numeric: boolean;
  hasNumbers?: boolean;
};
export type PivotFieldDrag = { field: number; area?: PivotArea; index?: number };
export function pivotAreaFields(table: SheetPivotTable, area: PivotArea): number[] {
  return area === "rows"
    ? table.rowFields
    : area === "columns"
      ? table.columnFields
      : table[area].map((item) => item.field);
}
/** Retain rules only for present dimensions and map their selected measure after edits. */
export function reconcilePivotAxisFilters(
  table: SheetPivotTable,
  measureIndices?: readonly number[],
): SheetPivotTable {
  for (const value of table.values) {
    if (
      value.display?.baseField !== undefined &&
      ![...table.rowFields, ...table.columnFields].includes(value.display.baseField)
    )
      value.display = { type: "normal" };
  }
  table.axisFilters = table.axisFilters?.flatMap((filter) => {
    if (!(filter.axis === "rows" ? table.rowFields : table.columnFields).includes(filter.field))
      return [];
    const condition = filter.valueCondition;
    const measure = condition
      ? measureIndices
        ? measureIndices.indexOf(condition.measure)
        : condition.measure
      : -1;
    return [
      {
        ...filter,
        valueCondition:
          condition && measure >= 0 && measure < table.values.length
            ? { ...condition, measure }
            : undefined,
      },
    ];
  });
  table.sortFields = table.sortFields?.flatMap((rule) => {
    if (!(rule.axis === "rows" ? table.rowFields : table.columnFields).includes(rule.field))
      return [];
    const measure =
      rule.measure === undefined
        ? undefined
        : measureIndices
          ? measureIndices.indexOf(rule.measure)
          : rule.measure;
    return [
      {
        ...rule,
        measure:
          measure !== undefined && measure >= 0 && measure < table.values.length
            ? measure
            : undefined,
      },
    ];
  });
  if (!table.sortFields?.length) table.sortFields = undefined;
  if (!table.axisFilters?.length) table.axisFilters = undefined;
  return table;
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
  return reconcilePivotAxisFilters(
    next,
    area === "values" ? table.values.map((_, i) => i).filter((i) => i !== index) : undefined,
  );
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
  const measureIndices = table.values.map((_, index) => index);
  const value =
    drag.area === "values" && drag.index !== undefined ? next.values[drag.index] : undefined;
  const filter =
    drag.area === "filters" && drag.index !== undefined ? next.filters[drag.index] : undefined;
  if (drag.area && drag.index !== undefined) {
    next = removePivotField(next, drag.area, drag.index);
    if (drag.area === "values") measureIndices.splice(drag.index, 1);
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
    measureIndices.splice(
      index,
      0,
      drag.area === "values" && drag.index !== undefined ? drag.index : -1,
    );
    const aggregate = choice.numeric ? "sum" : "count";
    next.values.splice(
      index,
      0,
      value ?? { field: drag.field, aggregate, caption: caption(aggregate, choice.label) },
    );
  }
  next.values.forEach((value, index) => {
    const original = table.values[measureIndices[index] ?? -1]?.display;
    if (original)
      value.display = {
        ...original,
        ...(original.baseItem ? { baseItem: { ...original.baseItem } } : {}),
      };
  });
  next.axisFilters = table.axisFilters;
  next.sortFields = table.sortFields;
  return reconcilePivotAxisFilters(next, measureIndices);
}
