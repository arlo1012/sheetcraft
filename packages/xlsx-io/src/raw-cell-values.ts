import { strFromU8, unzipSync } from "fflate/browser";

/**
 * Returns numeric worksheet values as they are stored in the XLSX XML.
 *
 * ExcelJS eagerly converts date-formatted numeric cells to JavaScript Dates.
 * That loses Excel's two 1900-system sentinel serials (0 and 60) and rounds
 * sub-millisecond times. The codec uses this small, deliberately narrow XML
 * view only to restore a raw number when ExcelJS produced a Date.
 */
export function readRawWorksheetNumericValues(
  bytes: Uint8Array,
): readonly ReadonlyMap<string, number>[] {
  const entries = unzipSync(bytes);
  const workbook = entries["xl/workbook.xml"];
  const relationships = entries["xl/_rels/workbook.xml.rels"];
  if (!workbook || !relationships) return [];
  const targets = readWorksheetTargets(strFromU8(workbook), strFromU8(relationships));
  return targets.map((target) => {
    const worksheet = entries[target];
    return worksheet ? readRawNumericValues(strFromU8(worksheet)) : new Map<string, number>();
  });
}

/**
 * Returns explicitly stored cell text directions from the XLSX style table.
 *
 * ExcelJS's public alignment model maps both readingOrder="0" and
 * readingOrder="1" to "ltr" when importing. Reading-order zero means
 * context-dependent direction, so retain this narrow raw XML view to restore
 * the distinction without replacing the normal style parser.
 */
export function readRawWorksheetTextDirections(
  bytes: Uint8Array,
): readonly ReadonlyMap<string, "context" | "ltr" | "rtl">[] {
  const entries = unzipSync(bytes);
  const workbook = entries["xl/workbook.xml"];
  const relationships = entries["xl/_rels/workbook.xml.rels"];
  const styles = entries["xl/styles.xml"];
  if (!workbook || !relationships || !styles) return [];
  const directionsByStyle = readTextDirectionsByStyle(strFromU8(styles));
  if (!directionsByStyle.size) return [];
  const targets = readWorksheetTargets(strFromU8(workbook), strFromU8(relationships));
  return targets.map((target) => {
    const worksheet = entries[target];
    return worksheet
      ? readRawTextDirections(strFromU8(worksheet), directionsByStyle)
      : new Map<string, "context" | "ltr" | "rtl">();
  });
}

function readWorksheetTargets(workbookXml: string, relationshipsXml: string): readonly string[] {
  const relationships = new Map<string, string>();
  for (const relationship of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attributes = relationship[1] ?? "";
    const id = readAttribute(attributes, "Id");
    const target = readAttribute(attributes, "Target");
    const type = readAttribute(attributes, "Type");
    if (id && target && /\/worksheet$/i.test(type ?? "")) {
      const normalized = normalizeWorkbookTarget(target);
      if (normalized) relationships.set(id, normalized);
    }
  }
  const targets: string[] = [];
  for (const sheet of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/gi)) {
    const relationshipId = readAttribute(sheet[1] ?? "", "r:id");
    const target = relationshipId ? relationships.get(relationshipId) : undefined;
    if (target) targets.push(target);
  }
  return targets;
}

function readAttribute(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escapedName}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(attributes);
  return match?.[2];
}

function normalizeWorkbookTarget(target: string): string | undefined {
  const pathSegments = target.replace(/^\/+/, "").split("/");
  const segments = target.startsWith("/") ? pathSegments : ["xl", ...pathSegments];
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  const path = normalized.join("/");
  return /^xl\/worksheets\/[^/]+\.xml$/i.test(path) ? path : undefined;
}

function readRawNumericValues(xml: string): ReadonlyMap<string, number> {
  const values = new Map<string, number>();
  const cells = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/gi;
  for (const cell of xml.matchAll(cells)) {
    const attributes = cell[1] ?? "";
    const address = /\br="([A-Z]+[1-9]\d*)"/i.exec(attributes)?.[1];
    const type = /\bt="([^"]+)"/i.exec(attributes)?.[1];
    const body = cell[2] ?? "";
    // Formula cells own their displayed values through Core formula evaluation;
    // never turn a formula into a literal merely because it has a numeric cache.
    if (!address || (type !== undefined && type !== "n") || /<f(?:\s|>)/i.test(body)) continue;
    const raw = /<v>([^<]+)<\/v>/i.exec(body)?.[1];
    if (!raw) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) values.set(address.toUpperCase(), value);
  }
  return values;
}

function readTextDirectionsByStyle(
  stylesXml: string,
): ReadonlyMap<number, "context" | "ltr" | "rtl"> {
  const directions = new Map<number, "context" | "ltr" | "rtl">();
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/i.exec(stylesXml)?.[1];
  if (!cellXfs) return directions;
  let styleIndex = 0;
  for (const format of cellXfs.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/gi)) {
    const alignmentAttributes = /<alignment\b([^>]*)\/?\s*>/i.exec(format[0] ?? "")?.[1];
    const readingOrder = alignmentAttributes
      ? readAttribute(alignmentAttributes, "readingOrder")
      : undefined;
    const textDirection =
      readingOrder === "0"
        ? "context"
        : readingOrder === "1"
          ? "ltr"
          : readingOrder === "2"
            ? "rtl"
            : undefined;
    if (textDirection) directions.set(styleIndex, textDirection);
    styleIndex += 1;
  }
  return directions;
}

function readRawTextDirections(
  worksheetXml: string,
  directionsByStyle: ReadonlyMap<number, "context" | "ltr" | "rtl">,
): ReadonlyMap<string, "context" | "ltr" | "rtl"> {
  const directions = new Map<string, "context" | "ltr" | "rtl">();
  for (const cell of worksheetXml.matchAll(/<c\b([^>]*)(?:\/>|>[\s\S]*?<\/c>)/gi)) {
    const attributes = cell[1] ?? "";
    const address = readAttribute(attributes, "r");
    const styleIndex = Number(readAttribute(attributes, "s") ?? "0");
    const textDirection = Number.isInteger(styleIndex)
      ? directionsByStyle.get(styleIndex)
      : undefined;
    if (address && textDirection) directions.set(address.toUpperCase(), textDirection);
  }
  return directions;
}
