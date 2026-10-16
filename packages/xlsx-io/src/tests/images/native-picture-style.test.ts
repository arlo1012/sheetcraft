import { describe, expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createHash } from "node:crypto";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { child, parseXml } from "../../pivot-xml.js";
import {
  readNativePictureStyle,
  writeNativePictureStyle,
  type NativePictureStyle,
} from "../../picture-native-style.js";
import { isSupportedNativePictureFrame } from "../../picture-capabilities.js";
import { decodeXlsx, encodeXlsx } from "../../index.js";

const line =
  '<a:ln w="9525"><a:solidFill><a:srgbClr val="336699"><a:alpha val="40001"/></a:srgbClr></a:solidFill></a:ln>';
const shadow =
  '<a:effectLst><a:outerShdw blurRad="50800" dist="38100" dir="2700000" algn="tl" rotWithShape="0"><a:prstClr val="black"><a:alpha val="40000"/></a:prstClr></a:outerShdw></a:effectLst>';
function read(xml: string) {
  return readNativePictureStyle(
    child(
      parseXml(
        strToU8(
          `<a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${xml}</a:spPr>`,
        ),
      ),
      "spPr",
    ),
    "picture.spPr",
    { colors: { accent1: "#123456" }, fonts: {} },
  );
}
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3OsQ0AIAwDwWzBMAzB/hISC7BD2CApkOXmC5cvX+x7stpYs9xvHwAAALAD1AddDwAAAD9AfdD1AAAA8APUB10PAAAAO+ABy7aMl7hArRwAAAAASUVORK5CYII=",
    "base64",
  ),
);
const asset = { assetId: "source", bytes: png, width: 32, height: 32, extension: "png" as const };
function fixture(style: NativePictureStyle | undefined = read(line + shadow).style) {
  const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Pictures" });
  const picture: FramedFloatingImage = {
    id: "picture",
    assetId: "source",
    altText: "Transparent picture",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 10, y: 10, size: { width: 120, height: 80 } },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 0,
    },
    transform: {
      appearance: {
        suppressThemeEffects: { outline: true, shadow: true, reflection: true, bevel: true },
        ...(style ? { detailedStyle: style } : {}),
      },
    },
  };
  getActiveSheet(workbook).floatingImages.push(picture);
  return { workbook, picture };
}
const part = "xl/drawings/drawing1.xml";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("narrow native picture line and outer shadow", () => {
  test("package theme materialization follows the actual nondefault theme relationship", async () => {
    const { workbook } = fixture(read(line).style);
    const entries = unzipSync((await encodeXlsx(workbook, { images: [asset] })).bytes);
    const theme = strFromU8(entries["xl/theme/theme1.xml"]!);
    const expected = /<a:accent1><a:srgbClr val="([A-Fa-f0-9]{6})"/.exec(theme)![1]!.toUpperCase();
    entries[part] = strToU8(
      strFromU8(entries[part]!).replace(
        /<a:srgbClr[^>]*>.*?<\/a:srgbClr>/,
        '<a:schemeClr val="accent1"><a:alpha val="40001"/></a:schemeClr>',
      ),
    );
    entries["xl/theme/picture-theme.xml"] = entries["xl/theme/theme1.xml"]!;
    delete entries["xl/theme/theme1.xml"];
    for (const path of ["[Content_Types].xml", "xl/_rels/workbook.xml.rels"])
      entries[path] = strToU8(
        strFromU8(entries[path]!).replaceAll("theme1.xml", "picture-theme.xml"),
      );
    const decoded = await decodeXlsx(zipSync(entries));
    expect(
      (getActiveSheet(decoded.workbook).floatingImages[0]! as FramedFloatingImage).transform
        ?.appearance?.detailedStyle?.line,
    ).toMatchObject({ value: { paint: { color: { rgb: `#${expected}` }, opacity: 0.40001 } } });
    expect(decoded.report.issues).toContainEqual(
      expect.objectContaining({
        code: "style-omitted",
        severity: "warning",
        locations: expect.arrayContaining([expect.stringContaining("themeMaterialization")]),
      }),
    );
    const relationships = strFromU8(entries["xl/_rels/workbook.xml.rels"]!);
    const relation = /<Relationship [^>]*Type="[^"]*\/theme"[^>]*\/>/.exec(relationships)![0];
    entries["xl/_rels/workbook.xml.rels"] = strToU8(relationships.replace(relation, ""));
    await expect(decodeXlsx(zipSync(entries))).rejects.toThrow();
    entries["xl/_rels/workbook.xml.rels"] = strToU8(
      relationships.replace(
        "</Relationships>",
        relation.replace(/Id="[^"]*"/, 'Id="extraTheme"') + "</Relationships>",
      ),
    );
    await expect(decodeXlsx(zipSync(entries))).rejects.toThrow();
    entries["xl/_rels/workbook.xml.rels"] = strToU8(relationships);
    const contentTypes = entries["[Content_Types].xml"]!;
    entries["[Content_Types].xml"] = strToU8(
      strFromU8(contentTypes).replace(
        "application/vnd.openxmlformats-officedocument.theme+xml",
        "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
      ),
    );
    await expect(decodeXlsx(zipSync(entries))).rejects.toThrow();
    entries["[Content_Types].xml"] = contentTypes;
    entries[part] = strToU8(
      strFromU8(entries[part]!).replace('val="accent1"', 'val="missingSlot"'),
    );
    await expect(decodeXlsx(zipSync(entries))).rejects.toThrow();
  });

  test("retains units, full alpha precision, and reports rotation semantics materialization", () => {
    const result = read(line + shadow);
    expect(result.style?.line).toMatchObject({
      value: { widthPt: 0.75, paint: { opacity: 0.40001 } },
    });
    expect(result.style?.shadow).toEqual({
      kind: "value",
      value: {
        kind: "outer",
        color: { kind: "rgb", rgb: "#000000" },
        opacity: 0.4,
        scale: 1,
        blurPt: 4,
        distancePt: 3,
        angleDeg: 45,
        anchor: "top-left",
      },
    });
    expect(result.warnings).toEqual([
      "picture.spPr.effectLst.outerShdw.rotWithShapeMaterialization",
    ]);
    expect(read(writeNativePictureStyle(result.style)).style).toEqual(result.style);
  });
  test("materializes the consumed theme slot and never invents a default theme", () => {
    const xml = line.replace(/<a:srgbClr.*?<\/a:srgbClr>/, '<a:schemeClr val="accent1"/>');
    expect(read(xml)).toMatchObject({
      style: { line: { value: { paint: { color: { rgb: "#123456" } } } } },
      warnings: ["picture.spPr.ln.solidFill.themeMaterialization"],
    });
    expect(() => read(xml.replace("accent1", "missing"))).toThrow();
  });
  test.each([
    line.replace(' w="9525"', ""),
    line.replace('w="9525"', 'w="NaN"'),
    line.replace('w="9525"', 'w="0"'),
    line.replace('w="9525"', 'w="-1"'),
    '<a:ln w="-1"><a:noFill/></a:ln>',
    line.replace('w="9525"', 'w="304801"'),
    line.replace("<a:ln ", '<a:ln algn="in" '),
    line.replace("<a:ln ", '<a:ln cmpd="dbl" '),
    line.replace("</a:ln>", '<a:headEnd type="triangle"/></a:ln>'),
    line.replace("</a:ln>", '<a:prstDash val="dash"/></a:ln>'),
    line.replace("40001", "100001"),
    line.replace('<a:alpha val="40001"/>', '<a:alpha val="40001"/><a:alpha val="40001"/>'),
    line.replace('<a:alpha val="40001"/>', '<a:alphaMod val="40001"/>'),
    line + line,
    shadow + shadow,
    shadow.replace('blurRad="50800"', 'sx="100001"'),
    shadow.replace('blurRad="50800"', 'ky="1"'),
    shadow.replace('rotWithShape="0"', 'rotWithShape="2"'),
    shadow.replace('algn="tl"', 'algn="unknown"'),
    shadow.replace('dir="2700000"', 'dir="21600000"'),
    shadow.replace('val="black"', 'val="unknown"'),
    shadow.replace("outerShdw", "innerShdw"),
    shadow.replace("</a:effectLst>", '<a:glow rad="100"/></a:effectLst>'),
    "<a:effectLst><a:reflection/></a:effectLst>",
    '<a:ln w="9525"><a:gradFill/></a:ln>',
  ])("rejects unrepresentable XML: %s", (xml) => {
    expect(() => read(xml)).toThrow();
  });
  test("reports dormant noFill line metadata instead of silently claiming its preservation", () => {
    const result = read('<a:ln w="19050" cap="rnd"><a:noFill/><a:miter lim="400000"/></a:ln>');
    expect(result.style).toEqual({ line: { kind: "none" } });
    expect(result.warnings).toEqual(["picture.spPr.ln.noFillMetadataMaterialization"]);
    expect(read(writeNativePictureStyle(result.style)).warnings).toEqual([]);
  });
  test("keeps noFill zero width invisible and reports dormant metadata", () => {
    const result = read('<a:ln w="0"><a:noFill/></a:ln>');
    expect(result.style).toEqual({ line: { kind: "none" } });
    expect(result.warnings).toEqual(["picture.spPr.ln.noFillMetadataMaterialization"]);
    expect(writeNativePictureStyle(result.style)).toBe("<a:ln><a:noFill/></a:ln>");
  });
  test.each([0, 1e-20, Number.MIN_VALUE, 0.5 / 12700, 24 + 1 / 12700])(
    "blocks nonrepresentable Core solid width %s without exporting hairlines",
    async (widthPt) => {
      const style = read(line).style!;
      if (style.line?.kind !== "value") throw Error("Expected solid line fixture.");
      style.line.value.widthPt = widthPt;
      expect(() => writeNativePictureStyle(style)).toThrow();
      const { workbook, picture } = fixture(style);
      expect(isSupportedNativePictureFrame(picture)).toBe(false);
      await expect(encodeXlsx(workbook, { images: [asset] })).rejects.toThrow();
    },
  );
  test("preserves the minimum positive one-EMU line width", () => {
    const style = read(line.replace('w="9525"', 'w="1"')).style!;
    expect(writeNativePictureStyle(style)).toContain('<a:ln w="1"');
    expect(read(writeNativePictureStyle(style)).style).toEqual(style);
    expect(isSupportedNativePictureFrame(fixture(style).picture)).toBe(true);
  });
  test("keeps single EMU and DrawingML alpha units", () => {
    const xml = shadow
      .replace('blurRad="50800"', 'blurRad="1"')
      .replace('dist="38100"', 'dist="1"')
      .replace('dir="2700000"', 'dir="1"')
      .replace("40000", "12345");
    const style = read(xml).style;
    expect(read(writeNativePictureStyle(style)).style).toEqual(style);
    const bad = structuredClone(style!);
    if (bad.shadow?.kind === "value") bad.shadow.value.opacity = 0.123456;
    expect(() => writeNativePictureStyle(bad)).toThrow(/precision/);
  });
  test("admits only full suppression, exact local categories, and identity geometry without evaluating accessors", () => {
    const { picture } = fixture();
    expect(isSupportedNativePictureFrame(picture)).toBe(true);
    for (const frame of [
      { ...picture.frame, angleDeg: 1 },
      { ...picture.frame, angleDeg: 0.00000001 },
      { ...picture.frame, flipHorizontal: true },
      { ...picture.frame, source: { ...picture.frame.source, widthRatio: 2 } },
    ])
      expect(isSupportedNativePictureFrame({ ...picture, frame })).toBe(false);
    const extra = structuredClone(picture);
    extra.transform!.appearance!.detailedStyle!.glow = { kind: "none" };
    expect(isSupportedNativePictureFrame(extra)).toBe(false);
    const getter = vi.fn(() => read(line).style);
    Object.defineProperty(extra.transform!.appearance!, "detailedStyle", { get: getter });
    expect(isSupportedNativePictureFrame(extra)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
  test.each([line, shadow, line + shadow, "<a:ln><a:noFill/></a:ln><a:effectLst/>"])(
    "package roundtrip preserves native editable styles and untouched media",
    async (xml) => {
      const { workbook } = fixture(read(xml).style),
        before = structuredClone(workbook);
      const encoded = await encodeXlsx(workbook, { images: [asset] });
      expect(encoded.report.issues).toEqual([]);
      expect(workbook).toEqual(before);
      const entries = unzipSync(encoded.bytes);
      expect(sha(entries["xl/media/image1.png"]!)).toBe(sha(png));
      expect(strFromU8(entries[part]!)).toContain(writeNativePictureStyle(read(xml).style));
      const decoded = await decodeXlsx(encoded.bytes);
      expect(
        (getActiveSheet(decoded.workbook).floatingImages[0]! as FramedFloatingImage).transform
          ?.appearance?.detailedStyle,
      ).toEqual(read(xml).style);
      expect(sha(decoded.images![0]!.bytes)).toBe(sha(png));
      const reexport = await encodeXlsx(decoded.workbook, {
        images: decoded.images!.map((image) => ({ ...image, width: 32, height: 32 })),
      });
      expect(reexport.report.issues).toEqual([]);
    },
  );
  test.each([
    (xml: string) => xml.replace('w="9525"', 'w="0"'),
    (xml: string) => xml.replace("<a:ln ", '<a:ln xmlns:a="urn:wrong" '),
    (xml: string) =>
      xml.replace("<a:solidFill>", "<xdr:solidFill>").replace("</a:solidFill>", "</xdr:solidFill>"),
    (xml: string) => xml.replace("</a:prstGeom>", '</a:prstGeom><a:alpha val="100000"/>'),
    (xml: string) => xml.replace("<a:ln ", '<a:ln xmlnsBogus="1" '),
    (xml: string) => xml.replace("<a:srgbClr ", '<a:srgbClr xmlnsBogus="1" '),
    (xml: string) => xml.replace("<a:outerShdw ", '<a:outerShdw xmlnsBogus="1" '),
    (xml: string) => xml.replace('w="9525"', 'xml:w="9525"'),
    (xml: string) => xml.replace('val="336699"', 'xml:val="336699"'),
    (xml: string) => xml.replace('blurRad="50800"', 'xml:blurRad="50800"'),
    (xml: string) => xml.replace("<a:xfrm", '<a:xfrm rot="60000"'),
  ])("package namespace and styled transform guards fail closed", async (mutate) => {
    const { workbook } = fixture();
    const entries = unzipSync((await encodeXlsx(workbook, { images: [asset] })).bytes);
    entries[part] = strToU8(mutate(strFromU8(entries[part]!)));
    await expect(decodeXlsx(zipSync(entries))).rejects.toThrow();
  });
});
