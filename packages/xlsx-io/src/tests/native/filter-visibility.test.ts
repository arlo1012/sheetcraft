import {
  applyWorkbookCommand,
  createAddSheetCommand,
  createAddSheetOutlineGroupCommand,
  createClearSheetFilterCommand,
  createCreateTableCommand,
  createSetCellContentCommand,
  createSetSheetDimensionHiddenCommand,
  createSetSheetFilterCriteriaCommand,
  createSheetFilterHiddenRowIntervals,
} from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import {
  MAX_SHEET_ROWS,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { readXlsxDataMetadata, writeXlsxDataMetadata } from "../../data-tools-metadata.js";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { canonicalizeNativeWorksheetXml } from "../../native/worksheet-order.js";

const ROW_VISIBILITY_URI = "{5287BA6D-C3DA-4B63-96FA-DB7F661264EC}";
const ROW_VISIBILITY_NAMESPACE = "https://sheetcraft.dev/xlsx/row-visibility/v1";

function set(workbook: Workbook, sheetId: string, row: number, column: number, value: string) {
  applyWorkbookCommand(
    workbook,
    createSetCellContentCommand(sheetId, { row, column }, { kind: "literal", value }),
  );
}

function worksheet(bytes: Uint8Array, number = 1): string {
  const xml = strFromU8(unzipSync(bytes)[`xl/worksheets/sheet${number}.xml`]!);
  expect(XMLValidator.validate(xml)).toBe(true);
  expect(canonicalizeNativeWorksheetXml(xml)).toBe(xml);
  return xml;
}

function hiddenRows(xml: string): number[] {
  return [...xml.matchAll(/<row\b([^>]*)>/g)].flatMap((row) =>
    /\bhidden="1"/.test(row[1]!) ? [Number(/\br="(\d+)"/.exec(row[1]!)?.[1]) - 1] : [],
  );
}

const range = { start: { row: 3, column: 0 }, end: { row: 8, column: 3 } };
const east = [{ column: 3, allowedValues: [{ kind: "string" as const, value: "East" }] }];

describe("native XLSX applied filter row visibility", () => {
  test("exports command-applied A4:D9 filtering and retains manual overlaps when cleared", async () => {
    const workbook = createWorkbook({ id: "filters", sheetId: "data", sheetName: "SortFilter" });
    const session = createWorkbookSession({ workbook, idFactory: () => "generated" });
    const sheet = getActiveSheet(workbook);
    for (const [offset, value] of ["Region", "East", "East", "East", "West", "West"].entries())
      set(workbook, sheet.id, offset + 3, 3, value);
    for (const row of [2, 9]) set(workbook, sheet.id, row, 3, "West");
    executeWorkbookCommand(session, createSetSheetFilterCriteriaCommand(sheet.id, range, east));
    executeWorkbookCommand(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "row", [5, 7], true),
    );
    const before = serializeWorkbook(workbook);
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([]);
    const xml = worksheet(encoded.bytes);
    expect(xml).toContain('<autoFilter ref="A4:D9">');
    expect(xml).toMatch(/<filterColumn colId="3"><filters>\s*<filter val="East"\/>/);
    expect(xml).toContain('<sheetPr filterMode="1"/>');
    expect(xml).toContain('filterHiddenRows="8"');
    expect(hiddenRows(xml)).toEqual([5, 7, 8]);
    expect(serializeWorkbook(workbook)).toEqual(before);

    const decoded = await decodeXlsx(encoded.bytes);
    const restored = getActiveSheet(decoded.workbook);
    expect(restored.hiddenRows).toEqual(new Set([5, 7]));
    expect(createSheetFilterHiddenRowIntervals(restored)).toEqual([{ start: 7, end: 8 }]);
    applyWorkbookCommand(decoded.workbook, createClearSheetFilterCommand(restored.id));
    expect(createSheetFilterHiddenRowIntervals(restored)).toEqual([]);
    const clearedXml = worksheet((await encodeXlsx(decoded.workbook)).bytes);
    expect(hiddenRows(clearedXml)).toEqual([5, 7]);
    expect(clearedXml).not.toContain('filterMode="1"');
  });

  test("derives formula-valued filter rows with the fresh workbook evaluator", async () => {
    const workbook = createWorkbook({ id: "formulas", sheetId: "input", sheetName: "Input" });
    applyWorkbookCommand(workbook, createAddSheetCommand(workbook, { id: "data", name: "Data" }));
    set(workbook, "input", 0, 0, "East");
    set(workbook, "input", 1, 0, "West");
    set(workbook, "data", 0, 0, "Region");
    for (const row of [1, 2])
      applyWorkbookCommand(
        workbook,
        createSetCellContentCommand(
          "data",
          { row, column: 0 },
          {
            kind: "formula",
            formula: { source: `=Input!A${row}` },
          },
        ),
      );
    applyWorkbookCommand(
      workbook,
      createSetSheetFilterCriteriaCommand(
        "data",
        { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
        [{ column: 0, allowedValues: [{ kind: "string", value: "East" }] }],
      ),
    );
    const encoded = await encodeXlsx(workbook);
    expect(hiddenRows(worksheet(encoded.bytes, 2))).toEqual([2]);
    const restored = (await decodeXlsx(encoded.bytes)).workbook;
    const sheet = [...restored.sheets.values()][1]!;
    expect(sheet.hiddenRows).toEqual(new Set());
    expect(
      createSheetFilterHiddenRowIntervals(sheet, createWorkbookEvaluator(restored, sheet.id)),
    ).toEqual([{ start: 2, end: 2 }]);
  });

  test("writes table-owned criteria and keeps headers, totals and manual hides independent", async () => {
    const workbook = createWorkbook({ id: "table-filters", sheetId: "data", sheetName: "Data" });
    for (const [row, value] of ["Region", "East", "West", "East", "West", "Total"].entries())
      set(workbook, "data", row + 3, 0, value);
    const tableRange = { start: { row: 3, column: 0 }, end: { row: 8, column: 0 } };
    const filterRange = { start: { row: 3, column: 0 }, end: { row: 7, column: 0 } };
    applyWorkbookCommand(
      workbook,
      createCreateTableCommand("data", {
        id: "regions",
        name: "Regions",
        range: tableRange,
        columns: [{ id: "region", name: "Region" }],
        style: createBuiltinTableStyles()[0]!,
        headerRow: true,
        totalRow: true,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter: null,
      }),
    );
    applyWorkbookCommand(
      workbook,
      createSetSheetFilterCriteriaCommand("data", filterRange, [
        { column: 0, allowedValues: [{ kind: "string", value: "East" }] },
      ]),
    );
    applyWorkbookCommand(
      workbook,
      createSetSheetDimensionHiddenCommand("data", "row", [6, 7], true),
    );
    const encoded = await encodeXlsx(workbook);
    const xml = worksheet(encoded.bytes);
    expect(xml).not.toContain("<autoFilter");
    expect(xml).toContain('filterMode="1"');
    expect(hiddenRows(xml)).toEqual([5, 6, 7]);
    const tableXml = strFromU8(unzipSync(encoded.bytes)["xl/tables/table1.xml"]!);
    expect(tableXml).toContain('<autoFilter ref="A4:A8">');
    expect(tableXml).not.toContain("filterMode=");
    const restored = (await decodeXlsx(encoded.bytes)).workbook;
    const sheet = getActiveSheet(restored);
    expect(sheet.filter).toBeNull();
    expect(sheet.tables?.[0]?.filter?.columns).toHaveLength(1);
    expect(sheet.hiddenRows).toEqual(new Set([6, 7]));
    applyWorkbookCommand(restored, createSetSheetFilterCriteriaCommand(sheet.id, filterRange, []));
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([]);
    expect(hiddenRows(worksheet((await encodeXlsx(restored)).bytes))).toEqual([6, 7]);
  });

  test.each([
    { allowedValues: [], expected: [4, 5, 6] },
    { allowedValues: [{ kind: "blank" as const }], expected: [4] },
  ])("materializes sparse blank rows for selection %j", async ({ allowedValues, expected }) => {
    const workbook = createWorkbook({ id: "blank-filter", sheetId: "data" });
    set(workbook, "data", 3, 0, "Header");
    set(workbook, "data", 4, 0, "Value");
    applyWorkbookCommand(
      workbook,
      createSetSheetFilterCriteriaCommand(
        "data",
        { start: { row: 3, column: 0 }, end: { row: 6, column: 0 } },
        [{ column: 0, allowedValues }],
      ),
    );
    const encoded = await encodeXlsx(workbook);
    const xml = worksheet(encoded.bytes);
    expect(hiddenRows(xml)).toEqual(expected);
    if (!allowedValues.length) expect(xml).toContain("<filters></filters>");
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(restored.hiddenRows).toEqual(new Set());
    expect(restored.filter?.columns[0]?.allowedValues).toEqual(allowedValues);
  });

  test("excludes headers and supports filtering the last legal worksheet row", async () => {
    const workbook = createWorkbook({ id: "header-filter", sheetId: "data" });
    const lastRow = MAX_SHEET_ROWS - 1;
    set(workbook, "data", lastRow - 1, 0, "Header");
    set(workbook, "data", lastRow, 0, "West");
    applyWorkbookCommand(
      workbook,
      createSetSheetFilterCriteriaCommand(
        "data",
        { start: { row: lastRow - 1, column: 0 }, end: { row: lastRow, column: 0 } },
        [{ column: 0, allowedValues: [{ kind: "string", value: "East" }] }],
      ),
    );
    const encoded = await encodeXlsx(workbook);
    expect(hiddenRows(worksheet(encoded.bytes))).toEqual([lastRow]);
    expect(getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).hiddenRows).toEqual(
      new Set(),
    );
    applyWorkbookCommand(
      workbook,
      createSetSheetFilterCriteriaCommand(
        "data",
        { start: { row: lastRow - 1, column: 0 }, end: { row: lastRow, column: 0 } },
        [],
      ),
    );
    const unfiltered = worksheet((await encodeXlsx(workbook)).bytes);
    expect(hiddenRows(unfiltered)).toEqual([]);
    expect(unfiltered).not.toContain('filterMode="1"');
  });

  test("rejects filter results larger than the existing hidden-row export limit", async () => {
    const workbook = createWorkbook({ id: "filter-limit", sheetId: "data" });
    applyWorkbookCommand(
      workbook,
      createSetSheetFilterCriteriaCommand(
        "data",
        { start: { row: 0, column: 0 }, end: { row: 200_001, column: 0 } },
        [{ column: 0, allowedValues: [] }],
      ),
    );
    await expect(encodeXlsx(workbook)).rejects.toThrow("hidden-row export limit");
  });

  test("preserves manual hides overlapping collapsed outlines and filters", async () => {
    const workbook = createWorkbook({ id: "outline-filter", sheetId: "data" });
    for (const [row, value] of ["Region", "East", "West", "West"].entries())
      set(workbook, "data", row, 0, value);
    applyWorkbookCommand(
      workbook,
      createSetSheetFilterCriteriaCommand(
        "data",
        { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
        [{ column: 0, allowedValues: [{ kind: "string", value: "East" }] }],
      ),
    );
    applyWorkbookCommand(
      workbook,
      createAddSheetOutlineGroupCommand("data", {
        id: "group",
        axis: "row",
        start: 1,
        end: 2,
        collapsed: true,
      }),
    );
    applyWorkbookCommand(workbook, createSetSheetDimensionHiddenCommand("data", "row", [2], true));
    const restored = (await decodeXlsx((await encodeXlsx(workbook)).bytes)).workbook;
    const sheet = getActiveSheet(restored);
    expect(sheet.hiddenRows).toEqual(new Set([2]));
    expect(sheet.outlineGroups?.[0]).toMatchObject({ start: 1, end: 2, collapsed: true });
    applyWorkbookCommand(restored, createClearSheetFilterCommand(sheet.id));
    expect(hiddenRows(worksheet((await encodeXlsx(restored)).bytes))).toEqual([1, 2]);
  });

  test("reads legacy color-set-only row provenance", async () => {
    const workbook = createWorkbook({ id: "legacy-color", sheetId: "data" });
    for (const [row, value] of ["Region", "East", "West"].entries())
      set(workbook, "data", row, 0, value);
    applyWorkbookCommand(
      workbook,
      createSetSheetFilterCriteriaCommand(
        "data",
        { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
        [
          {
            column: 0,
            allowedValues: [],
            condition: { kind: "color-set", target: "fill", colors: ["#ff0000", "#0000ff"] },
          },
        ],
      ),
    );
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    entries["xl/worksheets/sheet1.xml"] = strToU8(
      xml.replace(
        new RegExp(`<ext uri="${ROW_VISIBILITY_URI.replace(/[{}]/g, "\\$&")}">[\\s\\S]*?<\\/ext>`),
        "",
      ),
    );
    const restored = getActiveSheet((await decodeXlsx(zipSync(entries))).workbook);
    expect(restored.hiddenRows).toEqual(new Set());
    expect(createSheetFilterHiddenRowIntervals(restored)).toEqual([{ start: 1, end: 2 }]);
  });

  test("validates row provenance indices and namespace without treating empty tokens as row zero", async () => {
    const workbook = createWorkbook({ id: "row-provenance", sheetId: "data" });
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    const path = "xl/worksheets/sheet1.xml";
    const xml = strFromU8(entries[path]!);
    for (const namespace of [ROW_VISIBILITY_NAMESPACE, "urn:unrelated"]) {
      entries[path] = strToU8(
        xml.replace(
          "</worksheet>",
          `<extLst><ext uri="${ROW_VISIBILITY_URI}"><sheetcraft:rowVisibility xmlns:sheetcraft="${namespace}" filterHiddenRows=",1,1,-1,1.5,Infinity,1048576,1048575," manualHiddenRows="2"/></ext></extLst></worksheet>`,
        ),
      );
      const result = readXlsxDataMetadata(zipSync(entries))[0]!;
      expect(result.filterHiddenRows).toEqual(
        namespace === ROW_VISIBILITY_NAMESPACE ? [1, 1048575] : undefined,
      );
      expect(result.manualHiddenRows).toEqual(
        namespace === ROW_VISIBILITY_NAMESPACE ? [2] : undefined,
      );
    }
  });

  test("adds provenance beside nested extensions and preserves existing sheet properties", () => {
    const path = "xl/worksheets/sheet1.xml";
    const entries = {
      [path]: strToU8(
        '<worksheet><sheetPr codeName="Data"><tabColor rgb="FFFF0000"/></sheetPr><sheetData/><conditionalFormatting><cfRule><extLst><ext uri="nested"/></extLst></cfRule></conditionalFormatting></worksheet>',
      ),
    };
    writeXlsxDataMetadata(entries, [
      {
        filter: null,
        hiddenRows: [1],
        filterHiddenRows: [1],
        filterMode: true,
        dataValidations: [],
        outlineGroups: [],
      },
    ]);
    const xml = strFromU8(entries[path]!);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain(
      '<sheetPr codeName="Data" filterMode="1"><tabColor rgb="FFFF0000"/></sheetPr>',
    );
    expect(xml).toContain('<cfRule><extLst><ext uri="nested"/></extLst></cfRule>');
    expect(xml).toMatch(/<\/conditionalFormatting><extLst><ext uri="\{5287BA6D/);
  });
});
