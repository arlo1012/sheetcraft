import ExcelJSImport from "exceljs/dist/exceljs.min.js";
import { strFromU8, unzipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { CELL_FILL_PATTERNS, type CellStyle } from "@sheetcraft/core/style";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

const ExcelJS = ExcelJSImport as unknown as { Workbook: new () => any };

async function authoredBytes(configure: (sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(sheet);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function stylesXml(bytes: Uint8Array): string {
  return strFromU8(unzipSync(bytes)["xl/styles.xml"]!);
}

describe("XLSX fills", () => {
  test("round-trips every supported pattern and retains explicitly supplied colors", async () => {
    const workbook = createWorkbook({ id: "pattern-fills", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    for (const [column, fillPattern] of CELL_FILL_PATTERNS.entries()) {
      setCellContent(sheet, { row: 0, column }, { kind: "literal", value: fillPattern });
      setCellStyle(
        sheet,
        { row: 0, column },
        {
          fillPattern,
          fillPatternColor: "#112233",
          fillColor: "#ddeeff",
        },
      );
    }

    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([]);
    const xml = stylesXml(encoded.bytes);
    for (const fillPattern of CELL_FILL_PATTERNS)
      expect(xml).toContain(`<patternFill patternType="${fillPattern}">`);
    expect(xml).toContain('<fgColor rgb="FF112233"/>');
    expect(xml).toContain('<bgColor rgb="FFDDEEFF"/>');

    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    for (const [column, fillPattern] of CELL_FILL_PATTERNS.entries()) {
      expect(getCellStyle(restored, { row: 0, column })).toMatchObject({
        fillPattern,
        fillPatternColor: "#112233",
        fillColor: "#ddeeff",
      });
    }
  });

  test("reads and writes ExcelJS angle and path gradients without losing stops or geometry", async () => {
    const source = await authoredBytes((sheet) => {
      sheet.getCell("A1").value = "angle";
      sheet.getCell("A1").fill = {
        type: "gradient",
        gradient: "angle",
        degree: 0,
        stops: [
          { position: 0, color: { argb: "FF112233" } },
          { position: 0.5, color: { argb: "FF445566" } },
          { position: 1, color: { argb: "FF778899" } },
        ],
      };
      sheet.getCell("B1").value = "path";
      sheet.getCell("B1").fill = {
        type: "gradient",
        gradient: "path",
        center: { left: 0.2, right: 0.7, top: 0.3, bottom: 0.8 },
        stops: [
          { position: 0, color: { argb: "FF102030" } },
          { position: 1, color: { argb: "FFa0b0c0" } },
        ],
      };
    });
    const imported = await decodeXlsx(source);
    expect(imported.report.issues).toEqual([]);
    const sheet = getActiveSheet(imported.workbook);
    expect(getCellStyle(sheet, { row: 0, column: 0 })?.fillGradient).toEqual({
      type: "linear",
      angle: 0,
      stops: [
        { position: 0, color: "#112233" },
        { position: 0.5, color: "#445566" },
        { position: 1, color: "#778899" },
      ],
    });
    expect(getCellStyle(sheet, { row: 0, column: 1 })?.fillGradient).toEqual({
      type: "path",
      left: 0.2,
      right: 0.7,
      top: 0.3,
      bottom: 0.8,
      stops: [
        { position: 0, color: "#102030" },
        { position: 1, color: "#a0b0c0" },
      ],
    });

    const encoded = await encodeXlsx(imported.workbook);
    expect(encoded.report.issues).toEqual([]);
    expect(stylesXml(encoded.bytes)).toContain('<gradientFill degree="0">');
    expect(stylesXml(encoded.bytes)).toContain(
      '<gradientFill type="path" left="0.2" right="0.7" top="0.3" bottom="0.8">',
    );
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(getCellStyle(restored, { row: 0, column: 0 })?.fillGradient).toEqual(
      getCellStyle(sheet, { row: 0, column: 0 })?.fillGradient,
    );
    expect(getCellStyle(restored, { row: 0, column: 1 })?.fillGradient).toEqual(
      getCellStyle(sheet, { row: 0, column: 1 })?.fillGradient,
    );
  });

  test("reports malformed gradients instead of importing a partial fill", async () => {
    const result = await decodeXlsx(
      await authoredBytes((sheet) => {
        sheet.getCell("A1").value = "invalid";
        sheet.getCell("A1").fill = {
          type: "gradient",
          gradient: "angle",
          degree: 20,
          stops: [
            { position: 0.25, color: { argb: "FF112233" } },
            { position: 1, color: { argb: "FF445566" } },
          ],
        };
      }),
    );
    expect(
      getCellStyle(getActiveSheet(result.workbook), { row: 0, column: 0 })?.fillGradient,
    ).toBeUndefined();
    expect(result.report.issues).toEqual([
      { code: "style-omitted", severity: "warning", count: 1, locations: ["Data!A1"] },
    ]);
  });

  test("does not add colors to a pattern when the workbook style omitted them", async () => {
    const workbook = createWorkbook({ id: "pattern-absence", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const style: CellStyle = { fillPattern: "darkGrid" };
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "pattern" });
    setCellStyle(sheet, { row: 0, column: 0 }, style);
    const encoded = await encodeXlsx(workbook);
    expect(stylesXml(encoded.bytes)).toContain('<patternFill patternType="darkGrid"/>');
    expect(
      getCellStyle(getActiveSheet((await decodeXlsx(encoded.bytes)).workbook), {
        row: 0,
        column: 0,
      }),
    ).toMatchObject(style);
  });

  test("warns when an explicit pattern color cannot be represented", async () => {
    const result = await decodeXlsx(
      await authoredBytes((sheet) => {
        sheet.getCell("A1").value = "theme";
        sheet.getCell("A1").fill = {
          type: "pattern",
          pattern: "darkGrid",
          fgColor: { theme: 4 },
          bgColor: { argb: "FF112233" },
        };
        sheet.getCell("B1").value = "indexed";
        sheet.getCell("B1").fill = {
          type: "pattern",
          pattern: "lightGrid",
          fgColor: { argb: "FF445566" },
          bgColor: { indexed: 64 },
        };
      }),
    );
    const sheet = getActiveSheet(result.workbook);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toMatchObject({
      fillPattern: "darkGrid",
      fillColor: "#112233",
    });
    expect(getCellStyle(sheet, { row: 0, column: 0 })?.fillPatternColor).toBeUndefined();
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toMatchObject({
      fillPattern: "lightGrid",
      fillPatternColor: "#445566",
    });
    expect(getCellStyle(sheet, { row: 0, column: 1 })?.fillColor).toBeUndefined();
    expect(result.report.issues).toEqual([
      {
        code: "style-omitted",
        severity: "warning",
        count: 2,
        locations: ["Data!A1", "Data!B1"],
      },
    ]);
  });
});
