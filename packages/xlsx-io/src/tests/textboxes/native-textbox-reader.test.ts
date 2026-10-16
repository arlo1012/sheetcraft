import { strToU8 } from "fflate/browser";
import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setColumnWidth,
  setRowHeight,
} from "@sheetcraft/core/workbook";
import { getShapeTextCharacterSegments } from "@sheetcraft/core/shape-text-character-runs";
import { nativeTextBoxAnchorXml } from "../../native/writer-textboxes.js";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolveShapeAnchorRect } from "@sheetcraft/core/shape-frame";
import {
  inspectNativeTextBox,
  readNativeTextBoxTheme,
  readXlsxTextBoxes,
} from "../../textbox-reader.js";
import { materializeTextBoxShade } from "../../textbox-theme.js";
import { child, parseXml } from "../../pivot-xml.js";
import { CompatibilityReportBuilder } from "../../report.js";
import type { PictureAnchorKind } from "../../picture-reader.js";

const path = "xl/drawings/drawing1.xml.textBoxes[1]";
const themeXml = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="WPS"><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1></a:clrScheme><a:fontScheme name="WPS"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Hans" typeface="宋体"/></a:minorFont></a:fontScheme><a:fmtScheme name="WPS"/></a:themeElements></a:theme>`;
const theme = () => readNativeTextBoxTheme(strToU8(themeXml));
const marker = (tag: string, col: number, colOff: number, row: number, rowOff: number) =>
  `<xdr:${tag}><xdr:col>${col}</xdr:col><xdr:colOff>${colOff}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${rowOff}</xdr:rowOff></xdr:${tag}>`;
const run = (text: string, extra = "") =>
  `<a:r><a:rPr lang="x-none" altLang="en-US" sz="1100" ${extra}/><a:t>${text}</a:t></a:r>`;
/** Shape subtree transcribed from a synthetic WPS reference, not user data. */
function fixture(kind: PictureAnchorKind = "twoCellAnchor") {
  const anchor =
    kind === "absoluteAnchor"
      ? '<xdr:pos x="304800" y="1104900"/><xdr:ext cx="2333625" cy="1047750"/>'
      : marker("from", 0, 304800, 5, 152400) +
        (kind === "oneCellAnchor"
          ? '<xdr:ext cx="2333625" cy="1047750"/>'
          : marker("to", 3, 123825, 11, 57150));
  return `<xdr:${kind} xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchor}<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="3" name="Text Box 2"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="304800" y="1104900"/><a:ext cx="2333625" cy="1047750"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:ln w="9525" cmpd="sng"><a:solidFill><a:schemeClr val="lt1"><a:shade val="50000"/></a:schemeClr></a:solidFill></a:ln></xdr:spPr><xdr:style><a:lnRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef><a:effectRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="dk1"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip" wrap="square" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:p><a:pPr algn="l"/>${run("test")}<a:endParaRPr lang="x-none" altLang="en-US" sz="1100"/></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:${kind}>`;
}
function inspect(xml = fixture(), kind: PictureAnchorKind = "twoCellAnchor") {
  return inspectNativeTextBox(kind, child(parseXml(strToU8(xml)), kind), path, theme());
}
function decode(xml = fixture(), kind: PictureAnchorKind = "twoCellAnchor") {
  const book = createWorkbook({ id: "textbox", sheetId: "sheet" }),
    sheet = getActiveSheet(book);
  for (let column = 0; column < 5; column++) setColumnWidth(sheet, column, 88);
  for (let row = 0; row < 15; row++) setRowHeight(sheet, row, 20);
  const report = new CompatibilityReportBuilder();
  readXlsxTextBoxes(book, [{ ...inspect(xml, kind), sheetIndex: 0 }], report);
  const drawing = sheet.drawings![0]!;
  if (drawing.kind !== "textBox" || !("shapeFrame" in drawing))
    throw Error("Expected canonical text box");
  return { book, sheet, report: report.build(), drawing };
}

test("WPS textbox maps real theme, 11pt font, bounded markers, body and glyph independently", () => {
  const { drawing, report } = decode();
  expect(drawing).toMatchObject({
    kind: "textBox",
    text: "test",
    name: "Text Box 2",
    fontSize: 44 / 3,
    color: "#000000",
    fill: "#ffffff",
    stroke: "#bcbcbc",
    strokeWidth: 1,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: {
        mode: "move-and-size",
        start: { column: { index: 0, offset: 32 }, row: { index: 5, offset: 16 } },
        end: { column: { index: 3, offset: 13 }, row: { index: 11, offset: 6 } },
      },
    },
    shapeText: {
      fontFamily: "Calibri",
      layout: {
        wrap: true,
        overflow: false,
        autoFit: "none",
        blockAlignment: "start",
        marginsPt: { leftPt: 7.2, rightPt: 7.2, topPt: 3.6, bottomPt: 3.6 },
      },
    },
    shapeStyle: { line: { value: { widthPt: 0.75 } }, shadow: { kind: "none" } },
  });
  expect(normalizeSheetDrawing(drawing)).toEqual(drawing);
  expect(report.issues).toContainEqual(
    expect.objectContaining({
      code: "style-omitted",
      severity: "warning",
      locations: expect.arrayContaining([`${path}.style.fontRef.themeMaterialization`]),
    }),
  );
});

test.each(["oneCellAnchor", "absoluteAnchor"] as const)("%s placement is consumed", (kind) => {
  const { drawing } = decode(fixture(kind), kind);
  expect(drawing).toHaveProperty(
    "shapeFrame.anchor.mode",
    kind === "oneCellAnchor" ? "move-only" : "fixed",
  );
});

test("free OOXML marker offsets are rebased, not clipped to their original cells", () => {
  const xml = fixture().replace(
    "<xdr:colOff>304800</xdr:colOff>",
    "<xdr:colOff>1047750</xdr:colOff>",
  );
  const { drawing, sheet } = decode(xml);
  if (!("shapeFrame" in drawing)) throw Error("Expected canonical text box");
  expect(
    resolveShapeAnchorRect(drawing.shapeFrame.anchor, createPictureSheetMetrics(sheet)).x,
  ).toBe(110);
  expect(drawing).toHaveProperty("shapeFrame.anchor.start.column", { index: 1, offset: 22 });
});

test("mismatching xfrm cannot silently replace authoritative cell anchors", () => {
  const { drawing, report } = decode(fixture().replace('x="304800"', 'x="9525000"'));
  expect(drawing).toHaveProperty("shapeFrame.anchor.start.column.offset", 32);
  expect(report.issues).toContainEqual(
    expect.objectContaining({
      code: "dimension-approximated",
      locations: [`${path}.anchorTransform`],
    }),
  );
});

test("uniform paragraphs and limited rich runs preserve range ownership", () => {
  const xml = fixture()
    .replace(run("test"), `${run("ab")}${run("CD", 'b="1"')}`)
    .replace(
      '<a:endParaRPr lang="x-none" altLang="en-US" sz="1100"/>',
      '<a:endParaRPr sz="1100" b="1"/>',
    );
  const { drawing } = decode(xml);
  expect(drawing).toMatchObject({
    text: "abCD",
    bold: false,
    shapeText: {
      characterRuns: [
        { start: 0, end: 2, bold: false },
        { start: 2, end: 4, bold: true },
      ],
    },
  });
  const two = decode(
    fixture().replace(
      "</a:p></xdr:txBody>",
      `</a:p><a:p><a:pPr algn="l"/>${run("next")}</a:p></xdr:txBody>`,
    ),
  );
  expect(two.drawing.text).toBe("test\nnext");
});

test("xml:space preserves leading/trailing literal text", () => {
  expect(
    decode(fixture().replace("<a:t>test</a:t>", '<a:t xml:space="preserve"> test </a:t>')).drawing
      .text,
  ).toBe(" test ");
});

test("shade50 materializes linear light to WPS-observed RGB188", () => {
  expect(materializeTextBoxShade("#ffffff", 50000)).toBe("#bcbcbc");
  expect(materializeTextBoxShade("#123456", 100000)).toBe("#123456");
  expect(materializeTextBoxShade("#ffffff", 0)).toBe("#000000");
});

describe("closed textbox format boundary", () => {
  test.each([
    ["ordinary shape", 'txBox="1"', 'txBox="0"', "cNvSpPr.txBox"],
    ["nonrect geometry", 'prst="rect"', 'prst="ellipse"', "prstGeom.prst"],
    ["field", run("test"), '<a:fld id="1"><a:t>test</a:t></a:fld>', "txBody.p[0].fld"],
    ["break", run("test"), `${run("a")}<a:br/>${run("b")}`, "txBody.p[0].br"],
    [
      "effects",
      "</xdr:spPr>",
      "<a:effectLst><a:glow/></a:effectLst></xdr:spPr>",
      "spPr.effectLst.glow",
    ],
    ["shade out of range", 'val="50000"', 'val="100001"', "spPr.ln.solidFill.shade.val"],
    [
      "unknown color transform",
      '<a:shade val="50000"/>',
      '<a:lumMod val="50000"/>',
      "spPr.ln.solidFill.lumMod",
    ],
    [
      "unknown run setting",
      'sz="1100" />',
      'sz="1100" baseline="1000"/>',
      "txBody.p[0].r[0].rPr.baseline",
    ],
    [
      "different overflow axes",
      'horzOverflow="clip"',
      'horzOverflow="overflow"',
      "txBody.bodyPr.overflow",
    ],
    ["autofit", "<a:noAutofit/>", "<a:normAutofit/>", "txBody.bodyPr.normAutofit"],
    ["unknown shape attribute", "<xdr:sp>", '<xdr:sp macro="bad">', "sp.macro"],
    ["mixed anchor payload", "<xdr:sp>", "<xdr:pic/><xdr:sp>", "pic"],
    ["missing theme slot", 'val="lt1"', 'val="phClr"', "spPr.solidFill.schemeClr.val"],
    [
      "non-Latin inherited font",
      "<a:t>test</a:t>",
      "<a:t>中文</a:t>",
      "txBody.p[0].r[0].themeScriptFont",
    ],
  ])("rejects %s with a specific location", (_label, find, replacement, suffix) => {
    let caught: unknown;
    try {
      inspect(fixture().replace(find!, replacement!));
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      report: {
        issues: [{ code: "drawing-or-media", severity: "block", locations: [`${path}.${suffix}`] }],
      },
    });
  });
});

test("unresolved/malformed theme never falls back to Office defaults", () => {
  expect(readNativeTextBoxTheme(undefined)).toEqual({ colors: {}, fonts: {} });
  expect(() =>
    readNativeTextBoxTheme(strToU8(themeXml.replace('lastClr="FFFFFF"', 'lastClr="broken"'))),
  ).toThrow();
  expect(() =>
    readNativeTextBoxTheme(
      strToU8(
        themeXml.replace(
          'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
          'xmlns:a="urn:wrong"',
        ),
      ),
    ),
  ).toThrow();
  expect(() =>
    inspectNativeTextBox(
      "twoCellAnchor",
      child(parseXml(strToU8(fixture())), "twoCellAnchor"),
      path,
    ),
  ).toThrow();
});

test("later invalid geometry leaves workbook unchanged", () => {
  const book = createWorkbook({ id: "atomic", sheetId: "sheet" }),
    report = new CompatibilityReportBuilder(),
    good = inspect();
  expect(() =>
    readXlsxTextBoxes(
      book,
      [
        { ...good, sheetIndex: 0 },
        {
          ...good,
          objectId: 4,
          sheetIndex: 0,
          anchor: { mode: "fixed", x: 0, y: 0, size: { width: 0, height: 5 } },
        },
      ],
      report,
    ),
  ).toThrow();
  expect(getActiveSheet(book).drawings ?? []).toEqual([]);
});

test("theme child namespace rebinding cannot masquerade as DrawingML", () => {
  for (const modified of [
    themeXml.replace('<a:sysClr val="window"', '<a:sysClr xmlns:a="urn:evil" val="window"'),
    themeXml.replace(
      '<a:latin typeface="Calibri"',
      '<a:latin xmlns:a="urn:evil" typeface="Calibri"',
    ),
    themeXml.replace('lastClr="FFFFFF"', 'evil:lastClr="FFFFFF" xmlns:evil="urn:evil"'),
  ])
    expect(() => readNativeTextBoxTheme(strToU8(modified))).toThrow();
});

test("explicit-font Unicode runs retain UTF-16 positions without guessing a script theme font", () => {
  const explicit = (text: string, bold: boolean) =>
    `<a:r><a:rPr sz="1100" b="${Number(bold)}"><a:latin typeface="Arial"/><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r>`;
  const xml = fixture()
    .replace(/<xdr:style>[\s\S]*?<\/xdr:style>/, "")
    .replace(run("test"), explicit("😀", false) + explicit("A", true));
  const { drawing } = decode(xml);
  expect(drawing.text).toBe("😀A");
  expect(drawing.shapeText?.characterRuns).toMatchObject([
    { start: 0, end: 2 },
    { start: 2, end: 3, bold: true },
  ]);
});

test("empty paragraphs retain explicit insertion defaults", () => {
  expect(decode(fixture().replace(run("test"), "")).drawing.text).toBe("");
});

test("observed WPS Liberation Sans font descriptors materialize with a located warning", () => {
  const descriptor =
    '<a:latin typeface="Liberation Sans" panose="020B0604020202020204" charset="0"/><a:cs typeface="Liberation Sans" panose="020B0604020202020204" charset="0"/>';
  const xml = fixture()
    .replace('sz="1100" />', `sz="1100">${descriptor}</a:rPr>`)
    .replace('sz="1100"/></a:p>', `sz="1100">${descriptor}</a:endParaRPr></a:p>`);
  const { drawing, report } = decode(xml);
  expect(drawing.shapeText?.fontFamily).toBe("Liberation Sans");
  expect(report.issues).toContainEqual(
    expect.objectContaining({
      code: "style-omitted",
      locations: expect.arrayContaining([
        `${path}.txBody.p[0].r[0].rPr.latin.fontDescriptorMaterialization`,
      ]),
    }),
  );
  expect(() => inspect(xml.replace('charset="0"', 'charset="128"'))).toThrow();
  expect(() => inspect(xml.replace("020B0604020202020204", "bad"))).toThrow();
});

test("Core to native XML to Core preserves a full-text two-paragraph rich selection including LF", () => {
  const { drawing, sheet } = decode();
  drawing.text = "first paragraph\nsecond paragraph";
  drawing.shapeText!.characterRuns = [
    { start: 0, end: drawing.text.length, bold: true, fontSize: 20, color: "#123456" },
  ];
  const xml = nativeTextBoxAnchorXml(drawing, sheet, 3);
  const imported = decode(xml).drawing;
  const segments = (d: typeof drawing) =>
    getShapeTextCharacterSegments(
      { text: d.text, characterRuns: d.shapeText?.characterRuns },
      {
        fontFamily: d.shapeText!.fontFamily,
        fontSize: d.fontSize,
        bold: d.bold,
        italic: d.italic,
        color: d.color,
      },
    ).map(({ start, end, fontFamily, fontSize, bold, italic, color }) => ({
      start,
      end,
      fontFamily,
      fontSize,
      bold,
      italic,
      color,
    }));
  expect(imported.text).toBe(drawing.text);
  expect(segments(imported)).toEqual(segments(drawing));
  expect(imported.fontSize).toBe(drawing.fontSize);
  expect(
    imported.shapeText?.characterRuns?.some(
      (run) => run.start <= 15 && run.end > 15 && run.bold && run.fontSize === 20,
    ),
  ).toBe(true);
});

test("ordinary base LF remains valid beside a differently sized rich run", () => {
  const { drawing, sheet } = decode();
  drawing.text = "first\nsecond";
  drawing.shapeText!.characterRuns = [{ start: 0, end: 5, fontSize: 20 }];
  const imported = decode(nativeTextBoxAnchorXml(drawing, sheet, 3)).drawing;
  expect(imported.text).toBe(drawing.text);
  expect(imported.fontSize).toBe(drawing.fontSize);
  expect(imported.shapeText?.characterRuns).toEqual(
    expect.arrayContaining([expect.objectContaining({ start: 0, end: 5, fontSize: 20 })]),
  );
});

test("isolated paragraph-break size cannot claim preserved empty-line geometry", () => {
  const xml = fixture()
    .replace('<a:endParaRPr lang="x-none" altLang="en-US" sz="1100"/>', '<a:endParaRPr sz="1800"/>')
    .replace(
      "</a:p></xdr:txBody>",
      `</a:p><a:p><a:pPr algn="l"/>${run("next")}</a:p></xdr:txBody>`,
    );
  expect(() => inspect(xml)).toThrow(/lineBreakFormat/);
});

// Synthetic import-policy regression, not a claim of real WPS textbox editAs acceptance.
test.each(["oneCell", "absolute"] as const)(
  "twoCell editAs=%s retains its placement mode and selects the matching geometry",
  (editAs) => {
    const xml = fixture()
      .replace("<xdr:twoCellAnchor ", `<xdr:twoCellAnchor editAs="${editAs}" `)
      .replace('x="304800" y="1104900"', 'x="952500" y="1905000"')
      .replace('cx="2333625" cy="1047750"', 'cx="2857500" cy="1428750"');
    const { drawing, sheet, report } = decode(xml);
    expect(drawing.shapeFrame.anchor).toEqual(
      editAs === "absolute"
        ? { mode: "fixed", x: 100, y: 200, size: { width: 300, height: 150 } }
        : {
            mode: "move-only",
            origin: { column: { index: 0, offset: 32 }, row: { index: 5, offset: 16 } },
            size: { width: 245, height: 110 },
          },
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "dimension-approximated",
        locations: [`${path}.anchorTransform`],
      }),
    );
    setRowHeight(sheet, 0, 40);
    const rect = resolveShapeAnchorRect(
      drawing.shapeFrame.anchor,
      createPictureSheetMetrics(sheet),
    );
    expect(rect).toEqual(
      editAs === "absolute"
        ? { x: 100, y: 200, width: 300, height: 150 }
        : { x: 32, y: 136, width: 245, height: 110 },
    );
  },
);

test("absolute editAs without xfrm freezes marker geometry and reports its fallback", () => {
  const xml = fixture()
    .replace("<xdr:twoCellAnchor ", '<xdr:twoCellAnchor editAs="absolute" ')
    .replace(/<a:xfrm>[\s\S]*?<\/a:xfrm>/, "");
  const { drawing, report } = decode(xml);
  expect(drawing.shapeFrame.anchor).toEqual({
    mode: "fixed",
    x: 32,
    y: 116,
    size: { width: 245, height: 110 },
  });
  expect(report.issues).toContainEqual(
    expect.objectContaining({
      code: "dimension-approximated",
      locations: [`${path}.anchorTransform`],
    }),
  );
});

test("unknown editAs and incomplete present xfrm remain precise blocks", () => {
  expect(() =>
    inspect(fixture().replace("<xdr:twoCellAnchor ", '<xdr:twoCellAnchor editAs="other" ')),
  ).toThrow(/editAs/);
  expect(() => inspect(fixture().replace('<a:ext cx="2333625" cy="1047750"/>', ""))).toThrow(/ext/);
});
