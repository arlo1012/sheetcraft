import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createWorkbook, getActiveSheet, setCellStyle, getCellStyle } from "@idea10/core/workbook";
import { canEditCell } from "@idea10/core";
import { encodeXlsx, decodeXlsx } from "../index.js";

describe("XLSX protection", () => {
  test("roundtrips sheet/workbook protection, unlocked cells and editable ranges", async () => {
    const workbook = createWorkbook({ id: "protection", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    workbook.structureProtected = true;
    sheet.properties.protected = true;
    sheet.protection = {
      editableRanges: [
        {
          name: "Input & more",
          range: { start: { row: 2, column: 2 }, end: { row: 4, column: 3 } },
        },
      ],
      formatCells: true,
      formatColumns: true,
    };
    setCellStyle(sheet, { row: 0, column: 0 }, { unlocked: true });
    const encoded = await encodeXlsx(workbook);
    const files = unzipSync(encoded.bytes);
    expect(strFromU8(files["xl/workbook.xml"]!)).toContain(
      '<workbookProtection lockStructure="1"/>',
    );
    const xml = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain('sheetProtection sheet="1"');
    expect(xml).toContain('formatCells="0"');
    expect(xml).toContain('sqref="C3:D5"');
    expect(strFromU8(files["xl/styles.xml"]!)).toContain('<protection locked="0"');
    const loaded = await decodeXlsx(encoded.bytes);
    const restored = getActiveSheet(loaded.workbook);
    expect(loaded.workbook.structureProtected).toBe(true);
    expect(restored.properties.protected).toBe(true);
    expect(restored.protection).toEqual(sheet.protection);
    expect(getCellStyle(restored, { row: 0, column: 0 })?.unlocked).toBe(true);
    expect(canEditCell(restored, { row: 0, column: 0 })).toBe(true);
    expect(canEditCell(restored, { row: 0, column: 1 })).toBe(false);
    expect(canEditCell(restored, { row: 3, column: 3 })).toBe(true);
  });
  test("preserves configured edit ranges on an unprotected sheet", async () => {
    const workbook = createWorkbook({ id: "unprotected", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    sheet.protection = {
      editableRanges: [
        { name: "Input", range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } } },
      ],
    };
    const loaded = await decodeXlsx((await encodeXlsx(workbook)).bytes);
    expect(getActiveSheet(loaded.workbook).protection).toEqual(sheet.protection);
    expect(getActiveSheet(loaded.workbook).properties.protected).toBe(false);
  });
  test("never converts password-restricted ranges to unrestricted edit exceptions", async () => {
    const workbook = createWorkbook({ id: "restricted", sheetId: "sheet" });
    const files = unzipSync((await encodeXlsx(workbook)).bytes);
    files["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(files["xl/worksheets/sheet1.xml"]!).replace(
        /(<\/sheetData>|<sheetData\s*\/>)/,
        '$1<sheetProtection sheet="1"/><protectedRanges><protectedRange name="Secret" sqref="A1:B2" password="1234"/></protectedRanges>',
      ),
    );
    const loaded = await decodeXlsx(zipSync(files));
    expect(getActiveSheet(loaded.workbook).protection?.editableRanges).toEqual([]);
    expect(loaded.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
  });
});
