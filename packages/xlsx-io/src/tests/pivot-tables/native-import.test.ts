import { readExternalFixture } from "../external-fixtures.js";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { createSetPivotTableCommand, createSetCellContentCommand } from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { buildPivotResult } from "@sheetcraft/core/pivot-tables";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { getCellValue, type Workbook } from "@sheetcraft/core/workbook";
import { decodeXlsx, XlsxCompatibilityError } from "../../index.js";
function sheetNamed(workbook: Workbook, name: string) {
  const sheet = [...workbook.sheets.values()].find((sheet) => sheet.name === name);
  if (!sheet) throw new Error(`Missing imported sheet: ${name}`);
  return sheet;
}

describe("independent native XLSX pivot import", () => {
  test("imports an ordinary worksheet pivot without a product extension and allows configuring its fields", async () => {
    const bytes = await readExternalFixture("pivot-closedxml-clean-sources");
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).not.toContain("xl/connections.xml");
    expect(Object.keys(entries)).not.toContain("xl/pivotCache/pivotCacheDefinition5.xml");
    expect(Object.keys(entries)).not.toContain("xl/pivotCache/pivotCacheDefinition6.xml");
    expect(strFromU8(entries["xl/pivotTables/pivotTable3.xml"]!)).not.toContain("urn:sheetcraft");
    const { workbook, report } = await decodeXlsx(bytes);
    expect(report.issues.filter((issue) => issue.severity === "block")).toEqual([]);
    const source = sheetNamed(workbook, "Area Source");
    const destination = sheetNamed(workbook, "Area - PT");
    expect(destination.pivotTables).toHaveLength(1);
    const table = destination.pivotTables![0]!;
    expect(table).toMatchObject({
      name: "PivotTable1",
      sourceSheetId: source.id,
      source: { start: { row: 2, column: 3 }, end: { row: 3, column: 4 } },
      rowFields: [],
      columnFields: [],
      values: [],
    });
    const configured = {
      ...table,
      rowFields: [0],
      values: [{ field: 1, aggregate: "sum" as const, caption: "Value" }],
    };
    const result = buildPivotResult(workbook, configured);
    expect(result.sourceRows).toBe(1);
    expect(result.rowLabels).toEqual(["Cake"]);
    expect(result.matrix.at(-1)!.at(-1)).toBe(1);
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    executeWorkbookCommand(session, createSetPivotTableCommand(destination.id, configured));
    expect(destination.pivotTables![0]!.values).toEqual(configured.values);
  });

  test("imports native consolidation ranges and page assignments, preserves cached cells, and refreshes from source", async () => {
    const bytes = await readExternalFixture("pivot-closedxml-clean-sources");
    const entries = unzipSync(bytes);
    expect(strFromU8(entries["xl/pivotTables/pivotTable7.xml"]!)).not.toContain("urn:sheetcraft");
    const { workbook } = await decodeXlsx(bytes);
    const source = sheetNamed(workbook, "Consolidate");
    const destination = sheetNamed(workbook, "Consolidate - PT");
    expect(destination.pivotTables).toHaveLength(1);
    const table = destination.pivotTables![0]!;
    expect(table).toMatchObject({
      rowFields: [0],
      columnFields: [1],
      values: [{ field: 2, aggregate: "sum", caption: "Sum of Value" }],
      filters: [
        { field: 3, all: true },
        { field: 4, all: true },
      ],
      consolidation: {
        labels: ["Row", "Column", "Value", "Page1", "Page2"],
        pageFields: { mode: "custom", count: 2 },
        ranges: [
          {
            sheetId: source.id,
            range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
            pageItems: ["Cakes", "Cakes"],
          },
          {
            sheetId: source.id,
            range: { start: { row: 0, column: 3 }, end: { row: 1, column: 4 } },
            pageItems: ["Taxes", "Tax1"],
          },
        ],
      },
    });
    expect(getCellValue(destination, { row: 7, column: 3 })).toBeCloseTo(43.21);
    const initial = buildPivotResult(workbook, table);
    expect(initial.sourceRows).toBe(3);
    expect(initial.rowLabels).toEqual(["Cake", "Muffin"]);
    expect(initial.matrix.at(-1)!.at(-1)).toBeCloseTo(43.21);
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(source.id, { row: 1, column: 1 }, { kind: "literal", value: 30 }),
    );
    const beforeRefresh = serializeWorkbook(workbook);
    executeWorkbookCommand(session, createSetPivotTableCommand(destination.id, table));
    const refreshed = destination.pivotTables![0]!;
    expect(getCellValue(destination, refreshed.outputRange!.end)).toBeCloseTo(48.21);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(workbook)).toEqual(beforeRefresh);
  });

  test.each(["grouped", "calculated"] as const)(
    "reports an unsupported %s native cache while preserving its saved output cells",
    async (kind) => {
      const entries = unzipSync(await readExternalFixture("pivot-closedxml-clean-sources"));
      const path = "xl/pivotCache/pivotCacheDefinition7.xml";
      const cache = strFromU8(entries[path]!);
      entries[path] = strToU8(
        kind === "grouped"
          ? cache.replace("</cacheField>", '<fieldGroup base="0"/></cacheField>')
          : cache.replace('<cacheField name="Value"', '<cacheField formula="Value*2" name="Value"'),
      );
      const { workbook, report } = await decodeXlsx(zipSync(entries));
      const destination = sheetNamed(workbook, "Consolidate - PT");
      expect(destination.pivotTables ?? []).toEqual([]);
      expect(getCellValue(destination, { row: 5, column: 3 })).toBeCloseTo(26.21);
      expect(getCellValue(destination, { row: 7, column: 3 })).toBeCloseTo(43.21);
      expect(sheetNamed(workbook, "Area - PT").pivotTables).toHaveLength(1);
      expect(report.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "feature-omitted",
            severity: "warning",
            locations: expect.arrayContaining(["xl/pivotTables/pivotTable7.xml"]),
          }),
        ]),
      );
    },
  );

  test("blocks DTD declarations in a pivot cache during public archive preflight", async () => {
    const entries = unzipSync(await readExternalFixture("pivot-closedxml-clean-sources"));
    const path = "xl/pivotCache/pivotCacheDefinition7.xml";
    entries[path] = strToU8(
      strFromU8(entries[path]!).replace(
        /(<\?xml[^?]*\?>)/,
        '$1<!DOCTYPE pivotCacheDefinition [<!ENTITY nativeTest "forbidden">]>',
      ),
    );
    const decoding = decodeXlsx(zipSync(entries));
    await expect(decoding).rejects.toBeInstanceOf(XlsxCompatibilityError);
    await expect(decoding).rejects.toMatchObject({
      report: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: "archive-invalid",
            severity: "block",
            locations: [path.toLowerCase()],
          }),
        ]),
      },
    });
  });
});
