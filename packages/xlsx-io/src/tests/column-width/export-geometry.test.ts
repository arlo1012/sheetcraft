import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  getColumnWidth,
  getDefaultColumnWidth,
  getRowHeight,
  setCellContent,
  setCellStyle,
  setColumnWidth,
  setDefaultColumnWidth,
  setRowHeight,
  setSheetDimensionHidden,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

describe("XLSX export geometry", () => {
  test("round-trips hidden axes and a sheet default width without materializing default columns", async () => {
    const workbook = createWorkbook({ id: "hidden-geometry", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setDefaultColumnWidth(sheet, 120);
    setColumnWidth(sheet, 2, 144);
    setRowHeight(sheet, 3, 48);
    setSheetDimensionHidden(sheet, "column", 2, true);
    setSheetDimensionHidden(sheet, "column", 3, true);
    setSheetDimensionHidden(sheet, "row", 3, true);

    const archive = unzipSync((await encodeXlsx(workbook)).bytes);
    const xml = strFromU8(archive["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain('defaultColWidth="17.140625"');
    expect(xml).toContain('<col min="3" max="3" width="20.57421875" hidden="1" customWidth="1"/>');
    expect(xml).toMatch(/<row\b(?=[^>]*\br="4")(?=[^>]*\bht="36")(?=[^>]*\bhidden="1")/);
    expect(xml.match(/<col\b/g) ?? []).toHaveLength(2);

    const encoded = await encodeXlsx(workbook);
    const modifiedArchive = unzipSync(encoded.bytes);
    const source = strFromU8(modifiedArchive["xl/worksheets/sheet1.xml"]!);
    const explicitDefaultArchive = unzipSync(encoded.bytes);
    explicitDefaultArchive["xl/worksheets/sheet1.xml"] = strToU8(
      source.replace(
        /<col min="4" max="4"[^>]*\/>/,
        '<col min="4" max="4" width="17.140625" hidden="1" customWidth="1"/>',
      ),
    );
    const explicitDefault = getActiveSheet(
      (await decodeXlsx(zipSync(explicitDefaultArchive))).workbook,
    );
    expect(explicitDefault.hiddenColumns?.has(3)).toBe(true);
    expect(explicitDefault.columnWidths.has(3)).toBe(false);

    modifiedArchive["xl/worksheets/sheet1.xml"] = strToU8(
      source.replace(/<col min="4" max="4"[^>]*\/>/, '<col min="4" max="4" hidden="1"/>'),
    );
    const restored = getActiveSheet((await decodeXlsx(zipSync(modifiedArchive))).workbook);
    expect(getDefaultColumnWidth(restored)).toBe(120);
    expect(getColumnWidth(restored, 2)).toBe(0);
    expect(restored.columnWidths.get(2)).toBe(144);
    expect(getColumnWidth(restored, 3)).toBe(0);
    expect(restored.hiddenColumns?.has(3)).toBe(true);
    expect(getRowHeight(restored, 3)).toBe(0);
    expect(restored.rowHeights.get(3)).toBe(48);
  });

  test("pins Normal independently of the theme and retains the calibrated column widths", async () => {
    const workbook = createWorkbook({ id: "geometry", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setColumnWidth(sheet, 0, 273);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellStyle(sheet, { row: 0, column: 0 }, { fontSize: 12 });
    const archive = unzipSync((await encodeXlsx(workbook)).bytes);
    const normal = strFromU8(archive["xl/styles.xml"]!).match(/<font>.*?<\/font>/s)![0];
    expect(normal).toContain('<name val="Calibri"/>');
    expect(normal).toContain('<sz val="11"/>');
    expect(normal).not.toContain("<scheme");
    const xml = strFromU8(archive["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain('defaultColWidth="13.7109375"');
    expect(xml).toContain('<col min="1" max="1" width="39.00390625" customWidth="1"/>');
  });

  test("fixes heights of value rows, styled blanks and merged rows without expanding sparse gaps", async () => {
    const workbook = createWorkbook({ id: "rows", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "text" });
    setCellStyle(sheet, { row: 1, column: 0 }, { fontSize: 12 });
    sheet.mergedCells.push({ start: { row: 2, column: 0 }, end: { row: 3, column: 1 } });
    setRowHeight(sheet, 16, 86);
    setCellContent(sheet, { row: 9999, column: 0 }, { kind: "literal", value: "sparse" });
    const before = serializeWorkbook(workbook);
    const result = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(result.bytes)["xl/worksheets/sheet1.xml"]!);
    const rows = [...xml.matchAll(/<row\b([^>]*)>/g)].map((match) => match[1]!);
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row).toContain('customHeight="1"');
      expect(row).toContain(row.startsWith(' r="17"') ? 'ht="64.5"' : 'ht="18"');
    }
    expect(serializeWorkbook(workbook)).toEqual(before);
    const restored = getActiveSheet((await decodeXlsx(result.bytes)).workbook);
    expect([...restored.rowHeights]).toEqual([[16, 86]]);
  });
});
