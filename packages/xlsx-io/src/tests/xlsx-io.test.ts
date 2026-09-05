import ExcelJSImport from "exceljs/dist/exceljs.min.js";
import { getCellContent, getRowHeight, type Workbook } from "@idea10/core/workbook";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../index.js";

type BrowserWorkbook = {
  properties: { date1904?: boolean };
  addWorksheet: (
    name: string,
    options?: { views?: Record<string, unknown>[] },
  ) => {
    getCell: (address: string) => { value: unknown; numFmt?: string };
    getColumn: (index: number) => { width?: number };
    getRow: (index: number) => { height?: number };
    mergeCells: (range: string) => void;
  };
  xlsx: { writeBuffer: () => Promise<ArrayBuffer | Uint8Array> };
};
const ExcelJS = ExcelJSImport as unknown as { Workbook: new () => BrowserWorkbook };

async function fixtureBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.properties.date1904 = true;
  const sheet = workbook.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.getCell("A1").value = 41;
  sheet.getCell("B1").value = { formula: "A1+1", result: 42 };
  sheet.getCell("C1").value = "text";
  sheet.getColumn(1).width = 18;
  sheet.getRow(1).height = 30;
  sheet.mergeCells("A3:B3");
  sheet.getCell("A3").value = "merged";
  const bytes = await workbook.xlsx.writeBuffer();
  return bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
}

async function simpleFormulaBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Formula");
  sheet.getCell("A1").value = 1;
  sheet.getCell("B1").value = { formula: "A1+1" };
  const bytes = await workbook.xlsx.writeBuffer();
  return bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
}

async function formulaCacheBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Caches");
  sheet.getCell("A1").value = { formula: "1-1", result: 0 };
  sheet.getCell("B1").value = { formula: "1=1", result: false };
  const bytes = await workbook.xlsx.writeBuffer();
  return bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
}

function storedZip(name: string): Uint8Array {
  const fileName = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + fileName.length);
  const central = new Uint8Array(46 + fileName.length);
  const output = new Uint8Array(local.length + central.length + 22);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(26, fileName.length, true);
  output.set(fileName, 30);
  const centralOffset = local.length;
  view.setUint32(centralOffset, 0x02014b50, true);
  view.setUint16(centralOffset + 28, fileName.length, true);
  output.set(fileName, centralOffset + 46);
  const eocd = centralOffset + central.length;
  view.setUint32(eocd, 0x06054b50, true);
  view.setUint16(eocd + 8, 1, true);
  view.setUint16(eocd + 10, 1, true);
  view.setUint32(eocd + 12, central.length, true);
  view.setUint32(eocd + 16, centralOffset, true);
  return output;
}

describe("XLSX IO", () => {
  test("uses the published browser artifact to decode supported values and reports uncalculated formula cache", async () => {
    const input = await fixtureBytes();
    const original = new Uint8Array(input);
    const result = await decodeXlsx(input);
    const sheet = [...result.workbook.sheets.values()][0]!;
    expect(input).toEqual(original);
    expect(result.workbook.dateSystem).toBe("1904");
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({
      kind: "literal",
      value: 41,
    });
    expect(getCellContent(sheet, { row: 0, column: 1 })).toMatchObject({
      kind: "formula",
      formula: { source: "=A1+1" },
    });
    expect(getRowHeight(sheet, 0)).toBe(40);
    expect(sheet.columnWidths.get(0)).toBe(131);
    expect(sheet.mergedCells).toHaveLength(1);
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "formula-cache-discarded" })]),
    );
  });

  test("roundtrips the supported Core subset and reports non-calculated formulas", async () => {
    const decoded = await decodeXlsx(await fixtureBytes());
    const encoded = await encodeXlsx(decoded.workbook as Workbook);
    const restored = await decodeXlsx(encoded.bytes);
    expect(encoded.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "formula-not-calculated" })]),
    );
    expect(
      getCellContent([...restored.workbook.sheets.values()][0]!, { row: 0, column: 1 }),
    ).toMatchObject({ kind: "formula", formula: { source: "=A1+1" } });
  });

  test("reports only an uncalculated formula for a generated formula without a cache", async () => {
    const decoded = await decodeXlsx(await simpleFormulaBytes());
    expect(decoded.report.issues).toEqual([
      expect.objectContaining({ code: "formula-not-calculated" }),
    ]);
    const encoded = await encodeXlsx(decoded.workbook as Workbook);
    const restored = await decodeXlsx(encoded.bytes);
    expect(restored.report.issues).toEqual([
      expect.objectContaining({ code: "formula-not-calculated" }),
    ]);
  });

  test("recognizes zero and false formula results as real caches", async () => {
    const decoded = await decodeXlsx(await formulaCacheBytes());
    expect(decoded.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "formula-cache-discarded", count: 2 }),
      ]),
    );
  });

  test("blocks unsupported parts and oversized archives before ExcelJS loads them", async () => {
    await expect(decodeXlsx(storedZip("xl/vbaProject.bin"))).rejects.toBeInstanceOf(
      XlsxCompatibilityError,
    );
    await expect(decodeXlsx(new Uint8Array(25 * 1024 * 1024 + 1))).rejects.toBeInstanceOf(
      XlsxCompatibilityError,
    );
  });
});
