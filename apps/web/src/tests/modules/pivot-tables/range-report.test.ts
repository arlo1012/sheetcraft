import { describe, expect, test } from "vitest";
import { getCellValue, setCellContent, type CellRange } from "@idea10/core/workbook";
import { usePivotActions } from "../../../modules/pivot-tables/usePivotActions";
import { fixture } from "./fixture";

function reportFixture(range?: CellRange) {
  const f = fixture();
  const actions = usePivotActions({
    getWorkbook: () => f.workbook,
    getSheet: () => f.sheet,
    getRange: () => range ?? { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
    isBusy: () => false,
    flush: f.flush,
    execute: f.execute,
    name: () => "Sales",
    total: () => "Grand Total",
    empty: () => "(blank)",
    sumCaption: (field) => `Sum ${field}`,
    valueCaption: (aggregate, field) => `${aggregate === "sum" ? "Sum" : "Count"} of ${field}`,
    onError: f.onError,
  });
  return {
    ...f,
    actions,
    get sheet() {
      return f.sheet;
    },
  };
}

describe("single-range pivot report actions", () => {
  test("creates ordinary range reports with report layout enabled", () => {
    const f = reportFixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    expect(draft.table.reportLayout).toEqual({
      rowLabel: "Row",
      columnLabel: "Column",
      allLabel: "(All)",
      multipleLabel: "(Multiple Items)",
    });
    f.actions.confirm(draft);
    expect(f.sheet.pivotTables![0]!.reportLayout).toEqual(draft.table.reportLayout);
    expect(f.onError).not.toHaveBeenCalled();
  });

  test.each([
    ["Sum Amount", "Sum of Amount"],
    ["Revenue", "Revenue"],
  ])("upgrades an older report and preserves caption intent: %s", (caption, expected) => {
    const f = reportFixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!);
    expect(f.sheet.pivotTables![0]!.rowFields).toEqual([]);
    expect(f.sheet.pivotTables![0]!.columnFields).toEqual([]);
    expect(f.sheet.pivotTables![0]!.values).toEqual([]);
    expect(getCellValue(f.sheet, { row: 0, column: 0 })).toBeNull();
    expect(
      f.actions.update({
        ...f.sheet.pivotTables![0]!,
        reportLayout: undefined,
        rowFields: [0],
        values: [{ field: 2, aggregate: "sum", caption }],
      }),
    ).toBe(true);
    const updated = f.sheet.pivotTables![0]!;
    expect(updated.reportLayout).toBeDefined();
    expect(updated.values[0]!.caption).toBe(expected);
    expect(getCellValue(f.sheet, { row: 0, column: 1 })).toBe(expected);
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(30);
  });

  test("creates the supplied title1-title4 range as a sparse WPS report with total 275", () => {
    const f = reportFixture({ start: { row: 0, column: 0 }, end: { row: 11, column: 3 } });
    const source = f.source;
    const data = [
      ["title1", "title2", "title3", "title4"],
      ...Array.from({ length: 11 }, (_, i) => [i + 2, 2 * i + 3, 3 * i + 4, 4 * i + 5]),
    ];
    data.forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(source, { row: r, column }, { kind: "literal", value }),
      ),
    );
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!);
    expect(f.sheet.pivotTables![0]!.rowFields).toEqual([]);
    expect(f.sheet.pivotTables![0]!.columnFields).toEqual([]);
    expect(f.sheet.pivotTables![0]!.values).toEqual([]);
    expect(getCellValue(f.sheet, { row: 0, column: 0 })).toBeNull();
    expect(
      f.actions.update({
        ...f.sheet.pivotTables![0]!,
        filters: [{ field: 0, values: [], all: true }],
        columnFields: [1],
        rowFields: [2],
        values: [{ field: 3, aggregate: "sum", caption: "Sum of title4" }],
      }),
    ).toBe(true);
    const cell = (row: number, column: number) => getCellValue(f.sheet, { row, column });
    expect([cell(0, 0), cell(0, 1)]).toEqual(["title1", "(All)"]);
    expect(cell(1, 0)).toBeNull();
    expect([cell(2, 0), cell(2, 1)]).toEqual(["Sum of title4", "title2"]);
    expect([cell(3, 0), cell(3, 1), cell(3, 11), cell(3, 12)]).toEqual([
      "title3",
      3,
      23,
      "Grand Total",
    ]);
    expect([cell(4, 0), cell(4, 1), cell(4, 2), cell(4, 12)]).toEqual([4, 5, null, 5]);
    expect([cell(14, 0), cell(14, 11), cell(15, 0), cell(15, 12)]).toEqual([
      34,
      45,
      "Grand Total",
      275,
    ]);
    expect(f.sheet.pivotTables![0]!.outputRange).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 15, column: 12 },
    });
    expect(f.onError).not.toHaveBeenCalled();
  });
});
