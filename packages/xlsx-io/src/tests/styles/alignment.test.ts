import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import type { CellStyle } from "@sheetcraft/core/style";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

function cellFormat(bytes: Uint8Array, address: string): string {
  const entries = unzipSync(bytes);
  const sheet = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
  const styles = strFromU8(entries["xl/styles.xml"]!);
  const cell = sheet.match(new RegExp(`<c r="${address}"[^>]*>`))![0];
  const styleId = Number(cell.match(/ s="(\d+)"/)?.[1] ?? 0);
  const cellXfs = styles.match(/<cellXfs\b[^>]*>(.*?)<\/cellXfs>/s)![1]!;
  return [...cellXfs.matchAll(/<xf\b[^>]*?(?:\/>|>.*?<\/xf>)/gs)][styleId]![0];
}

function workbookWithStyle(style: CellStyle) {
  const workbook = createWorkbook({ id: "alignment", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "value" });
  setCellStyle(sheet, { row: 0, column: 0 }, style);
  return { workbook, sheet };
}

function replaceReadingOrder(bytes: Uint8Array, readingOrder: "0" | "1" | "2"): Uint8Array {
  const archive = unzipSync(bytes);
  const styles = strFromU8(archive["xl/styles.xml"]!);
  archive["xl/styles.xml"] = strToU8(
    styles.replace('readingOrder="1"', `readingOrder="${readingOrder}"`),
  );
  return zipSync(archive);
}

describe("XLSX alignment", () => {
  test.each([
    ["left", "left"],
    ["center", "center"],
    ["right", "right"],
    ["fill", "fill"],
    ["justify", "justify"],
    ["centerContinuous", "centerContinuous"],
    ["distributed", "distributed"],
  ] as const)("writes and reads horizontal %s", async (horizontalAlign, xlsxValue) => {
    const { workbook } = workbookWithStyle({ horizontalAlign });
    const encoded = await encodeXlsx(workbook);
    expect(cellFormat(encoded.bytes, "A1")).toContain(`horizontal="${xlsxValue}"`);

    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(getCellStyle(restored, { row: 0, column: 0 })?.horizontalAlign).toBe(horizontalAlign);
  });

  test.each([
    ["top", "top"],
    ["middle", "center"],
    ["bottom", "bottom"],
    ["justify", "justify"],
    ["distributed", "distributed"],
  ] as const)("writes and reads vertical %s", async (verticalAlign, xlsxValue) => {
    const { workbook } = workbookWithStyle({ verticalAlign });
    const encoded = await encodeXlsx(workbook);
    const format = cellFormat(encoded.bytes, "A1");
    if (verticalAlign === "bottom") expect(format).not.toContain("vertical=");
    else expect(format).toContain(`vertical="${xlsxValue}"`);

    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(getCellStyle(restored, { row: 0, column: 0 })?.verticalAlign).toBe(
      verticalAlign === "bottom" ? undefined : verticalAlign,
    );
  });

  test("keeps general, bottom, context, zero indent, and zero rotation implicit", async () => {
    const { workbook } = workbookWithStyle({
      horizontalAlign: "general",
      verticalAlign: "bottom",
      textDirection: "context",
      indent: 0,
      textRotation: 0,
    });
    const encoded = await encodeXlsx(workbook);
    expect(cellFormat(encoded.bytes, "A1")).not.toContain("<alignment");

    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    const style = getCellStyle(restored, { row: 0, column: 0 });
    expect(style).not.toHaveProperty("horizontalAlign");
    expect(style).not.toHaveProperty("verticalAlign");
    expect(style).not.toHaveProperty("textDirection");
    expect(style).not.toHaveProperty("indent");
    expect(style).not.toHaveProperty("textRotation");
  });

  test("round-trips indentation, shrink-to-fit, rotation, and text direction", async () => {
    const { workbook } = workbookWithStyle({
      indent: 6,
      shrinkToFit: true,
      textRotation: -42,
      textDirection: "rtl",
    });
    const encoded = await encodeXlsx(workbook);
    const format = cellFormat(encoded.bytes, "A1");
    expect(format).toContain('indent="6"');
    expect(format).toContain('shrinkToFit="1"');
    expect(format).toContain('textRotation="132"');
    expect(format).toContain('readingOrder="2"');

    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(getCellStyle(restored, { row: 0, column: 0 })).toMatchObject({
      indent: 6,
      shrinkToFit: true,
      textRotation: -42,
      textDirection: "rtl",
    });
  });

  test.each([
    ["ltr", "1"],
    ["rtl", "2"],
  ] as const)("writes and reads %s text direction", async (textDirection, xlsxValue) => {
    const { workbook } = workbookWithStyle({ textDirection });
    const encoded = await encodeXlsx(workbook);
    expect(cellFormat(encoded.bytes, "A1")).toContain(`readingOrder="${xlsxValue}"`);

    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(getCellStyle(restored, { row: 0, column: 0 })?.textDirection).toBe(textDirection);
  });

  test.each([
    ["0", undefined],
    ["1", "ltr"],
    ["2", "rtl"],
  ] as const)(
    "imports explicit readingOrder=%s without losing its direction",
    async (readingOrder, textDirection) => {
      const { workbook } = workbookWithStyle({ textDirection: "ltr" });
      const encoded = await encodeXlsx(workbook);
      const restored = getActiveSheet(
        (await decodeXlsx(replaceReadingOrder(encoded.bytes, readingOrder))).workbook,
      );
      expect(getCellStyle(restored, { row: 0, column: 0 })?.textDirection).toBe(textDirection);
    },
  );

  test("round-trips stacked vertical text", async () => {
    const { workbook } = workbookWithStyle({ textRotation: "vertical" });
    const encoded = await encodeXlsx(workbook);
    expect(cellFormat(encoded.bytes, "A1")).toContain('textRotation="255"');

    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(getCellStyle(restored, { row: 0, column: 0 })?.textRotation).toBe("vertical");
  });
});
