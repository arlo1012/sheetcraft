import { describe, expect, test } from "vitest";
import { buildPivotResult, normalizePivotTable, type SheetPivotTable } from "../../pivot-tables.js";
import { fixture } from "./fixture.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand } from "../../history.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";

describe("pivot field sorting", () => {
  test("sorts rows and columns independently", () => {
    const f = fixture();
    const table: SheetPivotTable = {
      ...f.table,
      sortFields: [
        { axis: "rows", field: 0, order: "descending" },
        { axis: "columns", field: 1, order: "ascending" },
      ],
    };
    expect(buildPivotResult(f.workbook, table).matrix).toEqual([
      ["Region", "Q1 / Amount", "Q2 / Amount", "Grand Total / Amount"],
      ["West", 40, 0, 40],
      ["East", 30, 30, 60],
      ["Grand Total", 70, 30, 100],
    ]);
  });

  test("applies different label directions to each hierarchy level", () => {
    const f = fixture([
      ["Region", "Team", "Amount"],
      ["East", "A", 5],
      ["West", "B", 10],
      ["East", "B", 30],
      ["West", "A", 40],
    ]);
    const table: SheetPivotTable = {
      ...f.table,
      rowFields: [0, 1],
      columnFields: [],
      sortFields: [
        { axis: "rows", field: 0, order: "descending" },
        { axis: "rows", field: 1, order: "ascending" },
      ],
    };
    expect(buildPivotResult(f.workbook, table).rowLabels).toEqual([
      "West / A",
      "West / B",
      "East / A",
      "East / B",
    ]);
  });

  test("sorts member aggregates within their parent instead of sorting raw records or global child totals", () => {
    const f = fixture([
      ["Region", "Team", "Amount"],
      ["East", "B", 25],
      ["East", "A", 10],
      ["East", "A", 20],
      ["West", "A", 1],
      ["West", "B", 2],
    ]);
    const table: SheetPivotTable = {
      ...f.table,
      rowFields: [0, 1],
      columnFields: [],
      sortFields: [
        { axis: "rows", field: 0, order: "ascending" },
        { axis: "rows", field: 1, order: "descending", measure: 0 },
      ],
    };
    const result = buildPivotResult(f.workbook, table);
    expect(result.rowLabels).toEqual(["East / A", "East / B", "West / B", "West / A"]);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", "", 58]);
  });

  test("sorts column members by the explicitly selected aggregate measure", () => {
    const f = fixture([
      ["Region", "Quarter", "Amount", "Units"],
      ["East", "Q1", 10, 1],
      ["East", "Q1", 20, 1],
      ["East", "Q2", 30, 20],
      ["West", "Q1", 40, 1],
    ]);
    const table: SheetPivotTable = {
      ...f.table,
      values: [f.table.values[0]!, { field: 3, aggregate: "sum", caption: "Units" }],
      sortFields: [{ axis: "columns", field: 1, order: "descending", measure: 1 }],
    };
    const result = buildPivotResult(f.workbook, table);
    expect(result.matrix[0]).toEqual([
      "Region",
      "Q2 / Amount",
      "Q2 / Units",
      "Q1 / Amount",
      "Q1 / Units",
      "Grand Total / Amount",
      "Grand Total / Units",
    ]);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 30, 20, 70, 3, 100, 23]);
    const ascending = buildPivotResult(f.workbook, {
      ...table,
      sortFields: [{ ...table.sortFields![0]!, order: "ascending" }],
    });
    expect(ascending.matrix[0]![1]).toBe("Q1 / Amount");
  });

  test("clones sort rules without sharing mutable metadata", () => {
    const f = fixture();
    const table: SheetPivotTable = {
      ...f.table,
      sortFields: [{ axis: "rows", field: 0, order: "descending", measure: 0 }],
    };
    const next = normalizePivotTable(table);
    next.sortFields![0]!.order = "ascending";
    expect(table.sortFields![0]!.order).toBe("descending");
  });

  test.each([
    { axis: "rows", field: 1, order: "ascending" },
    { axis: "columns", field: 0, order: "ascending" },
    { axis: "rows", field: 0, order: "ascending", measure: -1 },
    { axis: "rows", field: 0, order: "ascending", measure: 1 },
    { axis: "rows", field: 0, order: "invalid" },
  ])("rejects invalid field sorting definitions %#", (rule) => {
    const f = fixture();
    expect(() =>
      normalizePivotTable({
        ...f.table,
        sortFields: [rule as NonNullable<SheetPivotTable["sortFields"]>[number]],
      }),
    ).toThrow();
  });
});

describe("V38 pivot metadata protocol", () => {
  test.each(["sortFields", "rankMode", "rowFieldIndices"] as const)(
    "round trips %s and rejects only that new payload in V37",
    (feature) => {
      const f = fixture();
      const table: SheetPivotTable = {
        ...f.table,
        ...(feature === "sortFields"
          ? { sortFields: [{ axis: "rows" as const, field: 0, order: "descending" as const }] }
          : {}),
        ...(feature === "rankMode"
          ? {
              axisFilters: [
                {
                  axis: "rows" as const,
                  field: 0,
                  valueCondition: {
                    measure: 0,
                    condition: {
                      kind: "rank" as const,
                      bottom: false,
                      percent: false,
                      mode: "sum" as const,
                      count: 50,
                    },
                  },
                },
              ],
            }
          : {}),
      };
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, table));
      const current = serializeWorkbook(f.workbook);
      const snapshot = {
        ...current,
        sheets: current.sheets.map((sheet) => ({
          ...sheet,
          pivotTables: sheet.pivotTables?.map((pivot) => {
            if (feature === "rowFieldIndices") return pivot;
            const { rowFieldIndices: _indices, ...resultLayout } = pivot.resultLayout!;
            return { ...pivot, resultLayout };
          }),
        })),
      };
      expect(snapshot.version).toBe(38);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(() => deserializeWorkbook({ ...snapshot, version: 37 })).toThrow();
    },
  );

  test("accepts a V37 pivot after omitting V38-only cached field indices", () => {
    const f = fixture();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const current = serializeWorkbook(f.workbook);
    const historical = {
      ...current,
      version: 37,
      sheets: current.sheets.map((sheet) => ({
        ...sheet,
        pivotTables: sheet.pivotTables?.map((pivot) => {
          const { rowFieldIndices: _indices, ...resultLayout } = pivot.resultLayout!;
          return { ...pivot, resultLayout };
        }),
      })),
    };
    expect(serializeWorkbook(deserializeWorkbook(historical)).version).toBe(38);
  });
});
