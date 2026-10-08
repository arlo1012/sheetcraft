import { describe, expect, test } from "vitest";
import {
  buildPivotResult,
  normalizePivotTable,
  type PivotAxisFilter,
  type PivotValueCondition,
  type SheetPivotTable,
} from "../../pivot-tables.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { createInsertSheetAxisCommand } from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { createSheetEvaluator, getCellStyle } from "../../workbook.js";
import { getSheetChartData } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { fixture } from "./fixture.js";

const greater = (value: number): PivotValueCondition => ({
  kind: "number",
  operator: "greaterThan",
  value,
});
const rowValue = (condition: PivotValueCondition, measure = 0): PivotAxisFilter => ({
  axis: "rows",
  field: 0,
  valueCondition: { measure, condition },
});

describe("pivot field filters", () => {
  test("supports multiple selected members, all members, and an explicitly empty selection", () => {
    const f = fixture([
      ["Region", "Quarter", "Amount"],
      ["East", "Q1", 10],
      ["West", "Q1", 20],
      ["North", "Q1", 30],
    ]);
    const run = (filter: PivotAxisFilter) =>
      buildPivotResult(f.workbook, { ...f.table, axisFilters: [filter] });
    expect(run({ axis: "rows", field: 0 }).sourceRows).toBe(3);
    expect(run({ axis: "rows", field: 0, values: ["East", "North"] }).matrix).toEqual([
      ["Region", "Q1 / Amount", "Grand Total / Amount"],
      ["East", 10, 10],
      ["North", 30, 30],
      ["Grand Total", 40, 40],
    ]);
    const none = run({ axis: "rows", field: 0, values: [] });
    expect(none.sourceRows).toBe(0);
    expect(none.matrix.flat()).not.toContain("East");
    expect(none.matrix.flat()).not.toContain("North");
  });

  test("preserves numeric versus textual member identity and groups blank selections", () => {
    const f = fixture([
      ["Region", "Quarter", "Amount"],
      [1, "Q1", 10],
      ["1", "Q1", 20],
      [null, "Q1", 30],
      ["", "Q1", 40],
    ]);
    expect(
      buildPivotResult(f.workbook, {
        ...f.table,
        axisFilters: [{ axis: "rows", field: 0, values: [1] }],
      }).matrix[1],
    ).toEqual([1, 10, 10]);
    expect(
      buildPivotResult(f.workbook, {
        ...f.table,
        axisFilters: [{ axis: "rows", field: 0, values: [null] }],
      }),
    ).toMatchObject({
      sourceRows: 2,
      matrix: [
        ["Region", "Q1 / Amount", "Grand Total / Amount"],
        ["(blank)", 70, 70],
        ["Grand Total", 70, 70],
      ],
    });
  });

  test("combines text label conditions with manual membership before aggregation", () => {
    const f = fixture();
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      axisFilters: [
        {
          axis: "rows",
          field: 0,
          values: ["East", "West"],
          labelCondition: { kind: "text", operator: "beginsWith", value: "Ea" },
        },
      ],
    });
    expect(result.sourceRows).toBe(3);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 30, 30, 60]);
  });

  test("filters numeric labels by their label rather than their measure", () => {
    const f = fixture([
      ["Region", "Quarter", "Amount"],
      [2, "Q1", 100],
      [3, "Q1", 10],
      [4, "Q1", 20],
    ]);
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      axisFilters: [
        {
          axis: "rows",
          field: 0,
          labelCondition: {
            kind: "number",
            operator: "between",
            value: 3,
            value2: 4,
          },
        },
      ],
    });
    expect(result.sourceRows).toBe(2);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 30, 30]);
  });

  test("compares member sums, retains all source records of accepted members, and recomputes totals", () => {
    const f = fixture();
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      axisFilters: [rowValue(greater(50))],
    });
    expect(result.sourceRows).toBe(3);
    expect(result.matrix).toEqual([
      ["Region", "Q1 / Amount", "Q2 / Amount", "Grand Total / Amount"],
      ["East", 30, 30, 60],
      ["Grand Total", 30, 30, 60],
    ]);
  });

  test.each([
    { aggregate: "count" as const, condition: greater(1), label: "East", total: 3, rows: 3 },
    { aggregate: "average" as const, condition: greater(30), label: "West", total: 40, rows: 1 },
    {
      aggregate: "sum" as const,
      condition: { kind: "rank", bottom: false, percent: false, count: 1 } as PivotValueCondition,
      label: "East",
      total: 60,
      rows: 3,
    },
    {
      aggregate: "sum" as const,
      condition: { kind: "rank", bottom: true, percent: false, count: 1 } as PivotValueCondition,
      label: "West",
      total: 40,
      rows: 1,
    },
    {
      aggregate: "sum" as const,
      condition: { kind: "average", above: true } as PivotValueCondition,
      label: "East",
      total: 60,
      rows: 3,
    },
    {
      aggregate: "sum" as const,
      condition: { kind: "average", above: false } as PivotValueCondition,
      label: "West",
      total: 40,
      rows: 1,
    },
  ])(
    "uses $aggregate member results for $condition.kind rules",
    ({ aggregate, condition, label, total, rows }) => {
      const f = fixture();
      const result = buildPivotResult(f.workbook, {
        ...f.table,
        columnFields: [],
        values: [{ ...f.table.values[0]!, aggregate }],
        axisFilters: [rowValue(condition)],
      });
      expect(result.sourceRows).toBe(rows);
      expect(result.matrix[1]![0]).toBe(label);
      expect(result.matrix.at(-1)).toEqual(["Grand Total", total]);
    },
  );

  test("rank includes tied members and percent rules rank member aggregates", () => {
    const f = fixture([
      ["Region", "Quarter", "Amount"],
      ["A", "Q1", 4],
      ["A", "Q1", 6],
      ["B", "Q1", 10],
      ["C", "Q1", 3],
      ["D", "Q1", 1],
    ]);
    for (const condition of [
      { kind: "rank", bottom: false, percent: false, count: 1 },
      { kind: "rank", bottom: false, percent: true, count: 25 },
    ] as const) {
      const result = buildPivotResult(f.workbook, {
        ...f.table,
        axisFilters: [rowValue(condition)],
      });
      expect(result.sourceRows).toBe(3);
      expect(result.matrix.at(-1)).toEqual(["Grand Total", 20, 20]);
    }
  });

  test("uses the selected value-field index and numeric compound conditions", () => {
    const f = fixture();
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      columnFields: [],
      values: [f.table.values[0]!, { field: 3, aggregate: "sum", caption: "Units" }],
      axisFilters: [
        rowValue(
          {
            kind: "compound",
            operator: "and",
            conditions: [
              { kind: "number", operator: "greaterThan", value: 8 },
              { kind: "number", operator: "lessThan", value: 10 },
            ],
          },
          1,
        ),
      ],
    });
    expect(result.sourceRows).toBe(3);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 60, 9]);
  });

  test("applies page and axis member selections before evaluating aggregate conditions", () => {
    const f = fixture();
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      filters: [{ field: 1, values: ["Q1"] }],
      axisFilters: [rowValue(greater(35)), { axis: "columns", field: 1, values: ["Q1"] }],
    });
    expect(result.sourceRows).toBe(1);
    expect(result.matrix).toEqual([
      ["Region", "Q1 / Amount", "Grand Total / Amount"],
      ["West", 40, 40],
      ["Grand Total", 40, 40],
    ]);
  });

  test("evaluates simultaneous row and column criteria against the same pre-value-filter records", () => {
    const f = fixture();
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      axisFilters: [
        rowValue(greater(50)),
        {
          axis: "columns",
          field: 1,
          valueCondition: { measure: 0, condition: greater(40) },
        },
      ],
    });
    expect(result.sourceRows).toBe(2);
    expect(result.matrix).toEqual([
      ["Region", "Q1 / Amount", "Grand Total / Amount"],
      ["East", 30, 30],
      ["Grand Total", 30, 30],
    ]);
    expect(
      buildPivotResult(f.workbook, {
        ...f.table,
        axisFilters: [
          { axis: "columns", field: 1, valueCondition: { measure: 0, condition: greater(40) } },
          rowValue(greater(50)),
        ],
      }).matrix,
    ).toEqual(result.matrix);
  });

  test("clones nested conditions and selected member arrays", () => {
    const f = fixture();
    const table: SheetPivotTable = {
      ...f.table,
      axisFilters: [
        {
          ...rowValue({
            kind: "compound",
            operator: "or",
            conditions: [
              { kind: "number", operator: "greaterThan", value: 50 },
              { kind: "number", operator: "lessThan", value: 20 },
            ],
          }),
          values: ["East"],
          labelCondition: { kind: "text", operator: "contains", value: "Ea" },
        },
      ],
    };
    const clone = normalizePivotTable(table);
    clone.axisFilters![0]!.values![0] = "West";
    const label = clone.axisFilters![0]!.labelCondition!;
    if (label.kind === "text") label.value = "We";
    const condition = clone.axisFilters![0]!.valueCondition!.condition;
    if (condition.kind === "compound") condition.conditions[0].value = 100;
    expect(table.axisFilters![0]).toMatchObject({
      values: ["East"],
      labelCondition: { value: "Ea" },
      valueCondition: { condition: { conditions: [{ value: 50 }, { value: 20 }] } },
    });
  });

  test.each([
    { axis: "rows", field: 1 },
    { axis: "columns", field: 0 },
    { axis: "rows", field: 0, values: [Number.NaN] },
    { axis: "rows", field: 0, valueCondition: { measure: -1, condition: greater(0) } },
    { axis: "rows", field: 0, valueCondition: { measure: 1, condition: greater(0) } },
    {
      axis: "rows",
      field: 0,
      valueCondition: { measure: 0, condition: { kind: "text", operator: "contains", value: "1" } },
    },
    {
      axis: "rows",
      field: 0,
      labelCondition: { kind: "rank", bottom: false, percent: false, count: 1 },
    },
    {
      axis: "rows",
      field: 0,
      valueCondition: {
        measure: 0,
        condition: {
          kind: "compound",
          operator: "and",
          conditions: [{ kind: "text", operator: "contains", value: "1" }, greater(0)],
        },
      },
    },
  ])("rejects invalid filter definitions %# without writing output", (filter) => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, {
          ...f.table,
          axisFilters: [filter as PivotAxisFilter],
        }),
      ),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("rejects duplicate rules for one axis field", () => {
    const f = fixture();
    expect(() =>
      normalizePivotTable({
        ...f.table,
        axisFilters: [rowValue(greater(50)), rowValue(greater(20))],
      }),
    ).toThrow();
  });

  test("persists field rules and report colors in V36 with reversible output and chart refresh", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.table, { chartId: "filtered-chart" }),
    );
    const before = serializeWorkbook(f.workbook);
    const next: SheetPivotTable = {
      ...f.destination.pivotTables![0]!,
      axisFilters: [rowValue(greater(50))],
      reportLayout: {
        rowLabel: "Rows",
        columnLabel: "Columns",
        allLabel: "All",
        multipleLabel: "Multiple",
        fillColor: "#dcefe7",
        borderColor: "#b9ddcf",
      },
    };
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, next));
    const installed = f.destination.pivotTables![0]!;
    const result = buildPivotResult(f.workbook, installed);
    const output = installed.outputRange!;
    for (let row = result.headerStart; row < result.headerRows; row++) {
      expect(
        getCellStyle(f.destination, {
          row: output.start.row + row,
          column: output.start.column,
        }),
      ).toMatchObject({
        fillColor: "#dcefe7",
        borderBottom: { style: "thin", color: "#b9ddcf" },
      });
    }
    expect(result.totalRow).not.toBeNull();
    expect(
      getCellStyle(f.destination, {
        row: output.start.row + result.totalRow!,
        column: output.start.column,
      }),
    ).toMatchObject({
      fillColor: "#dcefe7",
      borderTop: { style: "thin", color: "#b9ddcf" },
    });
    expect(
      getCellStyle(f.destination, {
        row: output.start.row + result.dataRows[0]!,
        column: output.start.column + result.rowLabelColumns,
      }),
    ).toMatchObject({ fillColor: "#ffffff" });
    const after = serializeWorkbook(f.workbook);
    expect(after.version).toBe(36);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    const sheet = serializeSheet(f.destination);
    expect(serializeSheet(deserializeSheet(sheet))).toEqual(sheet);
    const drawing = f.destination.drawings![0] as SheetChartDrawing;
    expect(
      getSheetChartData(f.destination, drawing.chart, createSheetEvaluator(f.destination))
        .categories,
    ).toEqual(["East"]);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });

  test.each(["axisFilters", "fillColor", "borderColor"] as const)(
    "rejects V36 %s payloads downgraded to V35",
    (feature) => {
      const f = fixture();
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, {
          ...f.table,
          ...(feature === "axisFilters"
            ? { axisFilters: [rowValue(greater(50))] }
            : {
                reportLayout: {
                  rowLabel: "Rows",
                  columnLabel: "Columns",
                  allLabel: "All",
                  multipleLabel: "Multiple",
                  [feature]: "#dcefe7",
                },
              }),
        }),
      );
      const snapshot = serializeWorkbook(f.workbook);
      expect(() => deserializeWorkbook({ ...snapshot, version: 35 })).toThrow();
    },
  );

  test("accepts a V35 pivot without V36-only payloads", () => {
    const f = fixture();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const snapshot = serializeWorkbook(f.workbook);
    expect(serializeWorkbook(deserializeWorkbook({ ...snapshot, version: 35 })).version).toBe(36);
  });

  test("follows source field identities through structural insertion and undo", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, {
        ...f.table,
        axisFilters: [rowValue(greater(50)), { axis: "columns", field: 1, values: ["Q1"] }],
      }),
    );
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, "column", 1));
    expect(f.destination.pivotTables![0]).toMatchObject({
      columnFields: [2],
      values: [{ field: 3 }],
      axisFilters: [
        { axis: "rows", field: 0, valueCondition: { measure: 0 } },
        { axis: "columns", field: 2, values: ["Q1"] },
      ],
    });
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
});
