import { describe, expect, test } from "vitest";
import { addNativeCellImages } from "../../native-cell-images.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function entries(): Record<string, Uint8Array> {
  return {
    "[Content_Types].xml": encoder.encode(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    ),
    "xl/_rels/workbook.xml.rels": encoder.encode(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId4" Type="theme" Target="theme/theme1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": encoder.encode(
      '<worksheet><sheetData><row r="1"><c r="A1" s="7"><v>ignored</v></c><c r="D1" s="9"><f>SUM(A1:B1)</f><v>3</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B2"/></mergeCells></worksheet>',
    ),
    "xl/worksheets/sheet2.xml": encoder.encode(
      '<worksheet><sheetData><row r="3"><c r="C3" s="4"><v>ignored</v></c></row></sheetData></worksheet>',
    ),
    "xl/media/image1.png": new Uint8Array([1]),
    "xl/media/image2.png": new Uint8Array([2]),
  };
}

function text(entries: Readonly<Record<string, Uint8Array>>, name: string): string {
  const value = entries[name];
  if (!value) throw new Error(`Missing ${name}`);
  return decoder.decode(value);
}

describe("native Excel cell images", () => {
  test("writes rich data for two sheets that share one media asset", () => {
    const output = entries();
    addNativeCellImages(output, [
      { sheetIndex: 0, address: "A1", mediaFilename: "image1.png", altText: 'A & < "one"' },
      { sheetIndex: 1, address: "C3", mediaFilename: "xl/media/image1.png", altText: "Second" },
    ]);

    expect(text(output, "xl/worksheets/sheet1.xml")).toContain(
      '<c r="A1" s="7" t="e" vm="1"><v>#VALUE!</v></c>',
    );
    expect(text(output, "xl/worksheets/sheet1.xml")).toContain('<mergeCell ref="A1:B2"/>');
    expect(text(output, "xl/worksheets/sheet1.xml")).toContain(
      '<c r="D1" s="9"><f>SUM(A1:B1)</f><v>3</v></c>',
    );
    expect(text(output, "xl/worksheets/sheet2.xml")).toContain(
      '<c r="C3" s="4" t="e" vm="2"><v>#VALUE!</v></c>',
    );
    expect(text(output, "xl/worksheets/sheet1.xml")).not.toContain("<drawing");
    expect(text(output, "xl/metadata.xml")).toContain(
      'futureMetadata name="XLRICHVALUE" count="2"',
    );
    expect(text(output, "xl/metadata.xml")).toContain(
      '<metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"/>',
    );
    expect(text(output, "xl/metadata.xml")).toContain('<xlrd:rvb i="0"/>');
    expect(text(output, "xl/metadata.xml")).toContain('<xlrd:rvb i="1"/>');
    expect(text(output, "xl/richData/rdrichvalue.xml")).toContain(
      '<rv s="0"><v>0</v><v>5</v><v>A &amp; &lt; &quot;one&quot;</v></rv>',
    );
    expect(text(output, "xl/richData/rdrichvalue.xml")).toContain(
      '<rv s="0"><v>0</v><v>5</v><v>Second</v></rv>',
    );
    expect(text(output, "xl/richData/rdrichvaluestructure.xml")).toContain('<k n="Text" t="s"/>');
    expect(text(output, "xl/richData/richValueRel.xml").match(/r:id="rId1"/g)).toHaveLength(1);
    expect(text(output, "xl/richData/_rels/richValueRel.xml.rels")).toContain(
      'Target="../media/image1.png"',
    );
    expect(text(output, "[Content_Types].xml")).toContain(
      'PartName="/xl/richData/rdrichvalue.xml"',
    );
    expect(text(output, "xl/_rels/workbook.xml.rels")).toContain(
      'relationships/rdRichValue" Target="richData/rdrichvalue.xml"',
    );
    expect(text(output, "xl/_rels/workbook.xml.rels").match(/<Relationship /g)).toHaveLength(6);
    expect(Object.keys(output)).toEqual(
      expect.arrayContaining([
        "xl/metadata.xml",
        "xl/richData/rdrichvalue.xml",
        "xl/richData/rdrichvaluestructure.xml",
        "xl/richData/rdRichValueTypes.xml",
        "xl/richData/richValueRel.xml",
        "xl/richData/_rels/richValueRel.xml.rels",
      ]),
    );
  });

  test("omits the Text field when every alt is empty and filters XML-invalid controls", () => {
    const output = entries();
    addNativeCellImages(output, [
      { sheetIndex: 0, address: "A1", mediaFilename: "image2.png", altText: "\u0000\u0001" },
    ]);

    expect(text(output, "xl/richData/rdrichvaluestructure.xml")).not.toContain('n="Text"');
    expect(text(output, "xl/richData/rdrichvalue.xml")).toContain(
      '<rv s="0"><v>0</v><v>5</v></rv>',
    );
    expect(text(output, "xl/richData/rdrichvalue.xml")).not.toContain("\u0000");
    expect(text(output, "xl/richData/rdrichvalue.xml")).not.toContain("\u0001");
  });

  test("preserves permitted whitespace while escaping text in alternate values", () => {
    const output = entries();
    addNativeCellImages(output, [
      { sheetIndex: 0, address: "A1", mediaFilename: "image2.png", altText: "Line\t\n\u000b<&" },
    ]);

    expect(text(output, "xl/richData/rdrichvalue.xml")).toContain("Line\t\n&lt;&amp;");
    expect(text(output, "xl/richData/rdrichvalue.xml")).not.toContain("\u000b");
  });

  test("fails closed before writes when an image cell or media entry is missing", () => {
    const output = entries();
    const before = text(output, "xl/worksheets/sheet1.xml");

    expect(() =>
      addNativeCellImages(output, [
        { sheetIndex: 0, address: "B1", mediaFilename: "image1.png", altText: "Missing cell" },
      ]),
    ).toThrow("Missing XLSX cell");
    expect(text(output, "xl/worksheets/sheet1.xml")).toBe(before);
    expect(() =>
      addNativeCellImages(entries(), [
        { sheetIndex: 0, address: "A1", mediaFilename: "missing.png", altText: "Missing media" },
      ]),
    ).toThrow("Missing XLSX media");
  });
});
