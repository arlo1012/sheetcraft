import { describe, expect, test } from "vitest";
import { placePivotField, removePivotField } from "../../../modules/pivot-tables/pivot-field-edits";
import { fixture } from "./fixture";
import type { SheetPivotTable } from "@idea10/core/pivot-tables";
const caption = (aggregate: string, field: string) => `${aggregate} ${field}`;
const numeric = { field: 2, label: "Amount", numeric: true };
function filteredTable(): SheetPivotTable {
  const f = fixture();
  f.actions.open();
  return {
    ...f.actions.editing.value!.table,
    rowFields: [0, 1],
    values: [
      { field: 2, aggregate: "sum", caption: "Total" },
      { field: 2, aggregate: "average", caption: "Average" },
    ],
    axisFilters: [
      {
        axis: "rows",
        field: 0,
        values: ["East"],
        labelCondition: { kind: "text", operator: "beginsWith", value: "E" },
        valueCondition: {
          measure: 1,
          condition: { kind: "number", operator: "greaterThan", value: 15 },
        },
      },
    ],
  };
}
describe("pivot field placement", () => {
  test("measure reorder and deletion keep value rules bound to the same measure", () => {
    const original = filteredTable();
    const reordered = placePivotField(
      original,
      { field: 2, area: "values", index: 1 },
      "values",
      0,
      numeric,
      caption,
    );
    expect(reordered.axisFilters![0]!.valueCondition!.measure).toBe(0);
    expect(reordered.values[0]!.caption).toBe("Average");
    const deletedOther = removePivotField(original, "values", 0);
    expect(deletedOther.axisFilters![0]!.valueCondition!.measure).toBe(0);
    expect(deletedOther.values[0]!.caption).toBe("Average");
    const deletedSelected = removePivotField(original, "values", 1);
    expect(deletedSelected.axisFilters![0]!.valueCondition).toBeUndefined();
    expect(deletedSelected.axisFilters![0]).toMatchObject({
      values: ["East"],
      labelCondition: { value: "E" },
    });
    expect(original.axisFilters![0]!.valueCondition!.measure).toBe(1);
  });
  test("dimension reorder retains its rules while removing or moving its dimension removes them", () => {
    const original = filteredTable();
    const choice = { field: 0, label: "Region", numeric: false };
    const reordered = placePivotField(
      original,
      { field: 0, area: "rows", index: 0 },
      "rows",
      2,
      choice,
      caption,
    );
    expect(reordered.rowFields).toEqual([1, 0]);
    expect(reordered.axisFilters).toEqual(original.axisFilters);
    expect(removePivotField(original, "rows", 1).axisFilters).toEqual(original.axisFilters);
    expect(removePivotField(original, "rows", 0).axisFilters).toBeUndefined();
    const moved = placePivotField(
      original,
      { field: 0, area: "rows", index: 0 },
      "columns",
      0,
      choice,
      caption,
    );
    expect(moved.columnFields).toEqual([0]);
    expect(moved.axisFilters).toBeUndefined();
  });
  test("allows repeated measures with independent settings", () => {
    const f = fixture();
    f.actions.open();
    const original = f.actions.editing.value!.table;
    const first = placePivotField(original, { field: 2 }, "values", 0, numeric, caption);
    const second = placePivotField(first, { field: 2 }, "values", 1, numeric, caption);
    second.values[1]!.aggregate = "average";
    expect(second.values.map((item) => item.aggregate)).toEqual(["sum", "average"]);
    expect(first.values).toHaveLength(1);
    expect(original.values).toEqual([]);
  });
  test("moves dimensions across areas without duplicate field identities", () => {
    const f = fixture();
    f.actions.open();
    const original = { ...f.actions.editing.value!.table, rowFields: [0, 1] };
    const next = placePivotField(
      original,
      { field: 0, area: "rows", index: 0 },
      "filters",
      0,
      { field: 0, label: "Region", numeric: false },
      caption,
    );
    expect(next.rowFields).toEqual([1]);
    expect(next.filters).toEqual([{ field: 0, values: [], all: true }]);
    const moved = placePivotField(
      next,
      { field: 0, area: "filters", index: 0 },
      "columns",
      0,
      { field: 0, label: "Region", numeric: false },
      caption,
    );
    expect(moved.filters).toEqual([]);
    expect(moved.columnFields).toEqual([0]);
    expect(original.rowFields).toEqual([0, 1]);
  });
  test("reorders measures with their aggregation and captions intact", () => {
    const f = fixture();
    f.actions.open();
    const original = {
      ...f.actions.editing.value!.table,
      values: [
        { field: 2, aggregate: "sum" as const, caption: "Total" },
        { field: 2, aggregate: "average" as const, caption: "Average" },
      ],
    };
    const next = placePivotField(
      original,
      { field: 2, area: "values", index: 1 },
      "values",
      0,
      numeric,
      caption,
    );
    expect(next.values.map((item) => item.caption)).toEqual(["Average", "Total"]);
    const removed = removePivotField(next, "values", 0);
    expect(removed.values.map((item) => item.caption)).toEqual(["Total"]);
    expect(next.values).toHaveLength(2);
  });
  test("assigns Count to text measures and preserves selected filter values when reordered", () => {
    const f = fixture();
    f.actions.open();
    const table = f.actions.editing.value!.table;
    expect(
      placePivotField(
        table,
        { field: 0 },
        "values",
        0,
        { field: 0, label: "Region", numeric: false },
        caption,
      ).values[0]!.aggregate,
    ).toBe("count");
    const filtered = {
      ...table,
      filters: [
        { field: 0, values: ["East"], all: false },
        { field: 1, values: [], all: true },
      ],
    };
    const next = placePivotField(
      filtered,
      { field: 0, area: "filters", index: 0 },
      "filters",
      2,
      { field: 0, label: "Region", numeric: false },
      caption,
    );
    expect(next.filters).toEqual([
      { field: 1, values: [], all: true },
      { field: 0, values: ["East"], all: false },
    ]);
  });
});
