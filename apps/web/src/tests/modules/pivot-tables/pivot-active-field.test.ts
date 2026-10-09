import { describe, expect, test } from "vitest";
import type { SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import { getPivotActiveField } from "../../../modules/pivot-tables/pivot-active-field";
import { fixture } from "./fixture";

function report() {
  const f = fixture();
  f.actions.open();
  const table: SheetPivotTable = {
    ...f.actions.editing.value!.table,
    anchor: { row: 5, column: 3 },
    outputRange: { start: { row: 5, column: 3 }, end: { row: 12, column: 7 } },
    filters: [{ field: 0, values: [], all: true }],
    rowFields: [2],
    columnFields: [1],
    values: [{ field: 3, aggregate: "sum", caption: "Sales total" }],
    resultLayout: {
      labelColumns: 1,
      headerRows: 4,
      dataRows: [4, 5, 6],
      rowLabels: ["A", "B", "C"],
    },
  };
  const headers = ["Region", "Quarter", "Product", "Sales"];
  const active = (row: number, column: number) =>
    getPivotActiveField(table, headers, { row, column });
  return { table, headers, active };
}

describe("pivot active field", () => {
  test("page filter captions and values resolve the page field, not a row field", () => {
    const { active } = report();
    for (const column of [3, 4])
      expect(active(5, column)).toEqual({ area: "filters", index: 0, name: "Region" });
  });
  test("row header and row members resolve their source row field", () => {
    const { active } = report();
    for (const row of [8, 9, 10])
      expect(active(row, 3)).toEqual({ area: "rows", index: 0, name: "Product" });
  });
  test("column field heading and member headings resolve the column field", () => {
    const { active } = report();
    expect(active(7, 4)).toEqual({ area: "columns", index: 0, name: "Quarter" });
    expect(active(8, 4)).toEqual({ area: "columns", index: 0, name: "Quarter" });
  });
  test("outside the report and filter spacer have no active field", () => {
    const { active } = report();
    expect(active(4, 3)).toBeUndefined();
    expect(active(6, 3)).toBeUndefined();
    expect(active(9, 8)).toBeUndefined();
  });
  test("compact nested groups, leaves and subtotals retain their own field ancestry", () => {
    const { table, headers } = report();
    table.filters = [];
    table.rowFields = [0, 1, 2];
    table.columnFields = [];
    table.resultLayout = {
      labelColumns: 1,
      headerRows: 1,
      dataRows: [3],
      rowLabels: ["East / Q1 / Product A"],
      rowFieldIndices: [null, 0, 1, 2, 1, null, 0, null],
    };
    for (const [relativeRow, index] of [
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 1],
      [6, 0],
    ] as const) {
      expect(
        getPivotActiveField(table, headers, {
          row: table.anchor.row + relativeRow,
          column: table.anchor.column,
        }),
      ).toEqual({ area: "rows", index, name: headers[index] });
    }
    for (const relativeRow of [5, 7])
      expect(
        getPivotActiveField(table, headers, {
          row: table.anchor.row + relativeRow,
          column: table.anchor.column,
        }),
      ).toBeUndefined();
  });
});
