import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbook, getActiveSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { encodeXlsx, type XlsxImageAsset } from "../../index.js";
import { attr, child, nodes, type XmlNode } from "../../pivot-xml.js";

const ASSET: XlsxImageAsset = {
  assetId: "shared-resource",
  bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  extension: "png",
  width: 20,
  height: 10,
};

function image(id: string, altText: string, row = 0): FloatingImage {
  return {
    id,
    assetId: ASSET.assetId,
    altText,
    anchor: { row, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 20,
    height: 10,
  };
}

function fixture(...images: FloatingImage[]) {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  sheet.name = "Descriptions";
  sheet.floatingImages.push(...images);
  return { workbook, sheet };
}

function descriptions(bytes: Uint8Array): string[] {
  // Enable numeric entity decoding so attribute whitespace is checked after XML parsing.
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    htmlEntities: true,
  });
  const root = child(parser.parse(strFromU8(bytes)) as XmlNode, "wsDr");
  return nodes(root.oneCellAnchor).map((anchor) =>
    attr(child(child(child(anchor, "pic"), "nvPicPr"), "cNvPr"), "descr"),
  );
}

describe("floating image XLSX altText", () => {
  test("keeps descriptions on each placement while deduplicating the shared resource", async () => {
    const { workbook } = fixture(
      image("first-image", "First placement"),
      image("second-image", "Second placement", 2),
    );
    const before = serializeWorkbook(workbook);
    const archive = unzipSync((await encodeXlsx(workbook, { images: [ASSET] })).bytes);

    expect(descriptions(archive["xl/drawings/drawing1.xml"]!)).toEqual([
      "First placement",
      "Second placement",
    ]);
    expect(Object.keys(archive).filter((path) => path.startsWith("xl/media/"))).toEqual([
      "xl/media/image1.png",
    ]);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("escapes XML attributes and preserves CR, LF and TAB with numeric references", async () => {
    const altText =
      " & < > \" '\r\n\t _x0041_ _x005F_x0042_ _x0041__x0042_ &#13; &#xD; &amp; &quot; ";
    const { workbook } = fixture(image("escaped-image", altText));
    const before = serializeWorkbook(workbook);
    const archive = unzipSync((await encodeXlsx(workbook, { images: [ASSET] })).bytes);
    const drawing = archive["xl/drawings/drawing1.xml"]!;
    const xml = strFromU8(drawing);

    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain(
      'descr=" &amp; &lt; &gt; &quot; &apos;&#13;&#10;&#9; _x0041_ _x005F_x0042_ _x0041__x0042_ &amp;#13; &amp;#xD; &amp;amp; &amp;quot; "',
    );
    expect(descriptions(drawing)).toEqual([altText]);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test.each([
    ["empty", ""],
    ["Unicode and emoji", "销售图表 café العربية 📊 😀"],
    ["legal XML scalar boundaries", "\u0020\uD7FF\uE000\uFFFD\u{10000}\u{10FFFF}"],
  ])("preserves %s descriptions", async (_name, altText) => {
    const { workbook } = fixture(image("valid-image", altText!));
    const before = serializeWorkbook(workbook);
    const archive = unzipSync((await encodeXlsx(workbook, { images: [ASSET] })).bytes);

    expect(descriptions(archive["xl/drawings/drawing1.xml"]!)).toEqual([altText]);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test.each([
    ["NUL", "\u0000", "U+0000"],
    ["control U+0001", "\u0001", "U+0001"],
    ["control U+0008", "\u0008", "U+0008"],
    ["vertical tab", "\u000B", "U+000B"],
    ["form feed", "\u000C", "U+000C"],
    ["control U+000E", "\u000E", "U+000E"],
    ["control U+001F", "\u001F", "U+001F"],
    ["noncharacter U+FFFE", "\uFFFE", "U+FFFE"],
    ["noncharacter U+FFFF", "\uFFFF", "U+FFFF"],
    ["unpaired high surrogate", "\uD800", "U+D800"],
    ["unpaired low surrogate", "\uDC00", "U+DC00"],
    ["high surrogate before text", "\uD800x", "U+D800"],
    ["reversed surrogate pair", "\uDC00\uD800", "U+DC00"],
  ])(
    "rejects %s with placement diagnostics and preserves Core state",
    async (_name, invalid, scalar) => {
      const { workbook } = fixture(image("bad-image", `before ${invalid} after`));
      const before = serializeWorkbook(workbook);

      await expect(encodeXlsx(workbook, { images: [ASSET] })).rejects.toThrow(
        `Invalid XML character ${scalar} in XLSX image altText at Descriptions!A1.floatingImages["bad-image"].altText.`,
      );
      expect(serializeWorkbook(workbook)).toEqual(before);
      expect(ASSET.bytes).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    },
  );

  test("does not export descriptions or resources for hidden placements", async () => {
    const { workbook } = fixture({ ...image("hidden-image", "\uD800"), hidden: true });
    const before = serializeWorkbook(workbook);
    const archive = unzipSync((await encodeXlsx(workbook)).bytes);

    expect(archive["xl/drawings/drawing1.xml"]).toBeUndefined();
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
});
