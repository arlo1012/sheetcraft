import { strFromU8, unzipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "@idea10/core/workbook";
import { serializeWorkbook } from "@idea10/core/serialization";
import { DEFAULT_CELL_FONT_SIZE, type CellStyle } from "@idea10/core/style";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

const implicitAlignmentStyles: Array<CellStyle | undefined> = [
  undefined,
  { fontSize: 12 },
  { bold: true },
  { wrapText: true },
];

function cellFormat(bytes: Uint8Array, address: string) {
  const entries = unzipSync(bytes);
  const sheet = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
  const styles = strFromU8(entries["xl/styles.xml"]!);
  const cell = sheet.match(new RegExp(`<c r="${address}"[^>]*>`))![0];
  const styleId = Number(cell.match(/ s="(\d+)"/)?.[1] ?? 0);
  const cellXfs = styles.match(/<cellXfs\b[^>]*>(.*?)<\/cellXfs>/s)![1]!;
  const formats = [...cellXfs.matchAll(/<xf\b[^>]*?(?:\/>|>.*?<\/xf>)/gs)];
  const format = formats[styleId]![0];
  const fontId = Number(format.match(/ fontId="(\d+)"/)![1]);
  const font = [...styles.matchAll(/<font>(.*?)<\/font>/gs)][fontId]![1]!;
  return { sheet, format, font };
}

describe("XLSX typography", () => {
  test("preserves every supported font-size number in XML and after reimport", async () => {
    const workbook = createWorkbook({ id: "font-sizes", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    for (let size = 8; size <= 72; size += 1) {
      const address = { row: size - 8, column: 0 };
      setCellContent(sheet, address, { kind: "literal", value: size });
      setCellStyle(sheet, address, { fontSize: size, bold: true });
    }
    const before = serializeWorkbook(workbook);
    const result = await encodeXlsx(workbook);
    const restored = getActiveSheet((await decodeXlsx(result.bytes)).workbook);
    for (let size = 8; size <= 72; size += 1) {
      const { font } = cellFormat(result.bytes, `A${size - 7}`);
      expect(font).toContain(`<sz val="${size}"/>`);
      expect(font).toContain('<name val="Calibri"/>');
      expect(font).not.toContain("<scheme");
      expect(getCellStyle(restored, { row: size - 8, column: 0 })).toMatchObject({
        fontSize: size,
        bold: true,
      });
    }
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test.each(implicitAlignmentStyles)(
    "writes implicit vertical centering for style %j",
    async (style) => {
      const workbook = createWorkbook({ id: "default-alignment", sheetId: "sheet" });
      const sheet = getActiveSheet(workbook);
      setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "centered" });
      if (style) setCellStyle(sheet, { row: 0, column: 0 }, style);
      const result = await encodeXlsx(workbook);
      const { font, format } = cellFormat(result.bytes, "A1");
      expect(font).toContain(`<sz val="${style?.fontSize ?? DEFAULT_CELL_FONT_SIZE}"/>`);
      expect(format).toContain('vertical="center"');
      expect(format).not.toContain("horizontal=");
      if (style?.wrapText) expect(format).toContain('wrapText="1"');
      const restored = getActiveSheet((await decodeXlsx(result.bytes)).workbook);
      expect(getCellStyle(restored, { row: 0, column: 0 })?.verticalAlign).toBeUndefined();
    },
  );

  test.each(["top", "middle", "bottom"] as const)(
    "preserves explicit %s alignment with horizontal centering and wrapping",
    async (verticalAlign) => {
      const workbook = createWorkbook({ id: "alignment", sheetId: "sheet" });
      const sheet = getActiveSheet(workbook);
      const style: CellStyle = {
        fontSize: 12,
        verticalAlign,
        horizontalAlign: "center",
        wrapText: true,
      };
      setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "First\nSecond" });
      setCellStyle(sheet, { row: 0, column: 0 }, style);
      const result = await encodeXlsx(workbook);
      const { format } = cellFormat(result.bytes, "A1");
      expect(format).toContain(
        `vertical="${verticalAlign === "middle" ? "center" : verticalAlign}"`,
      );
      expect(format).toContain('horizontal="center"');
      expect(format).toContain('wrapText="1"');
      const restored = getActiveSheet((await decodeXlsx(result.bytes)).workbook);
      const expectedStyle = getCellStyle(sheet, { row: 0, column: 0 });
      expect(expectedStyle).toBeDefined();
      expect(getCellStyle(restored, { row: 0, column: 0 })).toMatchObject(expectedStyle!);
    },
  );

  test("keeps centering on styled blanks and merged cells", async () => {
    const workbook = createWorkbook({ id: "merged", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    sheet.mergedCells.push({ start: { row: 2, column: 0 }, end: { row: 3, column: 1 } });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: "merged" });
    setCellStyle(sheet, { row: 0, column: 0 }, { fillColor: "#112233" });
    const result = await encodeXlsx(workbook);
    expect(cellFormat(result.bytes, "A1").format).toContain('vertical="center"');
    const merged = cellFormat(result.bytes, "A3");
    expect(merged.format).toContain('vertical="center"');
    expect(merged.sheet).toContain('<mergeCell ref="A3:B4"/>');
  });
});
