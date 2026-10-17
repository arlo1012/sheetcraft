import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { encodeXlsx, decodeXlsx } from "../../index.js";
import { nativeTextBoxAnchorXml } from "../../native/writer-textboxes.js";
import { assertFreshTextBoxProfile } from "../../native/textbox-export-profile.js";
import { writeXlsxTextBoxes } from "../../native-textboxes.js";
import { nativeColumnFixture } from "../charts/native-column-fixture.js";
import { child, parseXml } from "../../pivot-xml.js";
import { readNativePictureStyle } from "../../picture-native-style.js";
import { webCreatedTextBox } from "./web-created-textbox.js";
const theme = "xl/theme/theme1.xml";
const part = "xl/drawings/drawing1.xml";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const xdr = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
function fixture() {
  const book = createWorkbook({ id: "profile", sheetId: "s", sheetName: "Text" });
  const sheet = getActiveSheet(book);
  const drawing = structuredClone(webCreatedTextBox);
  sheet.drawings = [drawing];
  return { book, sheet, drawing };
}
const entries = (body = "", themeBody = "") => ({
  [theme]: strToU8(`<a:theme xmlns:a="${a}"><a:themeElements/>${themeBody}</a:theme>`),
  [part]: strToU8(`<xdr:wsDr xmlns:xdr="${xdr}" xmlns:a="${a}">${body}</xdr:wsDr>`),
});
describe("fresh Excel horizontal text box export profile", () => {
  test.each(["rtl", "ltr"] as const)(
    "normalizes %s only in fresh export and reports actual changes",
    async (order) => {
      const { book, sheet, drawing } = fixture();
      drawing.shapeText!.layout.lineOrder = order;
      const second = structuredClone(drawing);
      second.id = "second";
      sheet.drawings!.push(second);
      const before = serializeWorkbook(book);
      const result = await encodeXlsx(book);
      expect(serializeWorkbook(book)).toEqual(before);
      const xml = strFromU8(unzipSync(result.bytes)[part]!);
      expect(xml).not.toContain('rtlCol="1"');
      expect(xml.match(/rtlCol="0"/g)).toHaveLength(2);
      expect(xml).not.toContain("<a:ln><a:noFill/></a:ln>");
      expect(xml.match(/<a:effectLst\/>/g)!.length).toBeGreaterThan(2);
      const warnings = result.report.issues.filter(
        (issue) => issue.code === "textbox-layout-normalized",
      );
      expect(warnings).toEqual(
        order === "rtl"
          ? [
              {
                code: "textbox-layout-normalized",
                severity: "warning",
                count: 2,
                locations: [drawing, second].map(
                  (d) => `Text.drawings[${JSON.stringify(d.id)}].shapeText.layout.lineOrder`,
                ),
              },
            ]
          : [],
      );
      const read = getActiveSheet((await decodeXlsx(result.bytes)).workbook);
      expect(
        read.drawings!.map((d) =>
          d.kind === "textBox" ? d.shapeText!.layout.lineOrder : undefined,
        ),
      ).toEqual(["ltr", "ltr"]);
      expect(read.drawings!.map((d) => (d.kind === "textBox" ? d.text : undefined))).toEqual([
        drawing.text,
        second.text,
      ]);
    },
  );
  test("legacy anchor and arbitrary archive writer keep explicit text noLine and rtlCol", async () => {
    const { book, sheet, drawing } = fixture();
    const xml = nativeTextBoxAnchorXml(drawing, sheet, 1);
    expect(xml).toContain('rtlCol="1"');
    expect(xml).toContain("<a:ln><a:noFill/></a:ln>");
    sheet.drawings = [];
    const archive = unzipSync((await encodeXlsx(book)).bytes);
    archive[theme] = strToU8(`<a:theme xmlns:a="${a}"><a:objectDefaults/></a:theme>`);
    sheet.drawings = [drawing];
    writeXlsxTextBoxes(archive, book);
    expect(strFromU8(archive[part]!)).toContain('rtlCol="1"');
    expect(() => writeXlsxTextBoxes(archive, book, { freshExport: true })).toThrow(/inheritance/);
  });
  test.each([" A中文😀 B \n\n尾部 \n", "", "\n", "  plain  "])(
    "preserves supported text, paragraphs, geometry and shape outline: %j",
    (text) => {
      const { sheet, drawing } = fixture();
      drawing.text = text;
      drawing.shapeText!.characterRuns = text.includes("😀")
        ? [{ start: 4, end: 6, bold: true, color: "#112233", fontFamily: "Arial" }]
        : [];
      const before = structuredClone(drawing);
      const legacy = nativeTextBoxAnchorXml(drawing, sheet, 1);
      const compat = nativeTextBoxAnchorXml(drawing, sheet, 1, "excel-horizontal-editable");
      // The only generated XML differences are exactly A + B, scoped to txBody.
      const [shape, body] = legacy.split("<xdr:txBody>");
      expect(compat).toBe(
        shape +
          "<xdr:txBody>" +
          body!.replace('rtlCol="1"', 'rtlCol="0"').replaceAll("<a:ln><a:noFill/></a:ln>", ""),
      );
      expect(drawing).toEqual(before);
      expect(compat).toContain("<a:effectLst/>");
      expect(compat).toContain('<a:ln w="9525"');
    },
  );
  test.each([false, true])(
    "default/custom theme does not introduce glyph inheritance (custom=%s)",
    async (custom) => {
      const { book } = fixture();
      if (custom)
        book.theme = { ...structuredClone(DEFAULT_WORKBOOK_THEME), name: "Custom text theme" };
      const archive = unzipSync((await encodeXlsx(book)).bytes);
      expect(() => assertFreshTextBoxProfile(archive)).not.toThrow();
      expect(strFromU8(archive[part]!)).not.toContain("<xdr:style>");
      expect(strFromU8(archive[part]!)).toContain("<a:lstStyle/>");
    },
  );
  test.each([
    "<a:objectDefaults/>",
    "<a:objectDefaults><a:txDef><a:lstStyle/></a:txDef></a:objectDefaults>",
    `<b:objectDefaults xmlns:b="${a}"/>`,
    '<objectDefaults xmlns="http://schemas.openxmlformats.org/drawingml/2006/main"/>',
    '<a:objectDefaults xmlns:a="urn:unknown"/>',
  ])("fails closed for theme inheritance and namespace variants: %s", (body) => {
    expect(() => assertFreshTextBoxProfile(entries("", body))).toThrow(/inheritance/);
  });
  test.each([
    '<xdr:sp><xdr:style><a:fontRef idx="minor"/></xdr:style></xdr:sp>',
    "<xdr:sp><xdr:txBody><a:lstStyle><a:lvl1pPr/></a:lstStyle></xdr:txBody></xdr:sp>",
    "<xdr:sp><xdr:txBody><a:p><a:r><a:rPr><a:effectLst><a:outerShdw/></a:effectLst></a:rPr></a:r></a:p></xdr:txBody></xdr:sp>",
    "<xdr:sp><xdr:txBody><a:p><a:r><a:rPr><a:ln><a:solidFill/></a:ln></a:rPr></a:r></a:p></xdr:txBody></xdr:sp>",
  ])("rejects unknown existing text inheritance/effects: %s", (body) => {
    expect(() => assertFreshTextBoxProfile(entries(body))).toThrow(/inheritance/);
  });
  test("leaves existing shape and picture line/shadow and theme effects alone", () => {
    const effect =
      '<a:ln><a:solidFill><a:srgbClr val="123456"/></a:solidFill></a:ln><a:effectLst><a:outerShdw blurRad="12700" dist="12700" dir="0"><a:srgbClr val="000000"/></a:outerShdw></a:effectLst>';
    const archive = entries(
      `<xdr:pic><xdr:spPr>${effect}</xdr:spPr></xdr:pic><xdr:sp><xdr:spPr>${effect}</xdr:spPr></xdr:sp>`,
      `<a:themeElements><a:fmtScheme><a:effectStyleLst><a:effectStyle>${effect}</a:effectStyle></a:effectStyleLst></a:fmtScheme></a:themeElements>`,
    );
    const before = structuredClone(archive);
    expect(() => assertFreshTextBoxProfile(archive)).not.toThrow();
    expect(archive).toEqual(before);
  });
  test("mixed rich/plain text export retains picture outline/shadow, PNG, chart relations and reader semantics", async () => {
    const { workbook: book, sheet } = nativeColumnFixture();
    const png = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3OsQ0AIAwDwWzBMAzB/hISC7BD2CApkOXmC5cvX+x7stpYs9xvHwAAALAD1AddDwAAAD9AfdD1AAAA8APUB10PAAAAO+ABy7aMl7hArRwAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const style = readNativePictureStyle(
      child(
        parseXml(
          strToU8(
            `<a:spPr xmlns:a="${a}"><a:ln w="19050"><a:solidFill><a:srgbClr val="FF0000"><a:alpha val="75000"/></a:srgbClr></a:solidFill></a:ln><a:effectLst><a:outerShdw blurRad="50800" dist="38100" dir="2700000" algn="tl" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw></a:effectLst></a:spPr>`,
          ),
        ),
        "spPr",
      ),
      "picture.spPr",
      { colors: {}, fonts: {} },
    ).style;
    sheet.floatingImages = [
      {
        id: "picture",
        assetId: "png",
        altText: "Transparent PNG",
        frame: {
          kind: "object-frame-v1",
          anchor: { mode: "fixed", x: 650, y: 20, size: { width: 64, height: 64 } },
          source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
          angleDeg: 0,
        },
        transform: {
          appearance: {
            detailedStyle: style,
            suppressThemeEffects: { outline: true, shadow: true, reflection: true, bevel: true },
          },
        },
      },
    ];
    const images = [
      { assetId: "png", bytes: png, width: 32, height: 32, extension: "png" as const },
    ];
    const base = await encodeXlsx(book, { images });
    const archive = unzipSync(base.bytes),
      beforeXml = strFromU8(archive[part]!);
    const rich = structuredClone(webCreatedTextBox);
    rich.text = " 中文😀 tail \n\n End ";
    rich.shapeText!.characterRuns = [
      { start: 3, end: 5, color: "#112233", bold: true, fontFamily: "Arial" },
    ];
    const plain = structuredClone(webCreatedTextBox);
    plain.id = "plain";
    plain.name = "Plain";
    plain.text = "  plain  ";
    sheet.drawings!.push(rich, plain);
    writeXlsxTextBoxes(archive, book);
    const legacy = await decodeXlsx(zipSync(archive));
    const before = serializeWorkbook(book),
      output = await encodeXlsx(book, { images });
    expect(serializeWorkbook(book)).toEqual(before);
    const after = unzipSync(output.bytes),
      afterXml = strFromU8(after[part]!);
    for (const tag of ["pic", "graphicFrame"]) {
      const expression = new RegExp(`<xdr:${tag}>[\\s\\S]*?</xdr:${tag}>`, "g");
      expect(afterXml.match(expression)).toEqual(beforeXml.match(expression));
    }
    expect(after["xl/drawings/_rels/drawing1.xml.rels"]).toEqual(
      archive["xl/drawings/_rels/drawing1.xml.rels"],
    );
    const read = await decodeXlsx(output.bytes),
      restored = getActiveSheet(read.workbook);
    expect(read.images![0]!.bytes).toEqual(png);
    expect(restored.floatingImages).toEqual(getActiveSheet(legacy.workbook).floatingImages);
    const old = getActiveSheet(legacy.workbook).drawings!;
    for (const actual of restored.drawings!) {
      const expected = structuredClone(old.find((d) => d.name === actual.name)!);
      if (expected.kind === "textBox") expected.shapeText!.layout.lineOrder = "ltr";
      expect(actual).toEqual(expected);
    }
  });
  test.each([
    `<a:theme xmlns:a="${a}"/><a:theme xmlns:a="${a}"/>`,
    `<a:theme xmlns:a="${a}"/><a:extra xmlns:a="${a}"/>`,
    `<a:theme xmlns:a="${a}" bogus:attr="x"><a:themeElements/></a:theme>`,
    `<a:theme xmlns:a="${a}"><a:themeElements r:attr="x"/></a:theme>`,
    `<a:theme xmlns:a="${a}"><c:x xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/><c:x/></a:theme>`,
    `<a:theme xmlns:a="${a}"><a:themeElements xml:space="preserve" xmlns:xml="urn:wrong"/></a:theme>`,
    `<a:theme xmlns:a="${a}"><a/></a:theme>`,
    `<a:theme xmlns:a="${a}"><a:themeElements></a:theme>`,
  ])("rejects malformed roots, namespaces and unbound attributes: %s", (source) => {
    const archive = entries();
    archive[theme] = strToU8(source);
    expect(() => assertFreshTextBoxProfile(archive)).toThrow(/inheritance/);
  });
  test("accepts correctly scoped relationship attributes and the built-in xml prefix", () => {
    const archive = entries(
      `<xdr:pic><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/></xdr:blipFill></xdr:pic><xdr:sp><xdr:txBody><a:lstStyle/><a:p><a:r><a:t xml:space="preserve"> text </a:t></a:r></a:p></xdr:txBody></xdr:sp>`,
    );
    expect(() => assertFreshTextBoxProfile(archive)).not.toThrow();
  });
  test.each(["vertical", "stacked"] as const)(
    "does not extend direction support: %s",
    (direction) => {
      const { drawing, sheet } = fixture();
      Object.assign(drawing.shapeText!.layout, { direction });
      expect(() => nativeTextBoxAnchorXml(drawing, sheet, 1, "excel-horizontal-editable")).toThrow(
        /direction/,
      );
    },
  );
});
