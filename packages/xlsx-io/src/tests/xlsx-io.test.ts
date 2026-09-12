import ExcelJSImport from "exceljs/dist/exceljs.min.js";
import { inflateRawSync } from "node:zlib";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellContent,
  getCellStyle,
  getColumnWidth,
  getRowHeight,
  setCellContent,
  setCellStyle,
  setColumnWidth,
  type Workbook,
} from "@idea10/core/workbook";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../index.js";

type BrowserWorkbook = {
  properties: { date1904?: boolean };
  calcProperties: { fullCalcOnLoad?: boolean };
  addWorksheet: (
    name: string,
    options?: { views?: Record<string, unknown>[] },
  ) => {
    getCell: (address: string) => { value: unknown; numFmt?: string };
    getColumn: (index: number) => { width?: number };
    getRow: (index: number) => { height?: number };
    mergeCells: (range: string) => void;
  };
  xlsx: {
    load: (bytes: Uint8Array) => Promise<unknown>;
    writeBuffer: () => Promise<ArrayBuffer | Uint8Array>;
  };
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

function xlsxEntryText(bytes: Uint8Array, targetName: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const contentOffset = offset + 30 + nameLength + extraLength;
    const content = bytes.slice(contentOffset, contentOffset + compressedSize);
    if (name === targetName) {
      const inflated = compression === 8 ? inflateRawSync(content) : content;
      return new TextDecoder().decode(inflated);
    }
    offset = contentOffset + compressedSize;
  }
  throw new Error(`Missing XLSX entry: ${targetName}`);
}

describe("XLSX IO", () => {
  test("uses the published browser artifact to decode supported values and reports uncalculated formula cache", async () => {
    const input = await fixtureBytes();
    const original = new Uint8Array(input);
    const result = await decodeXlsx(input);
    const sheet = [...result.workbook.sheets.values()][0]!;
    expect(input).toEqual(original);
    expect(result.workbook.dateSystem).toBe("1904");
    expect(result.workbook.calculation).toEqual({
      mode: "automatic",
      iterative: false,
      maxIterations: 100,
      maxChange: 0.001,
    });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({
      kind: "literal",
      value: 41,
    });
    expect(getCellContent(sheet, { row: 0, column: 1 })).toMatchObject({
      kind: "formula",
      formula: { source: "=A1+1" },
    });
    expect(getRowHeight(sheet, 0)).toBe(40);
    expect(sheet.columnWidths.get(0)).toBe(126);
    expect(sheet.mergedCells).toHaveLength(1);
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "formula-cache-discarded" })]),
    );
  });

  test("roundtrips workbook calculation mode and iterative settings through calcPr", async () => {
    const workbook = createWorkbook({ id: "calculation", sheetId: "sheet" });
    workbook.calculation = {
      mode: "manual",
      iterative: true,
      maxIterations: 37,
      maxChange: 0.00025,
    };

    const encoded = await encodeXlsx(workbook);
    const xml = xlsxEntryText(encoded.bytes, "xl/workbook.xml");
    expect(xml).toContain('calcMode="manual"');
    expect(xml).toContain('iterate="1"');
    expect(xml).toContain('iterateCount="37"');
    expect(xml).toContain('iterateDelta="0.00025"');
    expect((await decodeXlsx(encoded.bytes)).workbook.calculation).toEqual(workbook.calculation);
  });

  test("retains whole-axis and dynamic-array formula sources without materializing spills", async () => {
    const workbook = createWorkbook({ id: "modern-formulas", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SUM(B:B)" } },
    );
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=_xlfn.SEQUENCE(3)" } },
    );

    const encoded = await encodeXlsx(workbook);
    const xml = xlsxEntryText(encoded.bytes, "xl/worksheets/sheet1.xml");
    expect(xml).toContain("<f>SUM(B:B)</f>");
    expect(xml).toContain("<f>_xlfn.SEQUENCE(3)</f>");
    expect(xml.match(/<c\b/g)).toHaveLength(2);
    const restored = await decodeXlsx(encoded.bytes);
    expect(getCellContent(getActiveSheet(restored.workbook), { row: 0, column: 0 })).toMatchObject({
      kind: "formula",
      formula: { source: "=SUM(B:B)" },
    });
    expect(getCellContent(getActiveSheet(restored.workbook), { row: 0, column: 1 })).toMatchObject({
      kind: "formula",
      formula: { source: "=_xlfn.SEQUENCE(3)" },
    });
  });

  test("roundtrips the supported Core subset with a fresh formula cache", async () => {
    const decoded = await decodeXlsx(await fixtureBytes());
    const encoded = await encodeXlsx(decoded.workbook as Workbook);
    const restored = await decodeXlsx(encoded.bytes);
    expect(encoded.report.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "formula-not-calculated" })]),
    );
    expect(
      getCellContent([...restored.workbook.sheets.values()][0]!, { row: 0, column: 1 }),
    ).toMatchObject({ kind: "formula", formula: { source: "=A1+1" } });
  });

  test("does not warn while importing a generated formula without a cache", async () => {
    const decoded = await decodeXlsx(await simpleFormulaBytes());
    expect(decoded.report.issues).toEqual([]);
    const encoded = await encodeXlsx(decoded.workbook as Workbook);
    const restored = await decodeXlsx(encoded.bytes);
    expect(encoded.report.issues).toEqual([]);
    expect(restored.report.issues).toEqual([
      expect.objectContaining({ code: "formula-cache-discarded" }),
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

  test("roundtrips workbook and sheet scoped names with cross-sheet formulas", async () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "data", sheetName: "Data" });
    const data = getActiveSheet(workbook);
    const summary = createSheet("Summary", "summary");
    workbook.sheets.set(summary.id, summary);
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 41 });
    setCellContent(
      summary,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Data!A1+1" },
      },
    );
    workbook.definedNames.set("sales", {
      id: "sales",
      name: "Sales",
      reference: {
        sheetId: data.id,
        start: { row: 0, column: 0 },
        end: { row: 1, column: 0 },
      },
    });
    workbook.definedNames.set("summary-sales", {
      id: "summary-sales",
      name: "Sales",
      scopeSheetId: summary.id,
      reference: {
        sheetId: data.id,
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
      },
    });

    const encoded = await encodeXlsx(workbook);
    const xml = xlsxEntryText(encoded.bytes, "xl/workbook.xml");
    expect(xml).toContain('<definedName name="Sales">&apos;Data&apos;!$A$1:$A$2</definedName>');
    expect(xml).toContain(
      '<definedName name="Sales" localSheetId="1">&apos;Data&apos;!$A$1:$A$1</definedName>',
    );

    const restored = await decodeXlsx(encoded.bytes);
    const restoredSheets = [...restored.workbook.sheets.values()];
    expect(restored.workbook.definedNames).toEqual(
      new Map([
        [
          "xlsx-defined-name-workbook-SALES",
          {
            id: "xlsx-defined-name-workbook-SALES",
            name: "Sales",
            reference: {
              sheetId: restoredSheets[0]!.id,
              start: { row: 0, column: 0 },
              end: { row: 1, column: 0 },
            },
          },
        ],
        [
          `xlsx-defined-name-${restoredSheets[1]!.id}-SALES`,
          {
            id: `xlsx-defined-name-${restoredSheets[1]!.id}-SALES`,
            name: "Sales",
            scopeSheetId: restoredSheets[1]!.id,
            reference: {
              sheetId: restoredSheets[0]!.id,
              start: { row: 0, column: 0 },
              end: { row: 0, column: 0 },
            },
          },
        ],
      ]),
    );
    expect(getCellContent(restoredSheets[1]!, { row: 0, column: 0 })).toMatchObject({
      kind: "formula",
      formula: { source: "=Data!A1+1" },
    });
  });

  test("roundtrips canonical number formats and representable borders", async () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1.5 });
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      { numberFormat: { kind: "number", fractionDigits: 2 } },
    );
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: 0.25 });
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      { numberFormat: { kind: "percent", fractionDigits: 1 } },
    );
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: 10 });
    setCellStyle(
      sheet,
      { row: 0, column: 2 },
      { numberFormat: { kind: "currency", currency: "USD", fractionDigits: 2 } },
    );
    setCellStyle(
      sheet,
      { row: 1, column: 0 },
      {
        borderTop: { style: "thin", color: "#112233" },
        borderRight: { style: "medium", color: "#223344" },
        borderBottom: { style: "dashed", color: "#334455" },
        borderLeft: { style: "dotted", color: "#445566" },
        borderDiagonalUp: { style: "double", color: "#556677" },
        borderDiagonalDown: { style: "double", color: "#556677" },
      },
    );
    setCellStyle(
      sheet,
      { row: 1, column: 1 },
      {
        borderDiagonalUp: { style: "thin", color: "#667788" },
      },
    );
    setCellStyle(
      sheet,
      { row: 1, column: 2 },
      {
        borderDiagonalDown: { style: "medium", color: "#778899" },
      },
    );
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([]);
    const decoded = await decodeXlsx(encoded.bytes);
    const restored = getActiveSheet(decoded.workbook);
    expect(getCellStyle(restored, { row: 0, column: 0 })?.numberFormat).toEqual({
      kind: "number",
      fractionDigits: 2,
    });
    expect(getCellStyle(restored, { row: 0, column: 1 })?.numberFormat).toEqual({
      kind: "percent",
      fractionDigits: 1,
    });
    expect(getCellStyle(restored, { row: 0, column: 2 })?.numberFormat).toEqual({
      kind: "currency",
      currency: "USD",
      fractionDigits: 2,
    });
    expect(getCellStyle(restored, { row: 1, column: 0 })).toMatchObject({
      borderTop: { style: "thin", color: "#112233" },
      borderRight: { style: "medium", color: "#223344" },
      borderBottom: { style: "dashed", color: "#334455" },
      borderLeft: { style: "dotted", color: "#445566" },
      borderDiagonalUp: { style: "double", color: "#556677" },
      borderDiagonalDown: { style: "double", color: "#556677" },
    });
    expect(getCellStyle(restored, { row: 1, column: 1 })).toMatchObject({
      borderDiagonalUp: { style: "thin", color: "#667788" },
    });
    expect(getCellStyle(restored, { row: 1, column: 2 })).toMatchObject({
      borderDiagonalDown: { style: "medium", color: "#778899" },
    });
  });

  test("roundtrips every supported Excel border line style", async () => {
    const styles = [
      "hair",
      "thin",
      "medium",
      "thick",
      "dotted",
      "dashed",
      "mediumDashed",
      "dashDot",
      "mediumDashDot",
      "dashDotDot",
      "mediumDashDotDot",
      "slantDashDot",
      "double",
    ] as const;
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    for (const [column, style] of styles.entries()) {
      setCellStyle(
        sheet,
        { row: 0, column },
        {
          borderTop: { style, color: "#123456" },
          borderDiagonalDown: { style, color: "#654321" },
        },
      );
    }

    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([]);
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    for (const [column, style] of styles.entries()) {
      expect(getCellStyle(restored, { row: 0, column })).toMatchObject({
        borderTop: { style, color: "#123456" },
        borderDiagonalDown: { style, color: "#654321" },
      });
    }
  });

  test("warns when independent diagonal borders cannot be represented by XLSX", async () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    setCellStyle(
      getActiveSheet(workbook),
      { row: 0, column: 0 },
      {
        borderDiagonalUp: { style: "thin", color: "#112233" },
        borderDiagonalDown: { style: "double", color: "#445566" },
      },
    );
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "style-omitted" })]),
    );
  });

  test("writes fresh supported formula caches and leaves unsafe branches to Excel recalculation", async () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1+1" } });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "formula", formula: { source: "=B1*2" } });
    setCellContent(
      sheet,
      { row: 0, column: 3 },
      { kind: "formula", formula: { source: "=IFERROR(UNKNOWN(1),0)" } },
    );
    setCellContent(sheet, { row: 0, column: 4 }, { kind: "formula", formula: { source: "=1/0" } });
    setCellContent(sheet, { row: 0, column: 5 }, { kind: "formula", formula: { source: '=""' } });
    setCellContent(sheet, { row: 0, column: 6 }, { kind: "formula", formula: { source: "=1=1" } });
    setCellContent(sheet, { row: 0, column: 7 }, { kind: "formula", formula: { source: "=1-1" } });
    setCellContent(sheet, { row: 0, column: 8 }, { kind: "formula", formula: { source: "=Z1" } });
    setCellContent(sheet, { row: 0, column: 9 }, { kind: "formula", formula: { source: "=1=2" } });
    setCellContent(
      sheet,
      { row: 0, column: 10 },
      { kind: "formula", formula: { source: '="cached text"' } },
    );
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([
      expect.objectContaining({
        code: "formula-not-calculated",
        locations: ["Sheet1!D1", "Sheet1!I1"],
      }),
    ]);
    const worksheetXml = xlsxEntryText(encoded.bytes, "xl/worksheets/sheet1.xml").replace(
      / s="\d+"/g,
      "",
    );
    expect(worksheetXml).toContain('<c r="B1"><f>A1+1</f><v>3</v></c>');
    expect(worksheetXml).toContain('<c r="C1"><f>B1*2</f><v>6</v></c>');
    expect(worksheetXml).toContain('<c r="D1"><f>IFERROR(UNKNOWN(1),0)</f></c>');
    expect(worksheetXml).toContain('<c r="E1" t="e"><f>1/0</f><v>#DIV/0!</v></c>');
    expect(worksheetXml).toContain('<c r="F1" t="str"><f>&quot;&quot;</f><v></v></c>');
    expect(worksheetXml).toContain('<c r="G1" t="b"><f>1=1</f><v>1</v></c>');
    expect(worksheetXml).toContain('<c r="H1"><f>1-1</f><v>0</v></c>');
    expect(worksheetXml).toContain('<c r="I1"><f>Z1</f></c>');
    expect(worksheetXml).toContain('<c r="J1" t="b"><f>1=2</f><v>0</v></c>');
    expect(worksheetXml).toContain(
      '<c r="K1" t="str"><f>&quot;cached text&quot;</f><v>cached text</v></c>',
    );
    expect(xlsxEntryText(encoded.bytes, "xl/workbook.xml")).toContain('fullCalcOnLoad="1"');
    const decoded = await decodeXlsx(encoded.bytes);
    expect(decoded.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "formula-cache-discarded", count: 7 }),
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

  test("preserves all supported pixel column widths with the exported Normal font baseline", async () => {
    const workbook = createWorkbook({ id: "widths", sheetId: "widths-sheet" });
    const sheet = getActiveSheet(workbook);
    for (let pixels = 32; pixels <= 640; pixels += 1) setColumnWidth(sheet, pixels - 32, pixels);
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([]);
    const styles = xlsxEntryText(encoded.bytes, "xl/styles.xml");
    const normalFont = /<fonts[^>]*><font>(.*?)<\/font>/s.exec(styles)?.[1];
    expect(normalFont).toContain('<sz val="11"/>');
    expect(normalFont).toContain('<name val="Calibri"/>');
    expect(styles).toContain('<cellStyle name="Normal" xfId="0" builtinId="0"/>');
    expect(styles).toMatch(/<cellStyleXfs[^>]*><xf[^>]*fontId="0"/);
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    for (let pixels = 32; pixels <= 640; pixels += 1)
      expect(getColumnWidth(restored, pixels - 32)).toBe(pixels);
    expect(restored.columnWidths.has(96 - 32)).toBe(false);
    expect(sheet.columnWidths.size).toBe(restored.columnWidths.size);
  });
});
