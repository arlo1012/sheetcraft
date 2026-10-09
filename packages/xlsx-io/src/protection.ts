import { strFromU8, strToU8, type Unzipped } from "fflate/browser";
import {
  normalizeSheetProtection,
  normalizeProtectionPassword,
  type ProtectionPassword,
  type SheetProtection,
} from "@sheetcraft/core";
import type { Sheet } from "@sheetcraft/core/workbook";
import { formatCellAddress, parseCellAddress } from "@sheetcraft/core/coordinates";
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

function readPassword(
  xml: string,
  report: CompatibilityReportBuilder,
  location: string,
  workbook = false,
): ProtectionPassword | undefined {
  const legacy = attr(xml, workbook ? "workbookPassword" : "password");
  const algorithmName = attr(xml, workbook ? "workbookAlgorithmName" : "algorithmName");
  if (!legacy && !algorithmName && !/hashValue|saltValue/i.test(xml)) return undefined;
  try {
    return normalizeProtectionPassword(
      algorithmName
        ? {
            kind: "hash",
            algorithmName: algorithmName as Extract<
              ProtectionPassword,
              { kind: "hash" }
            >["algorithmName"],
            saltValue: attr(xml, workbook ? "workbookSaltValue" : "saltValue") ?? "",
            hashValue: attr(xml, workbook ? "workbookHashValue" : "hashValue") ?? "",
            spinCount: Number(attr(xml, workbook ? "workbookSpinCount" : "spinCount")),
          }
        : { kind: "legacy", hash: legacy ?? "" },
    );
  } catch {
    report.add("feature-omitted", "block", location);
    return undefined;
  }
}
function writePassword(password: ProtectionPassword | undefined, workbook = false): string {
  if (!password) return "";
  if (password.kind === "legacy")
    return ` ${workbook ? "workbookPassword" : "password"}="${escape(password.hash)}"`;
  const prefix = workbook ? "workbook" : "";
  const name = (key: string) => (prefix ? prefix + key[0]!.toUpperCase() + key.slice(1) : key);
  return ` ${name("algorithmName")}="${password.algorithmName}" ${name("hashValue")}="${password.hashValue}" ${name("saltValue")}="${password.saltValue}" ${name("spinCount")}="${password.spinCount}"`;
}

export function readXlsxProtection(entries: Unzipped, report: CompatibilityReportBuilder) {
  const workbookXml = entries["xl/workbook.xml"] ? strFromU8(entries["xl/workbook.xml"]!) : "";
  const workbookProtection =
    /<(?:\w+:)?workbookProtection\b([^>]*)\/?\s*>/i.exec(workbookXml)?.[1] ?? "";
  const structurePassword = readPassword(
    workbookProtection,
    report,
    "workbook.protection.password",
    true,
  );
  const sheets = readXlsxWorksheetPartTargets(entries).map((part) => {
    const xml = entries[part] ? strFromU8(entries[part]!) : "";
    const protectionTag = /<(?:\w+:)?sheetProtection\b([^>]*)\/?\s*>/i.exec(xml)?.[1];
    const protection: SheetProtection = { editableRanges: [] };
    if (protectionTag) {
      for (const key of [
        "formatCells",
        "formatRows",
        "formatColumns",
        "insertColumns",
        "insertRows",
        "insertHyperlinks",
        "deleteColumns",
        "deleteRows",
        "sort",
        "autoFilter",
        "pivotTables",
      ] as const) {
        if (falsy(attr(protectionTag, key))) protection[key] = true;
      }
      if (falsy(attr(protectionTag, "objects"))) protection.editObjects = true;
      if (truthy(attr(protectionTag, "selectLockedCells"))) protection.selectLockedCells = false;
      if (truthy(attr(protectionTag, "selectUnlockedCells")))
        protection.selectUnlockedCells = false;
      const password = readPassword(protectionTag, report, `${part}.protection.password`);
      if (password) protection.password = password;
    }
    for (const match of xml.matchAll(/<(?:\w+:)?protectedRange\b([^>]*)\/?\s*>/gi)) {
      const attrs = match[1]!;
      // Password- or identity-restricted ranges must not become unrestricted edit exceptions.
      if (/securityDescriptor/i.test(attrs)) {
        report.add("feature-omitted", "warning", `${part}.protectedRange`);
        continue;
      }
      const password = readPassword(attrs, report, `${part}.protectedRange.password`);
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
          ...(password ? { password } : {}),
        });
      }
    }
    return {
      protected: truthy(attr(protectionTag ?? "", "sheet")),
      protection: normalizeSheetProtection(protection),
    };
  });
  return {
    structureProtected: truthy(attr(workbookProtection, "lockStructure")),
    structurePassword,
    sheets,
  };
}

export function writeXlsxProtection(
  entries: Unzipped,
  sheets: readonly Sheet[],
  structureProtected: boolean,
  structurePassword?: ProtectionPassword,
): void {
  for (const [index, part] of readXlsxWorksheetPartTargets(entries).entries()) {
    const sheet = sheets[index];
    if (!sheet || !entries[part]) continue;
    let xml = strFromU8(entries[part]!);
    const settings = sheet.protection;
    const allowed = [
      "formatCells",
      "formatRows",
      "formatColumns",
      "insertColumns",
      "insertRows",
      "insertHyperlinks",
      "deleteColumns",
      "deleteRows",
      "sort",
      "autoFilter",
      "pivotTables",
    ] as const;
    const permissions = allowed.map((key) => (settings?.[key] ? ` ${key}="0"` : "")).join("");
    const tag = sheet.properties.protected
      ? `<sheetProtection sheet="1" objects="${settings?.editObjects ? 0 : 1}" scenarios="1"${permissions}${settings?.selectLockedCells === false ? ' selectLockedCells="1"' : ""}${settings?.selectUnlockedCells === false ? ' selectUnlockedCells="1"' : ""}${writePassword(settings?.password)}/>`
      : "";
    const ranges = settings?.editableRanges.length
      ? `<protectedRanges>${settings.editableRanges.map((entry) => `<protectedRange name="${escape(entry.name)}"${writePassword(entry.password)} sqref="${formatCellAddress(entry.range.start)}:${formatCellAddress(entry.range.end)}"/>`).join("")}</protectedRanges>`
      : "";
    xml = xml
      .replace(/<sheetProtection\b[^>]*\/>/g, "")
      .replace(/<protectedRanges\b[^>]*>[\s\S]*?<\/protectedRanges>/g, "");
    // Both elements follow sheetCalcPr (if present), otherwise sheetData.
    const boundary = /<sheetCalcPr\b[^>]*\/>/.test(xml)
      ? /(<sheetCalcPr\b[^>]*\/>)/
      : /(<\/sheetData>|<sheetData\s*\/>)/;
    entries[part] = strToU8(xml.replace(boundary, (match) => `${match}${tag}${ranges}`));
  }
  const part = "xl/workbook.xml";
  if (!entries[part]) return;
  let xml = strFromU8(entries[part]!).replace(/<workbookProtection\b[^>]*\/>/g, "");
  if (structureProtected)
    xml = xml.replace(
      /(<bookViews\b|<sheets\b)/,
      `<workbookProtection lockStructure="1"${writePassword(structurePassword, true)}/>$1`,
    );
  entries[part] = strToU8(xml);
}
