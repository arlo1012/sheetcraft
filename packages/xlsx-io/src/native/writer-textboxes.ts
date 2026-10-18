import { canReuseFixedDrawingExportEncoding } from "@sheetcraft/core/picture-frame";
import type { SheetFramedGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet } from "@sheetcraft/core/workbook";
import {
  createPictureSheetMetrics,
  type PictureCellPoint,
} from "@sheetcraft/core/picture-axis-metrics";
import { resolveShapeFrame } from "@sheetcraft/core/shape-frame";
import {
  getShapeTextCharacterSegments,
  type ShapeTextCharacterFormat,
} from "@sheetcraft/core/shape-text-character-runs";
import type { ShapeChoice, ShapePaint } from "@sheetcraft/core/shape-style";
import { xml } from "../pivot-xml.js";
import { assertSupportedNativeTextBox } from "../textbox-capabilities.js";

const px = (value: number) => Math.round(value * 9525);
const pt = (value: number) => Math.round(value * 12700);
function solid(color: string): string {
  return `<a:solidFill><a:srgbClr val="${color.slice(1).toUpperCase()}"/></a:solidFill>`;
}
function fill(choice: ShapeChoice<ShapePaint> | undefined, fallback: string): string {
  if (choice?.kind === "none" || (!choice && fallback === "transparent")) return "<a:noFill/>";
  if (!choice) return solid(fallback);
  const paint = choice.value;
  if (paint.kind !== "solid" || paint.color.kind !== "rgb")
    throw new Error("Unsupported text box fill.");
  return solid(paint.color.rgb);
}
function line(d: SheetFramedGraphicDrawing): string {
  const choice = d.shapeStyle?.line;
  if (choice?.kind === "none" || (!choice && (d.stroke === "transparent" || d.strokeWidth === 0)))
    return "<a:ln><a:noFill/></a:ln>";
  const l = choice?.kind === "value" ? choice.value : undefined;
  const cap = l?.cap === "butt" ? "flat" : l?.cap === "square" ? "sq" : "rnd";
  const join =
    l?.join === "miter"
      ? `<a:miter lim="${Math.round(l.miterLimit * 100000)}"/>`
      : l?.join === "bevel"
        ? "<a:bevel/>"
        : "<a:round/>";
  return `<a:ln w="${l ? pt(l.widthPt) : px(d.strokeWidth)}" cap="${cap}" cmpd="sng" algn="ctr">${l ? fill({ kind: "value", value: l.paint }, d.stroke) : solid(d.stroke)}<a:prstDash val="solid"/>${join}</a:ln>`;
}
function typography(format: ShapeTextCharacterFormat): string {
  return `sz="${Math.round(format.fontSize! * 75)}" b="${Number(format.bold)}" i="${Number(format.italic)}"`;
}
export type TextBoxExportProfile = "excel-horizontal-editable";

function fontBody(format: ShapeTextCharacterFormat, profile?: TextBoxExportProfile): string {
  const face = xml(format.fontFamily!);
  return `${profile ? "" : "<a:ln><a:noFill/></a:ln>"}${solid(format.color!)}<a:effectLst/><a:latin typeface="${face}"/><a:ea typeface="${face}"/><a:cs typeface="${face}"/>`;
}
function textBody(d: SheetFramedGraphicDrawing, profile?: TextBoxExportProfile): string {
  const text = d.shapeText!,
    layout = text.layout,
    m = layout.marginsPt;
  const glyph = text.style?.fill;
  const glyphColor =
    glyph?.kind === "value" && glyph.value.kind === "solid" && glyph.value.color.kind === "rgb"
      ? glyph.value.color.rgb
      : d.color;
  const base: ShapeTextCharacterFormat = {
    fontFamily: text.fontFamily!,
    fontSize: d.fontSize,
    bold: d.bold,
    italic: d.italic,
    color: glyphColor,
  };
  const segments = getShapeTextCharacterSegments(
    { text: d.text, characterRuns: text.characterRuns },
    base,
  );
  let start = 0,
    segmentIndex = 0;
  const paragraphs = d.text
    .split("\n")
    .map((content) => {
      const end = start + content.length;
      while (segments[segmentIndex] && segments[segmentIndex]!.end <= start) segmentIndex++;
      const chunks: string[] = [];
      for (
        let index = segmentIndex;
        index < segments.length && segments[index]!.start < end;
        index++
      ) {
        const s = segments[index]!;
        chunks.push(
          `<a:r><a:rPr ${typography(s)}>${fontBody(s, profile)}</a:rPr><a:t xml:space="preserve">${xml(d.text.slice(Math.max(start, s.start), Math.min(end, s.end)))}</a:t></a:r>`,
        );
      }
      const runs = chunks.join("");
      let endIndex = segmentIndex;
      while (segments[endIndex] && segments[endIndex]!.end <= end) endIndex++;
      const endFormat = end < d.text.length ? (segments[endIndex] ?? base) : base;
      start = end + 1;
      const alignment = { left: "l", center: "ctr", right: "r", justify: "just" }[
        text.paragraph.alignment
      ];
      return `<a:p><a:pPr algn="${alignment}"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:defRPr ${typography(base)}>${fontBody(base, profile)}</a:defRPr></a:pPr>${runs}<a:endParaRPr ${typography(endFormat)}>${fontBody(endFormat, profile)}</a:endParaRPr></a:p>`;
    })
    .join("");
  return `<xdr:txBody><a:bodyPr rot="0" vert="horz" wrap="${layout.wrap ? "square" : "none"}" lIns="${pt(m.leftPt)}" tIns="${pt(m.topPt)}" rIns="${pt(m.rightPt)}" bIns="${pt(m.bottomPt)}" anchor="${{ start: "t", center: "ctr", end: "b" }[layout.blockAlignment]}" anchorCtr="0" rtlCol="${Number(!profile && layout.lineOrder === "rtl")}" horzOverflow="${layout.overflow ? "overflow" : "clip"}" vertOverflow="${layout.overflow ? "overflow" : "clip"}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</xdr:txBody>`;
}
function marker(tag: "from" | "to", p: PictureCellPoint): string {
  return `<xdr:${tag}><xdr:col>${p.column.index}</xdr:col><xdr:colOff>${px(p.column.offset)}</xdr:colOff><xdr:row>${p.row.index}</xdr:row><xdr:rowOff>${px(p.row.offset)}</xdr:rowOff></xdr:${tag}>`;
}
/** A complete anchor only. Its caller owns drawing parts, namespaces, relations and object IDs. */
export function nativeTextBoxAnchorXml(
  drawing: SheetFramedGraphicDrawing,
  sheet: Sheet,
  objectId: number,
  profile?: TextBoxExportProfile,
): string {
  assertSupportedNativeTextBox(
    drawing,
    sheet,
    `${sheet.name}.drawings[${JSON.stringify(drawing.id)}]`,
  );
  if (!Number.isSafeInteger(objectId) || objectId < 1)
    throw new RangeError("Invalid native drawing object ID.");
  const { rect } = resolveShapeFrame(drawing.shapeFrame, createPictureSheetMetrics(sheet), 0);
  const a = drawing.shapeFrame.anchor,
    ext = `<xdr:ext cx="${px(rect.width)}" cy="${px(rect.height)}"/>`;
  const encoding =
    a.mode === "fixed" &&
    drawing.rotation === 0 &&
    canReuseFixedDrawingExportEncoding(a.exportEncoding, rect, createPictureSheetMetrics(sheet))
      ? a.exportEncoding
      : undefined;
  const tag = encoding
    ? "twoCellAnchor"
    : a.mode === "fixed"
      ? "absoluteAnchor"
      : a.mode === "move-only"
        ? "oneCellAnchor"
        : "twoCellAnchor";
  const position = encoding
    ? `${marker("from", encoding.start)}${marker("to", encoding.end)}`
    : a.mode === "fixed"
      ? `<xdr:pos x="${px(a.x)}" y="${px(a.y)}"/>${ext}`
      : a.mode === "move-only"
        ? `${marker("from", a.origin)}${ext}`
        : `${marker("from", a.start)}${marker("to", a.end)}`;
  return `<xdr:${tag}${encoding ? ' editAs="absolute"' : ""}>${position}<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="${objectId}" name="${xml(drawing.name)}"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="${px(rect.x)}" y="${px(rect.y)}"/><a:ext cx="${px(rect.width)}" cy="${px(rect.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill(drawing.shapeStyle?.fill, drawing.fill)}${line(drawing)}<a:effectLst/></xdr:spPr>${textBody(drawing, profile)}</xdr:sp><xdr:clientData/></xdr:${tag}>`;
}
