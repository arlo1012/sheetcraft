import type { Workbook } from "@sheetcraft/core/workbook";
import { strFromU8, strToU8 } from "fflate/browser";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { EMU_PER_PIXEL, type NativeDrawingAnchor } from "./drawing-geometry.js";
import { addRelationship, relationships, xml } from "./pivot-xml.js";

const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const ART_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
// Export-local bookkeeping only; never written into OOXML or Core snapshots.
const emittedAnchors = new WeakMap<object, Map<string, { drawingId: string; xml: string }[]>>();

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

/** Get the worksheet's sole generated drawing and its next collision-free object id. */
export function ensureNativeDrawingPart(
  entries: Record<string, Uint8Array>,
  sheetPart: string,
): { part: string; objectId: number } {
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
  if (!Number.isSafeInteger(objectId)) throw new RangeError("Drawing object id budget exceeded.");
  return { part, objectId };
}

/** Append only adapter-generated anchors to the worksheet's one shared drawing. */
export function appendNativeDrawingAnchor(
  entries: Record<string, Uint8Array>,
  part: string,
  anchorXml: string,
  drawingId?: string,
): void {
  const source = strFromU8(entries[part]!);
  if (!source.includes("</xdr:wsDr>")) throw new Error("Invalid generated worksheet drawing.");
  if (drawingId !== undefined) {
    let parts = emittedAnchors.get(entries);
    if (!parts) {
      parts = new Map();
      emittedAnchors.set(entries, parts);
    }
    const anchors = parts.get(part) ?? [];
    if (anchors.some((anchor) => anchor.drawingId === drawingId))
      throw new Error("Duplicate generated drawing id.");
    anchors.push({ drawingId, xml: anchorXml });
    parts.set(part, anchors);
  }
  entries[part] = strToU8(source.replace("</xdr:wsDr>", `${anchorXml}</xdr:wsDr>`));
}

/** Append into the shared picture/chart/textbox drawing using one object-id allocator. */
export function appendNativeChartDrawing(
  entries: Record<string, Uint8Array>,
  sheetPart: string,
  drawing: SheetChartDrawing,
  chartPart: string,
  anchor: NativeDrawingAnchor,
): void {
  const { part, objectId } = ensureNativeDrawingPart(entries, sheetPart);
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
  appendNativeDrawingAnchor(entries, part, frame, drawing.id);
}

/** Restore only emitted chart/textbox ordering; pictures retain their existing separate layer. */
export function reorderNativeDrawingAnchors(
  entries: Record<string, Uint8Array>,
  workbook: Workbook,
): void {
  const emitted = emittedAnchors.get(entries);
  if (!emitted) return;
  for (const [index, sheet] of [...workbook.sheets.values()].entries()) {
    const relation = [
      ...relationships(entries, `xl/worksheets/sheet${index + 1}.xml`).values(),
    ].find((relation) => relation.type === `${REL_NS}/drawing`);
    if (!relation) continue;
    const anchors = emitted.get(relation.target);
    if (!anchors?.length) continue;
    const order = new Map((sheet.drawings ?? []).map((drawing, index) => [drawing.id, index]));
    const sorted = [...anchors].sort(
      (a, b) =>
        (order.get(a.drawingId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.drawingId) ?? Number.MAX_SAFE_INTEGER),
    );
    let source = strFromU8(entries[relation.target]!);
    for (const anchor of anchors) {
      if (!source.includes(anchor.xml)) throw new Error("Missing generated drawing anchor.");
      source = source.replace(anchor.xml, "");
    }
    entries[relation.target] = strToU8(
      source.replace("</xdr:wsDr>", `${sorted.map((anchor) => anchor.xml).join("")}</xdr:wsDr>`),
    );
  }
  emittedAnchors.delete(entries);
}
