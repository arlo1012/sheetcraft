import {
  createAddSheetOutlineGroupCommand,
  createSetSheetDimensionHiddenCommand,
  createSetSheetDimensionSizesCommand,
} from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  getColumnWidth,
  getRowHeight,
} from "@sheetcraft/core/workbook";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, strToU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { writeXlsxDataMetadata } from "../../data-tools-metadata.js";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { canonicalizeNativeWorksheetXml } from "../../native/worksheet-order.js";

describe("native XLSX outline exports", () => {
  test.each([
    { rowsCollapsed: false, columnsCollapsed: true },
    { rowsCollapsed: true, columnsCollapsed: false },
  ])("roundtrips command-built outlines and explicit dimensions %j", async (state) => {
    const session = createWorkbookSession({
      workbook: createWorkbook({ id: "outline-book", sheetId: "outline", sheetName: "Outline" }),
      idFactory: () => "generated",
    });
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, {
      type: "setCellContents",
      changes: [4, 5, 6, 7].map((row) => ({
        sheetId: sheet.id,
        address: { row, column: 0 },
        content: { kind: "literal", value: `Row ${row + 1}` },
      })),
    });
    executeWorkbookCommand(
      session,
      createSetSheetDimensionSizesCommand(sheet.id, "column", [
        { index: 2, size: 96 },
        { index: 3, size: 120 },
        { index: 4, size: 144 },
      ]),
    );
    executeWorkbookCommand(
      session,
      createSetSheetDimensionSizesCommand(sheet.id, "row", [{ index: 5, size: 40 }]),
    );
    executeWorkbookCommand(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "row", [0], true),
    );
    executeWorkbookCommand(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "column", [0], true),
    );
    for (const group of [
      { id: "rows", axis: "row" as const, start: 4, end: 6, collapsed: state.rowsCollapsed },
      {
        id: "columns",
        axis: "column" as const,
        start: 2,
        end: 3,
        collapsed: state.columnsCollapsed,
      },
    ])
      expect(
        executeWorkbookCommand(session, createAddSheetOutlineGroupCommand(sheet.id, group)),
      ).toBe(true);
    const before = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);

    const encoded = await encodeXlsx(session.workbook);
    expect(encoded.report.issues).toEqual([]);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(canonicalizeNativeWorksheetXml(xml)).toBe(xml);
    expect(xml).toMatch(/<col\b[^>]*min="3"[^>]*outlineLevel="1"[^>]*\/>/);
    expect(xml).toMatch(/<row\b[^>]*r="5"[^>]*outlineLevel="1"[^>]*>/);
    expect(xml.indexOf("<cols>")).toBeLessThan(xml.indexOf("<sheetData>"));
    expect(xml.indexOf("</sheetData>")).toBeLessThan(xml.indexOf("<pageMargins"));
    if (state.columnsCollapsed) expect(xml).toMatch(/<col\b[^>]*min="5"[^>]*collapsed="1"[^>]*\/>/);
    if (state.rowsCollapsed) expect(xml).toMatch(/<row\b[^>]*r="8"[^>]*collapsed="1"[^>]*>/);

    const decoded = await decodeXlsx(encoded.bytes);
    expect(decoded.report.issues).toEqual([
      {
        code: "dimension-approximated",
        severity: "warning",
        count: 2,
        locations: ["Outline!D", "Outline!E"],
      },
    ]);
    const restored = getActiveSheet(decoded.workbook);
    expect(restored.outlineGroups?.map(({ id: _id, ...group }) => group)).toEqual(
      sheet.outlineGroups?.map(({ id: _id, ...group }) => group),
    );
    for (const [column, width] of sheet.columnWidths)
      expect(getColumnWidth(restored, column)).toBe(width);
    expect(getRowHeight(restored, 5)).toBe(40);
    expect(restored.hiddenRows).toEqual(new Set([0]));
    expect(restored.hiddenColumns).toEqual(new Set([0]));
    for (const row of [4, 5, 6, 7])
      expect(getCellContent(restored, { row, column: 0 })).toEqual(
        getCellContent(sheet, { row, column: 0 }),
      );
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });

  test("preserves self-closing row and column terminators when adding outline attributes", () => {
    const path = "xl/worksheets/sheet1.xml";
    const entries = {
      [path]: strToU8(
        '<worksheet><sheetFormatPr defaultRowHeight="18"/><cols><col min="3" max="3" width="12"/><col min="4" max="4" width="15"/><col min="5" max="5" width="18"/></cols><sheetData><row r="5" ht="30" hidden="1"/><row r="6"/><row r="7"/><row r="8"/></sheetData></worksheet>',
      ),
    };
    writeXlsxDataMetadata(entries, [
      {
        filter: null,
        hiddenRows: [],
        dataValidations: [],
        outlineGroups: [
          { axis: "row", start: 4, end: 6, collapsed: true },
          { axis: "column", start: 2, end: 3, collapsed: true },
        ],
      },
    ]);
    const xml = strFromU8(entries[path]!);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(canonicalizeNativeWorksheetXml(xml)).toBe(xml);
    expect(xml).toContain('<row r="5" ht="30" hidden="1" outlineLevel="1"/>');
    expect(xml).toContain('<row r="6" outlineLevel="1" hidden="1"/>');
    expect(xml).toContain('<row r="8" collapsed="1"/>');
    expect(xml).toContain('<col min="3" max="3" width="12" outlineLevel="1" hidden="1"/>');
    expect(xml).toContain('<col min="5" max="5" width="18" collapsed="1"/>');
  });
});
