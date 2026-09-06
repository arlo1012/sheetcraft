import { strFromU8, unzipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  getCellStyle,
  setCellContent,
  setCellStyle,
  setColumnWidth,
  setRowHeight,
} from "@idea10/core/workbook";
import { serializeWorkbook } from "@idea10/core/serialization";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

describe("XLSX export geometry", () => {
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

  test.each([8, 12, 13, 17, 72])(
    "writes %i CSS pixels as exact point sizes with a complete font",
    async (size) => {
      const workbook = createWorkbook({ id: "fonts", sheetId: "sheet" });
      const sheet = getActiveSheet(workbook);
      setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "text" });
      setCellStyle(sheet, { row: 0, column: 0 }, { fontSize: size, bold: true });
      const result = await encodeXlsx(workbook);
      const fonts = [
        ...strFromU8(unzipSync(result.bytes)["xl/styles.xml"]!).matchAll(/<font>(.*?)<\/font>/g),
      ];
      expect(fonts).toHaveLength(2);
      expect(fonts[1]![1]).toContain(`<sz val="${(size * 3) / 4}"/>`);
      expect(fonts[1]![1]).toContain('<name val="Calibri"/>');
      expect(fonts[1]![1]).not.toContain("<scheme");
      if (Number.isInteger((size * 3) / 4)) {
        const restored = getActiveSheet((await decodeXlsx(result.bytes)).workbook);
        expect(getCellStyle(restored, { row: 0, column: 0 })).toMatchObject({
          fontSize: size,
          bold: true,
        });
      }
    },
  );
});
