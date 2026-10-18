import { writeNativePictureStyle } from "../picture-native-style.js";
import { strToU8 } from "fflate/browser";
import { MAIN_NS, REL_NS, addRelationship, xml } from "../pivot-xml.js";
import type { NativeCell, NativeImage, NativeImageAnchor, NativeSheetData } from "./model.js";
import { xlsxText } from "./writer-text.js";

const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const ART_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const EMU_PER_PIXEL = 9525;

export type NativePartType = { part: string; contentType: string };

function drawingDescription(altText: string, issueLocation: string): string {
  for (const character of altText) {
    const scalar = character.codePointAt(0)!;
    if (
      scalar !== 0x9 &&
      scalar !== 0xa &&
      scalar !== 0xd &&
      !(scalar >= 0x20 && scalar <= 0xd7ff) &&
      !(scalar >= 0xe000 && scalar <= 0xfffd) &&
      !(scalar >= 0x10000 && scalar <= 0x10ffff)
    ) {
      throw new Error(
        `Invalid XML character U+${scalar.toString(16).toUpperCase().padStart(4, "0")} in XLSX image altText at ${issueLocation}.`,
      );
    }
  }
  // DrawingML descr is an XML string attribute, not an OOXML escaped cell string.
  // Preserve literal _xNNNN_ sequences and attribute whitespace exactly.
  return xml(altText);
}

function drawingXml(sheet: NativeSheetData, relationshipIds: string[]): string {
  const marker = (tag: "from" | "to", point: NativeImageAnchor["tl"]) =>
    `<xdr:${tag}><xdr:col>${point.nativeCol}</xdr:col><xdr:colOff>${point.nativeColOff}</xdr:colOff><xdr:row>${point.nativeRow}</xdr:row><xdr:rowOff>${point.nativeRowOff}</xdr:rowOff></xdr:${tag}>`;
  const anchors = sheet.images
    .map(({ range }, index) => {
      const { tl, ext } = range;
      const width = Math.round(ext.width * EMU_PER_PIXEL);
      const height = Math.round(ext.height * EMU_PER_PIXEL);
      const description = drawingDescription(
        range.altText ?? "",
        range.issueLocation ?? `${sheet.name}.images[${index + 1}].altText`,
      );
      const geometry = range.geometry;
      const crop = geometry
        ? `<a:srcRect l="${geometry.crop.left}" t="${geometry.crop.top}" r="${geometry.crop.right}" b="${geometry.crop.bottom}"/>`
        : "";
      const transform = geometry
        ? ` rot="${geometry.rotation}" flipH="${Number(geometry.flipHorizontal)}" flipV="${Number(geometry.flipVertical)}"`
        : "";
      const origin = range.transformOrigin ?? { x: 0, y: 0 };
      const placement = range.placement;
      const tag =
        placement?.kind === "absolute"
          ? "absoluteAnchor"
          : placement?.kind === "twoCell"
            ? "twoCellAnchor"
            : "oneCellAnchor";
      const position =
        placement?.kind === "absolute"
          ? `<xdr:pos x="${placement.x}" y="${placement.y}"/><xdr:ext cx="${width}" cy="${height}"/>`
          : `${marker("from", tl)}${
              placement?.kind === "twoCell"
                ? marker("to", placement.end)
                : `<xdr:ext cx="${width}" cy="${height}"/>`
            }`;
      return `<xdr:${tag}${placement?.kind === "twoCell" && placement.editAs === "absolute" ? ' editAs="absolute"' : ""}>${position}<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${index + 1}" name="Picture ${index + 1}" descr="${description}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="${range.lockAspectRatio === false ? 0 : 1}"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${relationshipIds[index]}"/>${crop}<a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm${transform}><a:off x="${origin.x}" y="${origin.y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${writeNativePictureStyle(range.style)}</xdr:spPr></xdr:pic><xdr:clientData/></xdr:${tag}>`;
    })
    .join("");
  return `${HEADER}<xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="${ART_NS}" xmlns:r="${REL_NS}">${anchors}</xdr:wsDr>`;
}

function commentsXml(notes: NativeCell[]): string {
  const comments = notes
    .map((cell) => {
      const text =
        typeof cell.note === "string"
          ? cell.note
          : (cell.note?.texts ?? []).map((run) => run.text).join("");
      return `<comment ref="${xml(cell.address)}" authorId="0"><text><r><t xml:space="preserve">${xlsxText(text)}</t></r></text></comment>`;
    })
    .join("");
  return `${HEADER}<comments xmlns="${MAIN_NS}"><authors><author>Author</author></authors><commentList>${comments}</commentList></comments>`;
}

function commentsVml(notes: NativeCell[]): string {
  const shapes = notes
    .map((cell, index) => {
      const match = /^([A-Z]+)([1-9]\d*)$/i.exec(cell.address);
      if (!match) throw new Error(`Invalid comment address: ${cell.address}.`);
      const column =
        [...match[1]!.toUpperCase()].reduce(
          (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
          0,
        ) - 1;
      const row = Number(match[2]) - 1;
      // Keep an absent product note box absent after import. The finalizer replaces
      // these default dimensions only when the user has explicitly sized a note.
      return `<v:shape id="_x0000_s${1025 + index}" type="#_x0000_t202" style="position:absolute;margin-left:105.3pt;margin-top:10.5pt;width:97.8pt;height:59.1pt;z-index:${index + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>1, 15, 0, 2, 3, 15, 4, 6</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${row}</x:Row><x:Column>${column}</x:Column></x:ClientData></v:shape>`;
    })
    .join("");
  return `${HEADER}<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>${shapes}</xml>`;
}

export function writeNativeSheetAttachments(
  entries: Record<string, Uint8Array>,
  sheet: NativeSheetData,
  images: NativeImage[],
  number: number,
): { drawing?: string; legacyDrawing?: string; partTypes: NativePartType[] } {
  const partTypes: NativePartType[] = [];
  const sheetPart = `xl/worksheets/sheet${number}.xml`;
  let drawing: string | undefined;
  let legacyDrawing: string | undefined;
  if (sheet.images.length) {
    const drawingPart = `xl/drawings/drawing${number}.xml`;
    const ids = sheet.images.map(({ imageId }) => {
      const image = images[imageId];
      if (!image) throw new Error(`Missing XLSX image ${imageId}.`);
      return addRelationship(
        entries,
        drawingPart,
        "image",
        `../media/image${imageId + 1}.${image.extension}`,
      );
    });
    entries[drawingPart] = strToU8(drawingXml(sheet, ids));
    drawing = addRelationship(entries, sheetPart, "drawing", `../drawings/drawing${number}.xml`);
    partTypes.push({
      part: drawingPart,
      contentType: "application/vnd.openxmlformats-officedocument.drawing+xml",
    });
  }
  const notes = [...sheet.rows.values()]
    .sort((a, b) => a.number - b.number)
    .flatMap((row) => [...row.cells.entries()].sort(([a], [b]) => a - b).map(([, cell]) => cell))
    .filter((cell) => cell.note !== undefined);
  if (notes.length) {
    const commentsPart = `xl/comments${number}.xml`;
    const vmlPart = `xl/drawings/vmlDrawing${number}.vml`;
    entries[commentsPart] = strToU8(commentsXml(notes));
    entries[vmlPart] = strToU8(commentsVml(notes));
    addRelationship(entries, sheetPart, "comments", `../comments${number}.xml`);
    legacyDrawing = addRelationship(
      entries,
      sheetPart,
      "vmlDrawing",
      `../drawings/vmlDrawing${number}.vml`,
    );
    partTypes.push({
      part: commentsPart,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml",
    });
  }
  return { drawing, legacyDrawing, partTypes };
}
