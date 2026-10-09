import { strFromU8, strToU8, unzipSync, type Unzipped } from "fflate/browser";
import type { CellRange, DefinedName, Sheet, Workbook } from "@sheetcraft/core/workbook";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "@sheetcraft/core/workbook";
import type { CompatibilityReportBuilder } from "./report.js";

const NAME_PATTERN = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const MAX_DEFINED_NAME_COMMENT_LENGTH = 255;

type XlsxDefinedName = Readonly<{
  name: string;
  localSheetId?: number;
  comment?: string;
  reference: string;
}>;

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
    if (normalized in named) return named[normalized] ?? entity;
    const codePoint = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!,
  );
}

/** XML attributes normalize raw whitespace, so preserve textarea content explicitly. */
function escapeXmlAttribute(value: string): string {
  return escapeXml(value).replace(/[\t\n\r]/g, (character) => {
    switch (character) {
      case "\t":
        return "&#9;";
      case "\n":
        return "&#10;";
      case "\r":
        return "&#13;";
      default:
        return character;
    }
  });
}

function columnIndex(label: string): number {
  return (
    [...label.toUpperCase()].reduce(
      (result, character) => result * 26 + character.charCodeAt(0) - 64,
      0,
    ) - 1
  );
}

function parseRange(value: string): CellRange | null {
  const match = /^\$?([A-Z]+)\$?([1-9]\d*)(?::\$?([A-Z]+)\$?([1-9]\d*))?$/i.exec(value);
  if (!match) return null;
  const start = { column: columnIndex(match[1] ?? ""), row: Number(match[2]) - 1 };
  const end = {
    column: columnIndex(match[3] ?? match[1] ?? ""),
    row: Number(match[4] ?? match[2]) - 1,
  };
  return start.row >= 0 &&
    end.row < MAX_SHEET_ROWS &&
    start.column >= 0 &&
    end.column < MAX_SHEET_COLUMNS
    ? { start, end }
    : null;
}

function parseReference(
  value: string,
  sheets: readonly Sheet[],
): { sheetId: string; range: CellRange } | null {
  const match =
    /^(?:'((?:[^']|'')+)'|([^'!]+))!(\$?[A-Z]+\$?[1-9]\d*(?::\$?[A-Z]+\$?[1-9]\d*)?)$/i.exec(
      value.trim(),
    );
  if (!match) return null;
  const sheetName = (match[1] ?? match[2] ?? "").replace(/''/g, "'");
  const sheet = sheets.find(
    (candidate) => candidate.name.toLocaleLowerCase() === sheetName.toLocaleLowerCase(),
  );
  const range = parseRange(match[3] ?? "");
  return sheet && range ? { sheetId: sheet.id, range } : null;
}

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g))
    result[match[1] ?? ""] = decodeXmlEntities(match[3] ?? "");
  return result;
}

/** Reads the supported one-range subset directly from OOXML, because ExcelJS does not expose local names consistently. */
export function readDefinedNames(
  bytes: Uint8Array,
  sheets: readonly Sheet[],
  report: CompatibilityReportBuilder,
): Map<string, DefinedName> {
  const workbookXml = unzipSync(bytes)["xl/workbook.xml"];
  if (!workbookXml) return new Map();
  const container = /<(?:\w+:)?definedNames\b[^>]*>([\s\S]*?)<\/(?:\w+:)?definedNames\s*>/i.exec(
    strFromU8(workbookXml),
  );
  if (!container) return new Map();
  const definitions = new Map<string, DefinedName>();
  const keys = new Set<string>();
  let index = 0;
  for (const match of (container[1] ?? "").matchAll(
    /<(?:\w+:)?definedName\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?definedName\s*>)/gi,
  )) {
    const attrs = attributes(match[1] ?? "");
    const name = attrs.name;
    // Print area is sheet page-setup state, not a user-defined name. It has a
    // dedicated OOXML reader so a continuous range survives XLSX roundtrips.
    if (name?.toLowerCase() === "_xlnm.print_area") {
      index += 1;
      continue;
    }
    const localSheetId = attrs.localSheetId === undefined ? undefined : Number(attrs.localSheetId);
    const reference = parseReference(decodeXmlEntities(match[2] ?? "").trim(), sheets);
    const scopeSheet = localSheetId === undefined ? undefined : sheets[localSheetId];
    const reportLocation = `definedName:${name ?? index + 1}`;
    if (
      !name ||
      !NAME_PATTERN.test(name) ||
      (attrs.comment !== undefined && attrs.comment.length > MAX_DEFINED_NAME_COMMENT_LENGTH) ||
      (localSheetId !== undefined && (!Number.isInteger(localSheetId) || !scopeSheet)) ||
      !reference
    ) {
      report.add("feature-omitted", "warning", reportLocation);
      index += 1;
      continue;
    }
    const key = `${scopeSheet?.id ?? "workbook"}:${name.toUpperCase()}`;
    if (keys.has(key)) {
      report.add("feature-omitted", "warning", reportLocation);
      index += 1;
      continue;
    }
    keys.add(key);
    const id = `xlsx-defined-name-${scopeSheet?.id ?? "workbook"}-${name.toUpperCase()}`;
    definitions.set(id, {
      id,
      name,
      ...(scopeSheet ? { scopeSheetId: scopeSheet.id } : {}),
      ...(attrs.comment !== undefined ? { comment: attrs.comment } : {}),
      reference: {
        sheetId: reference.sheetId,
        start: reference.range.start,
        end: reference.range.end,
      },
    });
    index += 1;
  }
  return definitions;
}

function columnLabel(column: number): string {
  let value = column + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function formatReference(sheet: Sheet, range: CellRange): string {
  const cell = (address: { row: number; column: number }) =>
    `$${columnLabel(address.column)}$${address.row + 1}`;
  return `${quoteSheetName(sheet.name)}!${cell(range.start)}:${cell(range.end)}`;
}

export function collectDefinedNames(
  workbook: Workbook,
  report: CompatibilityReportBuilder,
): XlsxDefinedName[] {
  const sheets = [...workbook.sheets.values()];
  const result: XlsxDefinedName[] = [];
  const keys = new Set<string>();
  for (const definition of workbook.definedNames.values()) {
    const scopeIndex =
      definition.scopeSheetId === undefined
        ? undefined
        : sheets.findIndex((sheet) => sheet.id === definition.scopeSheetId);
    const targetSheet = sheets.find((sheet) => sheet.id === definition.reference.sheetId);
    const key = `${definition.scopeSheetId ?? "workbook"}:${definition.name.toUpperCase()}`;
    if (
      !NAME_PATTERN.test(definition.name) ||
      (definition.comment !== undefined &&
        definition.comment.length > MAX_DEFINED_NAME_COMMENT_LENGTH) ||
      scopeIndex === -1 ||
      !targetSheet ||
      keys.has(key)
    ) {
      report.add("feature-omitted", "warning", `definedName:${definition.name}`);
      continue;
    }
    keys.add(key);
    result.push({
      name: definition.name,
      ...(scopeIndex === undefined ? {} : { localSheetId: scopeIndex }),
      ...(definition.comment !== undefined ? { comment: definition.comment } : {}),
      reference: formatReference(targetSheet, definition.reference),
    });
  }
  return result;
}

export function writeDefinedNames(
  entries: Unzipped,
  definitions: readonly XlsxDefinedName[],
): void {
  if (definitions.length === 0) return;
  const workbook = entries["xl/workbook.xml"];
  if (!workbook) throw new Error("Missing generated XLSX workbook.");
  const xml = strFromU8(workbook);
  const content = definitions
    .map(
      (definition) =>
        `<definedName name="${escapeXml(definition.name)}"${definition.localSheetId === undefined ? "" : ` localSheetId="${definition.localSheetId}"`}${definition.comment === undefined ? "" : ` comment="${escapeXmlAttribute(definition.comment)}"`}>${escapeXml(definition.reference)}</definedName>`,
    )
    .join("");
  const withoutExisting = xml.replace(
    /<(?:\w+:)?definedNames\b[^>]*>[\s\S]*?<\/(?:\w+:)?definedNames\s*>/i,
    "",
  );
  if (!/<\/(?:\w+:)?workbook\s*>/i.test(withoutExisting))
    throw new Error("Unexpected generated XLSX workbook.");
  entries["xl/workbook.xml"] = strToU8(
    withoutExisting.replace(
      /<\/(?:\w+:)?workbook\s*>/i,
      () => `<definedNames>${content}</definedNames></workbook>`,
    ),
  );
}
