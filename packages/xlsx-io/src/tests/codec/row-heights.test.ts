import { strFromU8, unzipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  setCellStyle,
  setRowHeight,
} from "@idea10/core/workbook";
import { serializeWorkbook } from "@idea10/core/serialization";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

describe("XLSX automatic row heights", () => {
  test("leaves wrapped content rows automatic while preserving explicit and default heights", async () => {
    const workbook = createWorkbook({ id: "automatic-rows", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    for (const row of [0, 1, 2, 9999]) {
      setCellContent(
        sheet,
        { row, column: 0 },
        {
          kind: "literal",
          value: "A long paragraph that should wrap to fit its column. ".repeat(10),
        },
      );
      setCellStyle(sheet, { row, column: 0 }, { wrapText: true });
    }
    setRowHeight(sheet, 1, 96);
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "literal", value: "Plain text" });
    sheet.mergedCells.push({ start: { row: 2, column: 0 }, end: { row: 2, column: 2 } });
    const before = serializeWorkbook(workbook);

    const result = await encodeXlsx(workbook);
    const archive = unzipSync(result.bytes);
    const xml = strFromU8(archive["xl/worksheets/sheet1.xml"]!);
    const rows = [...xml.matchAll(/<row\b([^>]*)>/g)].map((match) => match[1]!);
    expect(rows).toHaveLength(5);
    for (const rowNumber of [1, 10000]) {
      const row = rows.find((attributes) => attributes.startsWith(` r="${rowNumber}"`));
      expect(row).toBeDefined();
      expect(row).not.toMatch(/\b(?:ht|customHeight|bestFit)=/);
    }
    expect(rows.find((row) => row.startsWith(' r="2"'))).toContain('ht="72" customHeight="1"');
    for (const rowNumber of [3, 4]) {
      expect(rows.find((row) => row.startsWith(` r="${rowNumber}"`))).toContain(
        'ht="18" customHeight="1"',
      );
    }
    expect(xml).toContain('defaultRowHeight="18"');
    expect(strFromU8(archive["xl/styles.xml"]!)).toContain('wrapText="1"');
    expect(serializeWorkbook(workbook)).toEqual(before);
    const restored = getActiveSheet((await decodeXlsx(result.bytes)).workbook);
    expect([...restored.rowHeights]).toEqual([[1, 96]]);
  });
});
