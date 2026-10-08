import { describe, expect, test } from "vitest";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand } from "../../history.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { fixture } from "./fixture.js";

describe("pivot snapshot protocol", () => {
  test("round trips current definitions, output cells, and pivot chart binding", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.table, { chartId: "chart" }),
    );
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(42);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const standalone = serializeSheet(f.destination);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    expect(() => deserializeWorkbook({ ...snapshot, version: 30 })).toThrow();
  });
  test("accepts historical V30 workbooks without pivot payloads", () => {
    const f = fixture();
    const snapshot = serializeWorkbook(f.workbook);
    const previous = {
      ...snapshot,
      version: 30,
      sheets: snapshot.sheets.map(({ pivotTables: _pivots, ...sheet }) => sheet),
    };
    expect(serializeWorkbook(deserializeWorkbook(previous)).version).toBe(42);
  });
  test("round trips V33 empty objects and presentation options", () => {
    const f = fixture();
    const table = {
      ...f.table,
      rowFields: [],
      columnFields: [],
      values: [],
      presentation: {
        layout: "compact" as const,
        subtotals: "bottom" as const,
        repeatLabels: false,
        blankRows: true,
        rowHeaders: false,
        columnHeaders: true,
        bandedRows: false,
        bandedColumns: true,
      },
    };
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, table));
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(42);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const standalone = serializeSheet(f.destination);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
  });
  test.each(["presentation", "resultLayout", "emptyValues", "filterAll"] as const)(
    "rejects V33 %s payloads in a V32 snapshot",
    (feature) => {
      const f = fixture();
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
      const snapshot = serializeWorkbook(f.workbook);
      const historical = {
        ...snapshot,
        version: 32,
        sheets: snapshot.sheets.map((sheet) => ({
          ...sheet,
          pivotTables: sheet.pivotTables?.map(
            ({ resultLayout, presentation: _presentation, ...table }) => ({
              ...table,
              ...(feature === "resultLayout" ? { resultLayout } : {}),
              ...(feature === "emptyValues" ? { values: [] } : {}),
              ...(feature === "filterAll"
                ? { filters: [{ field: 0, values: [], all: true }] }
                : {}),
              ...(feature === "presentation"
                ? {
                    presentation: {
                      layout: "compact",
                      subtotals: "off",
                      repeatLabels: false,
                      blankRows: false,
                      rowHeaders: true,
                      columnHeaders: true,
                      bandedRows: true,
                      bandedColumns: false,
                    },
                  }
                : {}),
            }),
          ),
        })),
      };
      expect(() => deserializeWorkbook(historical)).toThrow();
    },
  );
  test("accepts V32 legacy nonempty pivots with their old tabular layout", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.table, { chartId: "chart" }),
    );
    const snapshot = serializeWorkbook(f.workbook);
    const historical = {
      ...snapshot,
      version: 32,
      sheets: snapshot.sheets.map((sheet) => ({
        ...sheet,
        pivotTables: sheet.pivotTables?.map(
          ({ resultLayout: _layout, presentation: _presentation, dataCache: _cache, ...table }) =>
            table,
        ),
      })),
    };
    const restored = deserializeWorkbook(historical);
    const pivot = restored.sheets.get(f.destination.id)!.pivotTables![0]!;
    expect(pivot.values).toEqual(f.table.values);
    expect(pivot.presentation).toBeUndefined();
    expect(pivot.resultLayout).toBeUndefined();
    expect(serializeWorkbook(restored).version).toBe(42);
  });
});
