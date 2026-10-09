import { XMLParser, XMLValidator } from "fast-xml-parser";
import { strFromU8, strToU8 } from "fflate/browser";
import type { CellRange } from "@sheetcraft/core/workbook";
import { parseCellAddress, formatCellAddress } from "@sheetcraft/core/coordinates";

export type XmlNode = Record<string, unknown>;
export const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
export const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const PACKAGE_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
export const PIVOT_EXT = "urn:idea10:pivot:1";
export const xml = (value: unknown): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;")
    .replace(/\t/g, "&#9;");
export const attr = (node: XmlNode, name: string, fallback = ""): string =>
  String(node[`@_${name}`] ?? fallback);
export const nodes = (value: unknown): XmlNode[] =>
  (Array.isArray(value) ? value : [value]).filter(
    (item): item is XmlNode => !!item && typeof item === "object",
  );
export const child = (node: XmlNode, name: string): XmlNode => nodes(node[name])[0] ?? {};
export const flag = (node: XmlNode, name: string, fallback = false): boolean =>
  ["1", "true"].includes(attr(node, name, fallback ? "1" : "0"));
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});
export function parseXml(bytes: Uint8Array | undefined): XmlNode {
  if (!bytes) throw new Error("Missing pivot part.");
  const source = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source) || XMLValidator.validate(source) !== true)
    throw new Error("Invalid pivot XML.");
  return parser.parse(source) as XmlNode;
}
export function relationshipPath(part: string): string {
  const index = part.lastIndexOf("/");
  return `${part.slice(0, index + 1)}_rels/${part.slice(index + 1)}.rels`;
}
export function resolvePart(part: string, target: string): string {
  if (!target || /[\\?#]|^[a-z]+:/i.test(target)) throw new Error("Invalid pivot relationship.");
  const segments = target.startsWith("/") ? [] : part.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) throw new Error("Invalid pivot relationship.");
      segments.pop();
    } else segments.push(segment);
  }
  return segments.join("/");
}
export function relationships(
  entries: Record<string, Uint8Array>,
  part: string,
): Map<string, { target: string; type: string }> {
  const result = new Map<string, { target: string; type: string }>();
  const bytes = entries[relationshipPath(part)];
  if (!bytes) return result;
  for (const rel of nodes(child(parseXml(bytes), "Relationships").Relationship)) {
    if (attr(rel, "TargetMode") === "External") continue;
    result.set(attr(rel, "Id"), {
      target: resolvePart(part, attr(rel, "Target")),
      type: attr(rel, "Type"),
    });
  }
  return result;
}
export function addRelationship(
  entries: Record<string, Uint8Array>,
  part: string,
  type: string,
  target: string,
): string {
  const path = relationshipPath(part);
  const source = entries[path]
    ? strFromU8(entries[path])
    : `<Relationships xmlns="${PACKAGE_NS}"></Relationships>`;
  const ids = new Set([...source.matchAll(/\bId=["']([^"']+)["']/g)].map((match) => match[1]));
  let number = 1;
  while (ids.has(`rId${number}`)) number++;
  const id = `rId${number}`;
  const relationship = `<Relationship Id="${id}" Type="${REL_NS}/${type}" Target="${xml(target)}"/>`;
  entries[path] = strToU8(
    source
      .replace(/<Relationships\b([^>]*)\/>/, "<Relationships$1></Relationships>")
      .replace(/<\/Relationships>/, `${relationship}</Relationships>`),
  );
  return id;
}
export function addContentType(
  entries: Record<string, Uint8Array>,
  part: string,
  type: string,
): void {
  const path = "[Content_Types].xml";
  const source = strFromU8(entries[path]!);
  entries[path] = strToU8(
    source.replace(
      /<\/Types>/,
      `<Override PartName="/${xml(part)}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${type}+xml"/></Types>`,
    ),
  );
}
export function rangeRef(range: CellRange): string {
  return `${formatCellAddress(range.start)}:${formatCellAddress(range.end)}`;
}
export function parseRange(ref: string): CellRange {
  const [start, end = start] = ref.replace(/\$/g, "").split(":");
  const a = parseCellAddress(start ?? "");
  const b = parseCellAddress(end ?? "");
  if (!a || !b || a.row > b.row || a.column > b.column) throw new Error("Invalid pivot range.");
  return { start: a, end: b };
}

/** Detect native edits before restoring optional product-only presentation metadata. */
export function pivotFingerprint(root: XmlNode): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as XmlNode)
        .filter(([key]) => key !== "rowItems" && key !== "colItems" && !key.startsWith("@_xmlns"))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    );
  };
  const native = { ...root };
  const extensions = nodes(child(root, "extLst").ext).filter(
    (ext) => attr(ext, "uri") !== PIVOT_EXT,
  );
  if (extensions.length) native.extLst = { ext: extensions };
  else delete native.extLst;
  const serialized = JSON.stringify(canonical(native));
  // A change detector, not a security or authenticity signature.
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index++)
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}
