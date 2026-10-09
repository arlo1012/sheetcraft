import { strFromU8, unzipSync } from "fflate/browser";
import { attr, child, nodes, parseXml, relationships } from "./pivot-xml.js";

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
  const targets = readXlsxWorksheetPartTargets(entries);
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
  const targets = readXlsxWorksheetPartTargets(entries);
  return targets.map((target) => {
    const worksheet = entries[target];
    return worksheet
      ? readRawTextDirections(strFromU8(worksheet), directionsByStyle)
      : new Map<string, "context" | "ltr" | "rtl">();
  });
}

/** ExcelJS exposes a hyperlink cell as a link object and can hide its formula. */
export function readRawWorksheetFormulas(
  bytes: Uint8Array,
): readonly ReadonlyMap<string, string>[] {
  const entries = unzipSync(bytes);
  const workbook = entries["xl/workbook.xml"];
  const relationships = entries["xl/_rels/workbook.xml.rels"];
  if (!workbook || !relationships) return [];
  const targets = readXlsxWorksheetPartTargets(entries);
  return targets.map((target) => {
    const worksheet = entries[target];
    const formulas = new Map<string, string>();
    if (!worksheet) return formulas;
    for (const cell of strFromU8(worksheet).matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/gi)) {
      const address = readAttribute(cell[1] ?? "", "r");
      const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/i.exec(cell[2] ?? "")?.[1];
      if (address && formula !== undefined) formulas.set(address.toUpperCase(), `=${formula}`);
    }
    return formulas;
  });
}

/** Workbook-order worksheet part names resolved through workbook relationships. */
export function readXlsxWorksheetPartTargets(
  entries: Record<string, Uint8Array>,
): readonly string[] {
  const workbook = entries["xl/workbook.xml"];
  if (!workbook || !entries["xl/_rels/workbook.xml.rels"]) return [];
  const root = child(parseXml(workbook), "workbook");
  const rels = relationships(entries, "xl/workbook.xml");
  const targets: string[] = [];
  for (const sheet of nodes(child(root, "sheets").sheet)) {
    const relation = rels.get(attr(sheet, "id"));
    if (
      relation?.type.endsWith("/worksheet") &&
      /^xl\/worksheets\/[^/]+\.xml$/i.test(relation.target)
    )
      targets.push(relation.target);
  }
  return targets;
}

function readAttribute(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escapedName}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(attributes);
  return match?.[2];
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
