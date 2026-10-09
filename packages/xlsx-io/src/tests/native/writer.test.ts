import { XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { readXlsxCellNotes, readXlsxCellNoteVmlBoxes } from "../../cell-notes.js";
import { relationships } from "../../pivot-xml.js";
import type { NativeCell, NativeSheetData, NativeWorkbookData } from "../../native/model.js";
import { writeNativeWorkbook } from "../../native/writer.js";
import { readNativeWorkbook } from "../../native/reader.js";

function fixture(): { workbook: NativeWorkbookData; sheet: NativeSheetData } {
  const sheet: NativeSheetData = {
    name: "数据 & Notes",
    properties: { defaultRowHeight: 18, defaultColWidth: 13.7109375 },
    rows: new Map(),
    columns: new Map(),
    merges: [],
    images: [],
  };
  return {
    workbook: {
      properties: {},
      calcProperties: { fullCalcOnLoad: true },
      sheets: [sheet],
      images: [],
    },
    sheet,
  };
}

function put(
  sheet: NativeSheetData,
  rowNumber: number,
  column: number,
  value: unknown,
  extras: Partial<NativeCell> = {},
): NativeCell {
  let label = "";
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26))
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  let row = sheet.rows.get(rowNumber);
  if (!row) {
    row = { number: rowNumber, cells: new Map() };
    sheet.rows.set(rowNumber, row);
  }
  const cell = { address: `${label}${rowNumber}`, value, style: {}, ...extras };
  row.cells.set(column, cell);
  return cell;
}

function text(entries: Record<string, Uint8Array>, path: string): string {
  return strFromU8(entries[path]!);
}

describe("first-party XLSX writer", () => {
  test("round-trips overlapping literal OOXML escape sequences", () => {
    const { workbook, sheet } = fixture();
    const value = "_x005F_x0041_ _x0042__x005F_x0043_";
    put(sheet, 1, 1, value);
    put(sheet, 1, 2, { formula: '"literal"', result: value });
    const restored = readNativeWorkbook(writeNativeWorkbook(workbook)).sheets[0]!;
    expect(restored.rows.get(1)?.cells.get(1)?.value).toBe(value);
    expect(restored.rows.get(1)?.cells.get(2)?.result).toBe(value);
  });

  test("writes valid XML and preserves sparse dimensions without allocating gaps", () => {
    const { workbook, sheet } = fixture();
    put(sheet, 1_048_576, 16_384, "last");
    put(sheet, 1, 1, "first");
    sheet.rows.set(99, { number: 99, hidden: true, height: 27, cells: new Map() });
    sheet.columns.set(3, { number: 3, width: 20, hidden: true });
    const entries = unzipSync(writeNativeWorkbook(workbook));
    for (const [path, bytes] of Object.entries(entries))
      if (path.endsWith(".xml") || path.endsWith(".rels"))
        expect(XMLValidator.validate(strFromU8(bytes)), path).toBe(true);
    const xml = text(entries, "xl/worksheets/sheet1.xml");
    expect(xml).toContain('<dimension ref="A1:XFD1048576"/>');
    expect(xml.match(/<row\b/g)).toHaveLength(3);
    expect(xml.indexOf('<row r="1"')).toBeLessThan(xml.indexOf('<row r="99"'));
    expect(xml).toContain('<col min="3" max="3" width="20" hidden="1" customWidth="1"/>');
    expect(relationships(entries, "xl/workbook.xml").get("rId1")?.target).toBe(
      "xl/worksheets/sheet1.xml",
    );
  });

  test("distinguishes literals, cached formula types, blanks and XML escapes", () => {
    const { workbook, sheet } = fixture();
    put(sheet, 1, 1, " =SUM(A1)&<>\n_x0041_\u0001 ");
    put(sheet, 1, 2, { formula: 'IF(TRUE,"<&>","")', result: "<&>" });
    put(sheet, 1, 3, { formula: "1=2", result: false });
    put(sheet, 1, 4, { formula: "1/0", result: { error: "#DIV/0!" } });
    put(sheet, 1, 5, { formula: "NOW()" });
    put(sheet, 1, 6, { error: "#VALUE!" });
    put(sheet, 1, 7, true);
    put(sheet, 1, 8, -12.5);
    put(sheet, 1, 9, null);
    const entries = unzipSync(writeNativeWorkbook(workbook));
    const xml = text(entries, "xl/worksheets/sheet1.xml");
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain(
      't="inlineStr"><is><t xml:space="preserve"> =SUM(A1)&amp;&lt;&gt;&#10;_x005F_x0041__x0001_ </t></is>',
    );
    expect(xml).toContain(
      '<c r="B1" t="str"><f>IF(TRUE,&quot;&lt;&amp;&gt;&quot;,&quot;&quot;)</f><v>&lt;&amp;&gt;</v></c>',
    );
    expect(xml).toContain('<c r="C1" t="b"><f>1=2</f><v>0</v></c>');
    expect(xml).toContain('<c r="D1" t="e"><f>1/0</f><v>#DIV/0!</v></c>');
    expect(xml).toContain('<c r="E1"><f>NOW()</f></c>');
    expect(xml).toContain('<c r="F1" t="e"><v>#VALUE!</v></c>');
    expect(xml).toContain('<c r="G1" t="b"><v>1</v></c>');
    expect(xml).toContain('<c r="H1"><v>-12.5</v></c>');
    expect(xml).toContain('<c r="I1"></c>');
  });

  test("deduplicates fonts, number formats, gradients and complete cell styles", () => {
    const { workbook, sheet } = fixture();
    const style = {
      font: {
        name: "Arial",
        size: 14,
        bold: true,
        underline: "double",
        color: { argb: "FF112233" },
      },
      fill: {
        type: "gradient",
        gradient: "path",
        center: { left: 0.2, right: 0.8, top: 0.3, bottom: 0.7 },
        stops: [
          { position: 0, color: { argb: "FF000000" } },
          { position: 1, color: { argb: "FFFFFFFF" } },
        ],
      },
      border: { diagonal: { up: true, down: true, style: "thin", color: { argb: "FF000000" } } },
      alignment: { vertical: "middle", wrapText: true, textRotation: -42, readingOrder: "rtl" },
      protection: { locked: false, hidden: true },
    };
    put(sheet, 1, 1, 1, { style, numFmt: '0.0000" dollars"' });
    put(sheet, 1, 2, 2, { style: structuredClone(style), numFmt: '0.0000" dollars"' });
    const entries = unzipSync(writeNativeWorkbook(workbook));
    const xml = text(entries, "xl/styles.xml");
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain('<fonts count="2">');
    expect(xml).toContain('<cellXfs count="2">');
    expect(xml).toContain(
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0000&quot; dollars&quot;"/>',
    );
    expect(xml).toContain(
      '<gradientFill type="path" left="0.2" right="0.8" top="0.3" bottom="0.7">',
    );
    expect(xml).toContain('<border diagonalUp="1" diagonalDown="1">');
    expect(xml).toContain('vertical="center" wrapText="1" textRotation="132" readingOrder="2"');
    expect(xml).toContain('<protection locked="0" hidden="1"/>');
    expect(text(entries, "xl/worksheets/sheet1.xml")).toContain('<c r="B1" s="1"><v>2</v></c>');
  });

  test("writes frozen panes, merges and comments with finalizer-compatible VML", () => {
    const { workbook, sheet } = fixture();
    put(sheet, 3, 2, "hello", {
      note: { texts: [{ text: " first\n" }, { text: "second & last " }] },
    });
    sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];
    sheet.merges = ["B3:D4"];
    const entries = unzipSync(writeNativeWorkbook(workbook));
    expect(text(entries, "xl/worksheets/sheet1.xml")).toContain(
      '<pane xSplit="1" ySplit="2" topLeftCell="B3" activePane="bottomRight" state="frozen"/>',
    );
    expect(text(entries, "xl/worksheets/sheet1.xml")).toContain(
      '<mergeCells count="1"><mergeCell ref="B3:D4"/></mergeCells>',
    );
    expect(readXlsxCellNotes(entries)[0]?.get("B3")).toMatchObject({
      text: " first\nsecond & last ",
      author: "Author",
    });
    expect(readXlsxCellNoteVmlBoxes(entries)[0]?.get("B3")).toMatchObject({
      left: 140.4,
      top: 14,
      width: 130.4,
      height: 78.8,
    });
    expect(XMLValidator.validate(text(entries, "xl/drawings/vmlDrawing1.vml"))).toBe(true);
  });

  test("writes shared media once and standards-valid one-cell image anchors", () => {
    const { workbook, sheet } = fixture();
    workbook.images.push({ buffer: new Uint8Array([1, 2, 3]), extension: "png" });
    const range = {
      tl: { nativeCol: 1, nativeColOff: 28575, nativeRow: 2, nativeRowOff: 38100 },
      ext: { width: 70, height: 35 },
    };
    sheet.images.push({ imageId: 0, range }, { imageId: 0, range });
    const entries = unzipSync(writeNativeWorkbook(workbook));
    expect(entries["xl/media/image1.png"]).toEqual(new Uint8Array([1, 2, 3]));
    expect(Object.keys(entries).filter((path) => path.startsWith("xl/media/"))).toHaveLength(1);
    const drawing = text(entries, "xl/drawings/drawing1.xml");
    expect(XMLValidator.validate(drawing)).toBe(true);
    expect(drawing.match(/<xdr:oneCellAnchor>/g)).toHaveLength(2);
    expect(drawing).not.toContain("editAs=");
    expect(drawing).toContain('<xdr:ext cx="666750" cy="333375"/>');
    for (const relationship of relationships(entries, "xl/drawings/drawing1.xml").values())
      expect(entries[relationship.target]).toBeDefined();
  });

  test("serializes date epochs including Excel's fictitious leap day", () => {
    const { workbook, sheet } = fixture();
    put(sheet, 1, 1, new Date("1900-01-01T00:00:00.000Z"));
    put(sheet, 2, 1, new Date("1900-03-01T00:00:00.000Z"));
    put(sheet, 3, 1, new Date("1904-01-01T12:00:00.000Z"));
    let entries = unzipSync(writeNativeWorkbook(workbook));
    expect(text(entries, "xl/worksheets/sheet1.xml")).toContain('<c r="A1" s="1"><v>1</v></c>');
    expect(text(entries, "xl/worksheets/sheet1.xml")).toContain('<c r="A2" s="1"><v>61</v></c>');
    workbook.properties.date1904 = true;
    entries = unzipSync(writeNativeWorkbook(workbook));
    expect(text(entries, "xl/worksheets/sheet1.xml")).toContain('<c r="A3" s="1"><v>0.5</v></c>');
    expect(text(entries, "xl/workbook.xml")).toContain('date1904="1"');
  });
});
