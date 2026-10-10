import { strFromU8, strToU8 } from "fflate/browser";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { EMU_PER_PIXEL, type NativeDrawingAnchor } from "./drawing-geometry.js";
import { addRelationship, relationships, xml } from "./pivot-xml.js";

const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const ART_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function addDrawingContentType(
  entries: Record<string, Uint8Array>,
  part: string,
  contentType: string,
): void {
  const path = "[Content_Types].xml";
  const source = strFromU8(entries[path]!);
  if (source.includes(`PartName="/${xml(part)}"`)) return;
  entries[path] = strToU8(
    source.replace(
      "</Types>",
      `<Override PartName="/${xml(part)}" ContentType="${xml(contentType)}"/></Types>`,
    ),
  );
}

export function nextDrawingPart(entries: Record<string, Uint8Array>, kind: "chart" | "drawing") {
  const folder = kind === "chart" ? "charts" : "drawings";
  let number = 1;
  while (entries[`xl/${folder}/${kind}${number}.xml`]) number++;
  return `xl/${folder}/${kind}${number}.xml`;
}

/** Append into the picture-owned drawing, or create the worksheet's sole drawing. */
export function appendNativeChartDrawing(
  entries: Record<string, Uint8Array>,
  sheetPart: string,
  drawing: SheetChartDrawing,
  chartPart: string,
  anchor: NativeDrawingAnchor,
): void {
  const existing = [...relationships(entries, sheetPart).values()].find((relationship) =>
    relationship.type.endsWith("/drawing"),
  );
  const part = existing?.target ?? nextDrawingPart(entries, "drawing");
  if (!existing) {
    entries[part] = strToU8(
      `<xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="${ART_NS}" xmlns:r="${REL_NS}"></xdr:wsDr>`,
    );
    const id = addRelationship(
      entries,
      sheetPart,
      "drawing",
      `../drawings/${part.split("/").at(-1)}`,
    );
    entries[sheetPart] = strToU8(
      strFromU8(entries[sheetPart]!).replace("</worksheet>", `<drawing r:id="${id}"/></worksheet>`),
    );
    addDrawingContentType(
      entries,
      part,
      "application/vnd.openxmlformats-officedocument.drawing+xml",
    );
  }
  const source = strFromU8(entries[part]!);
  const ids = [...source.matchAll(/<(?:\w+:)?cNvPr\b[^>]*\bid=["'](\d+)["']/g)].map((match) =>
    Number(match[1]),
  );
  const objectId = Math.max(0, ...ids) + 1;
  const relationshipId = addRelationship(
    entries,
    part,
    "chart",
    `../charts/${chartPart.split("/").at(-1)}`,
  );
  const { tl, ext } = anchor;
  const width = Math.round(ext.width * EMU_PER_PIXEL);
  const height = Math.round(ext.height * EMU_PER_PIXEL);
  const frame = `<xdr:oneCellAnchor><xdr:from><xdr:col>${tl.nativeCol}</xdr:col><xdr:colOff>${tl.nativeColOff}</xdr:colOff><xdr:row>${tl.nativeRow}</xdr:row><xdr:rowOff>${tl.nativeRowOff}</xdr:rowOff></xdr:from><xdr:ext cx="${width}" cy="${height}"/><xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="${objectId}" name="${xml(drawing.name)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></xdr:xfrm><a:graphic><a:graphicData uri="${CHART_NS}"><c:chart xmlns:c="${CHART_NS}" xmlns:r="${REL_NS}" r:id="${relationshipId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`;
  if (!source.includes("</xdr:wsDr>")) throw new Error("Invalid generated worksheet drawing.");
  entries[part] = strToU8(source.replace("</xdr:wsDr>", `${frame}</xdr:wsDr>`));
}
