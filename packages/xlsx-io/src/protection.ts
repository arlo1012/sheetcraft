import { strFromU8, strToU8, type Unzipped } from "fflate/browser";
import { normalizeSheetProtection, type SheetProtection } from "@idea10/core";
import type { Sheet } from "@idea10/core/workbook";
import { formatCellAddress, parseCellAddress } from "@idea10/core/coordinates";
import { readXlsxWorksheetPartTargets } from "./raw-cell-values.js";
import type { CompatibilityReportBuilder } from "./report.js";

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
    const names: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (names[token]) return names[token]!;
    const code = Number.parseInt(
      token.slice(token[1]?.toLowerCase() === "x" ? 2 : 1),
      token[1]?.toLowerCase() === "x" ? 16 : 10,
    );
    return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : entity;
  });
}
function attr(xml: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(xml);
  return match ? decode(match[2]!) : undefined;
}
function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!,
  );
}
const truthy = (value: string | undefined) => value === "1" || value === "true";
const falsy = (value: string | undefined) => value === "0" || value === "false";

export function readXlsxProtection(entries: Unzipped, report: CompatibilityReportBuilder) {
  const workbookXml = entries["xl/workbook.xml"] ? strFromU8(entries["xl/workbook.xml"]!) : "";
  const workbookProtection =
    /<(?:\w+:)?workbookProtection\b([^>]*)\/?\s*>/i.exec(workbookXml)?.[1] ?? "";
  if (/password|hashValue|saltValue|algorithmName/i.test(workbookProtection))
    report.add("feature-omitted", "warning", "workbook.protection.password");
  const sheets = readXlsxWorksheetPartTargets(entries).map((part) => {
    const xml = entries[part] ? strFromU8(entries[part]!) : "";
    const protectionTag = /<(?:\w+:)?sheetProtection\b([^>]*)\/?\s*>/i.exec(xml)?.[1];
    const protection: SheetProtection = { editableRanges: [] };
    if (protectionTag) {
      for (const key of ["formatCells", "formatRows", "formatColumns"] as const) {
        if (falsy(attr(protectionTag, key))) protection[key] = true;
      }
      if (/password|hashValue|saltValue|algorithmName/i.test(protectionTag))
        report.add("feature-omitted", "warning", `${part}.protection.password`);
    }
    for (const match of xml.matchAll(/<(?:\w+:)?protectedRange\b([^>]*)\/?\s*>/gi)) {
      const attrs = match[1]!;
      // Password- or identity-restricted ranges must not become unrestricted edit exceptions.
      if (/password|hashValue|saltValue|securityDescriptor/i.test(attrs)) {
        report.add("feature-omitted", "warning", `${part}.protectedRange`);
        continue;
      }
      const references = (attr(attrs, "sqref") ?? "").split(/\s+/).filter(Boolean);
      const name = attr(attrs, "name") ?? "Range";
      for (const [index, reference] of references.entries()) {
        const [first, last = first] = reference.replaceAll("$", "").split(":");
        const start = parseCellAddress(first ?? "");
        const end = parseCellAddress(last ?? "");
        if (!start || !end) {
          report.add("feature-omitted", "warning", `${part}.protectedRange`);
          continue;
        }
        protection.editableRanges.push({
          name: references.length > 1 ? `${name}_${index + 1}` : name,
          range: { start, end },
        });
      }
    }
    return {
      protected: truthy(attr(protectionTag ?? "", "sheet")),
      protection: normalizeSheetProtection(protection),
    };
  });
  return { structureProtected: truthy(attr(workbookProtection, "lockStructure")), sheets };
}

export function writeXlsxProtection(
  entries: Unzipped,
  sheets: readonly Sheet[],
  structureProtected: boolean,
): void {
  for (const [index, part] of readXlsxWorksheetPartTargets(entries).entries()) {
    const sheet = sheets[index];
    if (!sheet || !entries[part]) continue;
    let xml = strFromU8(entries[part]!);
    const settings = sheet.protection;
    const tag = sheet.properties.protected
      ? `<sheetProtection sheet="1" objects="1" scenarios="1"${settings?.formatCells ? ' formatCells="0"' : ""}${settings?.formatRows ? ' formatRows="0"' : ""}${settings?.formatColumns ? ' formatColumns="0"' : ""}/>`
      : "";
    const ranges = settings?.editableRanges.length
      ? `<protectedRanges>${settings.editableRanges.map((entry) => `<protectedRange name="${escape(entry.name)}" sqref="${formatCellAddress(entry.range.start)}:${formatCellAddress(entry.range.end)}"/>`).join("")}</protectedRanges>`
      : "";
    xml = xml
      .replace(/<sheetProtection\b[^>]*\/>/g, "")
      .replace(/<protectedRanges\b[^>]*>[\s\S]*?<\/protectedRanges>/g, "");
    // Both elements follow sheetCalcPr (if present), otherwise sheetData.
    const boundary = /<sheetCalcPr\b[^>]*\/>/.test(xml)
      ? /(<sheetCalcPr\b[^>]*\/>)/
      : /(<\/sheetData>|<sheetData\s*\/>)/;
    entries[part] = strToU8(xml.replace(boundary, `$1${tag}${ranges}`));
  }
  const part = "xl/workbook.xml";
  if (!entries[part]) return;
  let xml = strFromU8(entries[part]!).replace(/<workbookProtection\b[^>]*\/>/g, "");
  if (structureProtected)
    xml = xml.replace(/(<bookViews\b|<sheets\b)/, '<workbookProtection lockStructure="1"/>$1');
  entries[part] = strToU8(xml);
}
