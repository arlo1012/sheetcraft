import ExcelJSImport from "exceljs/dist/exceljs.min.js";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { inflateRawSync } from "node:zlib";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellContent,
  getCellHyperlink,
  getCellNote,
  getCellStyle,
  getColumnWidth,
  getRowHeight,
  setCellContent,
  setCellNote,
  setCellStyle,
  setColumnWidth,
  type Workbook,
} from "@idea10/core/workbook";
import { DEFAULT_SHEET_PAGE_SETUP } from "@idea10/core/page-setup";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../index.js";
import { writeXlsxPageSetups } from "../page-setup.js";

type BrowserWorkbook = {
  properties: { date1904?: boolean };
  calcProperties: { fullCalcOnLoad?: boolean };
  addWorksheet: (
    name: string,
    options?: { views?: Record<string, unknown>[] },
  ) => {
    getCell: (address: string) => {
      value: unknown;
      numFmt?: string;
      note?: string | { texts?: Array<{ text: string }> };
    };
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

async function noteFixtureBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Notes");
  sheet.getCell("B2").value = "review me";
  sheet.getCell("B2").note = { texts: [{ text: "First line\nSecond line" }] };
  sheet.getCell("D4").note = { texts: [{ text: "Blank cell note" }] };
  const bytes = await workbook.xlsx.writeBuffer();
  const entries = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const comments = strFromU8(entries["xl/comments1.xml"]!);
  const commentPart = "xl/review/comments/note-part.xml";
  entries[commentPart] = strToU8(
    comments.replace("<author>Author</author>", "<author>Ada Lovelace</author>"),
  );
  delete entries["xl/comments1.xml"];
  entries["xl/worksheets/_rels/sheet1.xml.rels"] = strToU8(
    strFromU8(entries["xl/worksheets/_rels/sheet1.xml.rels"]!).replace(
      'Target="../comments1.xml"',
      'Target="/xl/review/comments/note-part.xml"',
    ),
  );
  return zipSync(entries);
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
  test("imports classic notes with their multiline text and author", async () => {
    const result = await decodeXlsx(await noteFixtureBytes());
    const sheet = [...result.workbook.sheets.values()][0]!;
    expect(getCellNote(sheet, { row: 1, column: 1 })).toMatchObject({
      text: "First line\nSecond line",
      author: "Ada Lovelace",
    });
    expect(getCellNote(sheet, { row: 3, column: 3 })).toEqual({
      text: "Blank cell note",
      author: "Ada Lovelace",
    });
  });

  test("exports classic notes with their multiline text and author", async () => {
    const workbook = createWorkbook({ id: "notes", sheetId: "notes-sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "review me" });
    setCellNote(
      sheet,
      { row: 1, column: 1 },
      {
        text: "First line\nSecond line",
        author: "Ada Lovelace",
        box: { offsetX: 12, offsetY: 8, width: 240, height: 120 },
      },
    );
    setCellNote(sheet, { row: 3, column: 3 }, { text: "Blank cell note" });

    const encoded = await encodeXlsx(workbook);
    const comments = xlsxEntryText(encoded.bytes, "xl/comments1.xml");
    expect(comments).toContain("<author>Ada Lovelace</author>");
    expect(comments).toMatch(/<comment ref="B2" authorId="0">/);
    expect(comments).toMatch(/<comment ref="D4" authorId="1">/);
    const vml = xlsxEntryText(encoded.bytes, "xl/drawings/vmlDrawing1.vml");
    expect(vml).toContain("margin-left:153pt");
    expect(vml).toContain("width:180pt");
    expect(vml).toContain("2, 128, 1, 85, 4, 640, 6, 85");

    const restored = await decodeXlsx(encoded.bytes);
    expect(getCellNote(getActiveSheet(restored.workbook), { row: 1, column: 1 })).toEqual({
      text: "First line\nSecond line",
      author: "Ada Lovelace",
      box: { offsetX: 12, offsetY: 8, width: 240, height: 120 },
    });
    expect(getCellNote(getActiveSheet(restored.workbook), { row: 3, column: 3 })).toEqual({
      text: "Blank cell note",
    });
  });

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

  test("roundtrips tables, hyperlinks, and page setup through shared worksheet writers", async () => {
    const workbook = createWorkbook({ id: "combined-worksheet-writers", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const tableStyle = {
      id: "integration-table-style",
      name: "Integration Blue",
      category: "custom" as const,
      elements: {
        headerRow: { style: { fillColor: "#123456", textColor: "#ffffff", bold: true } },
      },
    };
    for (const [row, values] of [
      ["Resource", "Visits"],
      ["Product home", 120],
      ["Release notes", 80],
    ].entries())
      values.forEach((value, column) =>
        setCellContent(sheet, { row, column }, { kind: "literal", value }),
      );
    sheet.cells.set("1:0", {
      content: { kind: "literal", value: "Product home" },
      hyperlink: { target: "https://example.test/product", tooltip: "Open product" },
    });
    sheet.tables = [
      {
        id: "resource-table",
        name: "Resources",
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        columns: [
          { id: "resource", name: "Resource" },
          { id: "visits", name: "Visits" },
        ],
        style: tableStyle,
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter: {
          range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
          columns: [],
        },
      },
    ];
    sheet.pageSetup = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      orientation: "landscape",
      printArea: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      header: { left: "Resources", center: "", right: "Page &P" },
      footer: { left: "", center: "Internal", right: "" },
    };

    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    const worksheet = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    expect(worksheet).toContain('<tableParts count="1"');
    expect(worksheet).toContain("<hyperlinks>");
    expect(worksheet).toContain('<pageSetup paperSize="9" orientation="landscape"');
    expect(worksheet).toContain("<headerFooter>");
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain('name="Integration Blue"');

    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(restored.tables).toEqual([
      expect.objectContaining({
        name: "Resources",
        style: expect.objectContaining({ name: "Integration Blue" }),
      }),
    ]);
    expect(getCellHyperlink(restored, { row: 1, column: 0 })).toEqual({
      target: "https://example.test/product",
      tooltip: "Open product",
    });
    expect(restored.pageSetup).toMatchObject({
      orientation: "landscape",
      printArea: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      header: { left: "Resources", center: "", right: "Page &P" },
      footer: { left: "", center: "Internal", right: "" },
    });
  });

  test("preserves disabled first and even page header/footer content", async () => {
    const workbook = createWorkbook({ id: "disabled-header-footer", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    sheet.pageSetup = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      headerFooter: {
        ...DEFAULT_SHEET_PAGE_SETUP.headerFooter!,
        firstHeader: { left: "First retained", center: "", right: "" },
        evenFooter: { left: "", center: "Even retained", right: "" },
      },
    };

    const encoded = await encodeXlsx(workbook);
    const worksheet = xlsxEntryText(encoded.bytes, "xl/worksheets/sheet1.xml");
    expect(worksheet).toContain("<headerFooter>");
    expect(worksheet).not.toContain('differentFirst="1"');
    expect(worksheet).not.toContain('differentOddEven="1"');
    expect(worksheet).toContain("<firstHeader>&amp;LFirst retained&amp;C&amp;R</firstHeader>");
    expect(worksheet).toContain("<evenFooter>&amp;L&amp;CEven retained&amp;R</evenFooter>");
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).pageSetup?.headerFooter,
    ).toEqual(sheet.pageSetup.headerFooter);
  });

  test("imports a page setup when print options, fit-to-page, or print titles are its only setting", async () => {
    const workbook = createWorkbook({
      id: "page-setup-presence",
      sheetId: "sheet",
      sheetName: "Plan",
    });
    const encoded = await encodeXlsx(workbook);

    const decodeWith = async (worksheetPatch: string, workbookPatch = "") => {
      const entries = unzipSync(encoded.bytes);
      entries["xl/worksheets/sheet1.xml"] = strToU8(
        strFromU8(entries["xl/worksheets/sheet1.xml"]!).replace(
          "</worksheet>",
          `${worksheetPatch}</worksheet>`,
        ),
      );
      if (workbookPatch)
        entries["xl/workbook.xml"] = strToU8(
          strFromU8(entries["xl/workbook.xml"]!).replace(
            "</workbook>",
            `${workbookPatch}</workbook>`,
          ),
        );
      return getActiveSheet((await decodeXlsx(zipSync(entries))).workbook).pageSetup;
    };

    await expect(decodeWith('<printOptions gridLines="1"/>')).resolves.toMatchObject({
      printOptions: { gridLines: true },
    });
    await expect(
      decodeWith('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'),
    ).resolves.toMatchObject({ fitToPage: { width: 1, height: 1 } });
    await expect(
      decodeWith(
        "",
        '<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">&apos;Plan&apos;!$1:$2</definedName></definedNames>',
      ),
    ).resolves.toMatchObject({ printTitles: { rows: { start: 0, end: 1 }, columns: null } });
  });

  test("keeps existing self-closing sheet properties when fit-to-page is disabled", async () => {
    const workbook = createWorkbook({ id: "sheet-properties", sheetId: "sheet" });
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    entries["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(entries["xl/worksheets/sheet1.xml"]!).replace(
        /<worksheet\b([^>]*)>/,
        '<worksheet$1><sheetPr codeName="Keep" filterMode="1" published="1"/>',
      ),
    );
    writeXlsxPageSetups(entries, [{ ...DEFAULT_SHEET_PAGE_SETUP, fitToPage: null }]);
    expect(strFromU8(entries["xl/worksheets/sheet1.xml"]!)).toContain(
      '<sheetPr codeName="Keep" filterMode="1" published="1"/>',
    );
  });

  test("roundtrips standard extended worksheet print settings", async () => {
    const workbook = createWorkbook({
      id: "extended-page-setup",
      sheetId: "sheet",
      sheetName: "Print plan",
    });
    const sheet = getActiveSheet(workbook);
    sheet.pageSetup = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      paperSize: "custom",
      customPaperSize: { width: 210.5, height: 320.25 },
      fitToPage: { width: 1, height: 0 },
      firstPageNumber: 4,
      printQuality: 300,
      printOptions: {
        horizontalCentered: true,
        verticalCentered: true,
        gridLines: true,
        blackAndWhite: true,
        headings: true,
        cellComments: "atEnd",
        errors: "dash",
      },
      printTitles: {
        rows: { start: 0, end: 2 },
        columns: { start: 0, end: 1 },
        bottomRows: { start: 10, end: 11 },
      },
    };
    const encoded = await encodeXlsx(workbook);
    const worksheet = xlsxEntryText(encoded.bytes, "xl/worksheets/sheet1.xml");
    expect(encoded.report.issues).toContainEqual(
      expect.objectContaining({
        code: "feature-omitted",
        locations: ["sheet1.printTitles.bottomRows"],
      }),
    );
    expect(worksheet).toContain('<pageSetup paperWidth="210.5mm" paperHeight="320.25mm"');
    expect(worksheet).toContain('fitToWidth="1" fitToHeight="0"');
    expect(worksheet).toContain('firstPageNumber="4" useFirstPageNumber="1"');
    expect(worksheet).toContain('horizontalDpi="300" verticalDpi="300"');
    expect(worksheet).toContain(
      '<printOptions horizontalCentered="1" verticalCentered="1" gridLines="1" headings="1"/>',
    );
    expect(xlsxEntryText(encoded.bytes, "xl/workbook.xml")).toContain(
      '<definedName name="_xlnm.Print_Titles" localSheetId="0">&apos;Print plan&apos;!$1:$3,&apos;Print plan&apos;!$A:$B</definedName>',
    );
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).pageSetup!;
    expect(restored.printTitles).toEqual({
      rows: { start: 0, end: 2 },
      columns: { start: 0, end: 1 },
      bottomRows: null,
    });
    expect(restored).toMatchObject({
      paperSize: "custom",
      customPaperSize: { width: 210.5, height: 320.25 },
      fitToPage: { width: 1, height: 0 },
      firstPageNumber: 4,
      printQuality: 300,
      printOptions: sheet.pageSetup.printOptions,
    });
  });

  test("roundtrips supported worksheet page setup and merges subtotal page breaks", async () => {
    const workbook = createWorkbook({
      id: "page-setup",
      sheetId: "sheet",
      sheetName: "Print plan",
    });
    const sheet = getActiveSheet(workbook);
    sheet.pageSetup = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      paperSize: "legal",
      orientation: "landscape",
      margins: { top: 12.7, bottom: 25.4, left: 19.05, right: 6.35, header: 5.08, footer: 10.16 },
      scale: 85,
      printArea: { start: { row: 1, column: 2 }, end: { row: 8, column: 5 } },
      rowBreaks: [3, 6],
      columnBreaks: [2],
      header: {
        left: '&"Arial"&12&B&I&U&KFF0000&D &T &F &Z &A &&',
        center: "Page &P of &N",
        right: "Research && Development",
      },
      footer: { left: "Internal", center: "Page", right: "Confidential" },
      headerFooter: {
        ...DEFAULT_SHEET_PAGE_SETUP.headerFooter!,
        differentFirst: true,
        differentOddEven: true,
        scaleWithDocument: false,
        alignWithMargins: false,
        firstHeader: { left: "First &P", center: "", right: "" },
        firstFooter: { left: "", center: "First footer", right: "" },
        evenHeader: { left: "Even &A", center: "", right: "" },
        evenFooter: { left: "", center: "Even footer", right: "" },
      },
      pageOrder: "overThenDown",
    };
    sheet.subtotalMetadata = [
      {
        id: "subtotal",
        range: { start: { row: 0, column: 0 }, end: { row: 9, column: 0 } },
        generatedRows: [],
        pageBreakRows: [5],
      },
    ];

    const encoded = await encodeXlsx(workbook);
    const worksheet = xlsxEntryText(encoded.bytes, "xl/worksheets/sheet1.xml");
    expect(worksheet).toContain(
      '<pageMargins left="0.75" right="0.25" top="0.5" bottom="1" header="0.2" footer="0.4"/>',
    );
    expect(worksheet).toContain(
      '<pageSetup paperSize="5" orientation="landscape" scale="85" horizontalDpi="600" verticalDpi="600" pageOrder="overThenDown"/>',
    );
    expect(worksheet).toContain(
      '<headerFooter differentFirst="1" differentOddEven="1" scaleWithDoc="0" alignWithMargins="0"><oddHeader>&amp;L&amp;&quot;Arial&quot;&amp;12&amp;B&amp;I&amp;U&amp;KFF0000&amp;D &amp;T &amp;F &amp;Z &amp;A &amp;&amp;&amp;CPage &amp;P of &amp;N&amp;RResearch &amp;&amp; Development</oddHeader>',
    );
    expect(worksheet).toContain("<evenHeader>&amp;LEven &amp;A&amp;C&amp;R</evenHeader>");
    expect(worksheet).toContain("<firstFooter>&amp;L&amp;CFirst footer&amp;R</firstFooter>");
    expect(worksheet).toContain('<brk id="3" max="16383" man="1"/>');
    expect(worksheet).toContain('<brk id="5" max="16383" man="1"/>');
    expect(worksheet).toContain('<brk id="6" max="16383" man="1"/>');
    expect(worksheet).toContain('<brk id="2" min="0" max="1048575" man="1"/>');
    expect(xlsxEntryText(encoded.bytes, "xl/workbook.xml")).toContain(
      '<definedName name="_xlnm.Print_Area" localSheetId="0">&apos;Print plan&apos;!$C$2:$F$9</definedName>',
    );

    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(restored.pageSetup).toEqual({
      ...sheet.pageSetup,
      rowBreaks: [3, 5, 6],
    });

    const entries = unzipSync(encoded.bytes);
    const worksheetXml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    entries["xl/worksheets/sheet1.xml"] = strToU8(
      worksheetXml.replace("</rowBreaks>", '<brk id="4" max="16383" man="0"/></rowBreaks>'),
    );
    expect(
      getActiveSheet((await decodeXlsx(zipSync(entries))).workbook).pageSetup?.rowBreaks,
    ).toEqual([3, 5, 6]);

    const imageEntries = unzipSync(encoded.bytes);
    imageEntries["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(imageEntries["xl/worksheets/sheet1.xml"]!)
        .replace("<oddHeader>", "<oddHeader>&amp;G")
        .replace("</worksheet>", '<legacyDrawingHF r:id="rId1"/></worksheet>'),
    );
    expect((await decodeXlsx(zipSync(imageEntries))).report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "feature-omitted",
          locations: expect.arrayContaining(["Print plan.headerFooter.image"]),
        }),
      ]),
    );
  });

  test("roundtrips supported named paper sizes with OOXML paper IDs", async () => {
    const paperSizes = [
      ["letter", 1],
      ["tabloid", 3],
      ["legal", 5],
      ["statement", 6],
      ["executive", 7],
      ["a3", 8],
      ["a4", 9],
      ["a5", 11],
      ["b4-jis", 12],
      ["b5-jis", 13],
    ] as const;

    for (const [paperSize, paperId] of paperSizes) {
      const workbook = createWorkbook({ id: `paper-${paperSize}`, sheetId: "sheet" });
      getActiveSheet(workbook).pageSetup = { ...DEFAULT_SHEET_PAGE_SETUP, paperSize };

      const encoded = await encodeXlsx(workbook);
      expect(xlsxEntryText(encoded.bytes, "xl/worksheets/sheet1.xml")).toContain(
        `<pageSetup paperSize="${paperId}"`,
      );
      expect(getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).pageSetup?.paperSize).toBe(
        paperSize,
      );
    }
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
      comment: "FY26 & plan",
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
    expect(xml).toContain(
      '<definedName name="Sales" comment="FY26 &amp; plan">&apos;Data&apos;!$A$1:$A$2</definedName>',
    );
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
            comment: "FY26 & plan",
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

  test("roundtrips multiline defined-name comments without XML attribute normalization", async () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "data", sheetName: "Data" });
    const sheet = getActiveSheet(workbook);
    const comment = "FY26\nPlan\tReviewed\rFinal";
    workbook.definedNames.set("sales", {
      id: "sales",
      name: "Sales",
      comment,
      reference: {
        sheetId: sheet.id,
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
      },
    });

    const encoded = await encodeXlsx(workbook);
    expect(xlsxEntryText(encoded.bytes, "xl/workbook.xml")).toContain(
      'comment="FY26&#10;Plan&#9;Reviewed&#13;Final"',
    );
    const restored = await decodeXlsx(encoded.bytes);
    expect([...restored.workbook.definedNames.values()][0]?.comment).toBe(comment);
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

  test("flattens product-owned SIMTABLE results because Excel cannot recalculate them", async () => {
    const workbook = createWorkbook({ id: "simulation-table", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1*2" } });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: 3 });
    setCellContent(
      sheet,
      { row: 0, column: 3 },
      { kind: "formula", formula: { source: "=SIMTABLE(B1,A1,C1)" } },
    );

    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([
      expect.objectContaining({ code: "feature-omitted", locations: ["Sheet1!D1"] }),
    ]);
    const worksheetXml = xlsxEntryText(encoded.bytes, "xl/worksheets/sheet1.xml").replace(
      / s="\d+"/g,
      "",
    );
    expect(worksheetXml).toContain('<c r="D1"><v>6</v></c>');
    expect(worksheetXml).not.toContain("SIMTABLE");

    expect(
      getCellContent(getActiveSheet((await decodeXlsx(encoded.bytes)).workbook), {
        row: 0,
        column: 3,
      }),
    ).toEqual({ kind: "literal", value: 6 });
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
