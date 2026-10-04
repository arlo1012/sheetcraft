import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from "fflate/browser";
import { normalizeCellNote, type CellNote, type Sheet } from "@idea10/core/workbook";
import { readXlsxWorksheetPartTargets } from "./raw-cell-values.js";

type RawCellNotes = Array<Map<string, CellNote>>;

function decodeXml(value: string): string {
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

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(attributes);
  return match ? decodeXml(match[2] ?? "") : undefined;
}

function worksheetRelationshipPart(part: string): string {
  return `xl/worksheets/_rels/${part.slice(part.lastIndexOf("/") + 1)}.rels`;
}

function normalizeRelationshipTarget(base: string, target: string): string | undefined {
  const segments = target.startsWith("/")
    ? target.slice(1).split("/")
    : [...base.slice(0, base.lastIndexOf("/")).split("/"), ...target.split("/")];
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") normalized.pop();
    else normalized.push(segment);
  }
  return normalized.join("/") || undefined;
}

function commentRelationshipForWorksheet(
  entries: Record<string, Uint8Array>,
  worksheetPart: string,
): { part: string; target: string } | undefined {
  const rels = entries[worksheetRelationshipPart(worksheetPart)];
  if (!rels) return undefined;
  for (const relation of strFromU8(rels).matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attrs = relation[1] ?? "";
    if (!/\/comments$/i.test(attribute(attrs, "Type") ?? "")) continue;
    const target = attribute(attrs, "Target");
    if (!target) continue;
    const path = normalizeRelationshipTarget(worksheetPart, target);
    if (path && entries[path]) return { part: path, target };
  }
  return undefined;
}

function commentPartForWorksheet(
  entries: Record<string, Uint8Array>,
  worksheetPart: string,
): string | undefined {
  return commentRelationshipForWorksheet(entries, worksheetPart)?.part;
}

function readComments(
  xml: string,
  onMalformedNote: ((reference: string) => void) | undefined,
): Map<string, CellNote> {
  const authors = [
    ...(/<(?:\w+:)?authors\b[^>]*>([\s\S]*?)<\/(?:\w+:)?authors>/i.exec(xml)?.[1] ?? "").matchAll(
      /<(?:\w+:)?author\b[^>]*>([\s\S]*?)<\/(?:\w+:)?author>|<(?:\w+:)?author\b[^>]*\/>/gi,
    ),
  ].map((match) => decodeXml(match[1] ?? ""));
  const notes = new Map<string, CellNote>();
  for (const comment of xml.matchAll(
    /<(?:\w+:)?comment\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?comment>)/gi,
  )) {
    const ref = attribute(comment[1] ?? "", "ref")?.toUpperCase();
    if (!ref) continue;
    const content = comment[2] ?? "";
    const text = [...content.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi)]
      .map((match) => decodeXml(match[1] ?? ""))
      .join("");
    const authorId = Number(attribute(comment[1] ?? "", "authorId"));
    const author = Number.isInteger(authorId) && authorId >= 0 ? authors[authorId] : undefined;
    try {
      const note = normalizeCellNote({ text, ...(author ? { author } : {}) });
      if (note) notes.set(ref, note);
    } catch {
      // Malformed notes must not prevent the workbook's supported cells from loading.
      onMalformedNote?.(ref);
    }
  }
  return notes;
}

/** Reads classic XLSX cell notes, including author identity, outside ExcelJS's incomplete comment model. */
export function readXlsxCellNotes(
  entries: Record<string, Uint8Array>,
  onMalformedNote?: (sheetIndex: number, reference: string) => void,
): RawCellNotes {
  return readXlsxWorksheetPartTargets(entries).map((worksheetPart, sheetIndex) => {
    const commentPart = commentPartForWorksheet(entries, worksheetPart);
    return commentPart
      ? readComments(strFromU8(entries[commentPart]!), (reference) =>
          onMalformedNote?.(sheetIndex, reference),
        )
      : new Map<string, CellNote>();
  });
}

/**
 * ExcelJS only discovers comments named `commentsN.xml`. Retain the original
 * package for our raw reader, but give its grid parser a temporary conventional
 * alias for any valid comments relationship target.
 */
export function withExcelJsCompatibleCellNotes(bytes: Uint8Array): Uint8Array {
  const entries = unzipSync(bytes);
  const worksheetParts = readXlsxWorksheetPartTargets(entries);
  let nextPartNumber = 1;
  let changed = false;
  for (const worksheetPart of worksheetParts) {
    const relationship = commentRelationshipForWorksheet(entries, worksheetPart);
    if (!relationship) continue;
    const relsPart = worksheetRelationshipPart(worksheetPart);
    const rels = strFromU8(entries[relsPart]!);
    let alias = `xl/comments${nextPartNumber}.xml`;
    while (entries[alias] && alias !== relationship.part)
      alias = `xl/comments${++nextPartNumber}.xml`;
    nextPartNumber += 1;
    const relativeAlias = `../${alias.slice("xl/".length)}`;
    if (relationship.part === alias && relationship.target === relativeAlias) continue;
    entries[alias] = entries[relationship.part]!;
    entries[relsPart] = strToU8(
      rels.replace(/<Relationship\b([^>]*)\/?\s*>/gi, (whole, attrs: string) =>
        /\/comments$/i.test(attribute(attrs, "Type") ?? "") &&
        attribute(attrs, "Target") === relationship.target
          ? whole.replace(
              attrs,
              attrs.replace(/\bTarget\s*=\s*(["'])[^"']*\1/i, `Target="${relativeAlias}"`),
            )
          : whole,
      ),
    );
    changed = true;
  }
  return changed ? zipSync(entries) : bytes;
}

function cellAddress(key: string): string | undefined {
  const [row, column, extra] = key.split(":").map(Number);
  if (
    row === undefined ||
    column === undefined ||
    extra !== undefined ||
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    column < 0
  )
    return undefined;
  let label = "";
  for (let value = column + 1; value > 0; value = Math.floor((value - 1) / 26))
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return `${label}${row + 1}`;
}

/** Replaces ExcelJS's fixed \"Author\" table with the Core note authors it cannot serialize itself. */
export function writeXlsxCellNotes(entries: Unzipped, sheets: readonly Sheet[]): void {
  const worksheetParts = readXlsxWorksheetPartTargets(entries);
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const worksheetPart = worksheetParts[sheetIndex];
    if (!worksheetPart) continue;
    const commentPart = commentPartForWorksheet(entries, worksheetPart);
    if (!commentPart) continue;
    const notes = new Map<string, CellNote>();
    for (const [key, cell] of sheet.cells) {
      const reference = cellAddress(key);
      if (reference && cell.note) notes.set(reference, cell.note);
    }
    if (!notes.size) continue;
    const authors: string[] = [];
    const authorId = new Map<string, number>();
    for (const note of notes.values()) {
      const author = note.author ?? "";
      if (!authorId.has(author)) {
        authorId.set(author, authors.length);
        authors.push(author);
      }
    }
    const xml = strFromU8(entries[commentPart]!);
    const comments = xml.replace(
      /<comment\b([^>]*)(?:\/>|>([\s\S]*?)<\/comment>)/gi,
      (whole, attrs: string) => {
        const reference = attribute(attrs, "ref")?.toUpperCase();
        const note = reference ? notes.get(reference) : undefined;
        if (!note) return whole;
        const id = authorId.get(note.author ?? "")!;
        const withoutAuthorId = attrs.replace(/\s+authorId\s*=\s*(["']).*?\1/i, "");
        return whole.replace(attrs, `${withoutAuthorId} authorId="${id}"`);
      },
    );
    const authorXml = `<authors>${authors.map((author) => `<author>${escapeXml(author)}</author>`).join("")}</authors>`;
    entries[commentPart] = strToU8(
      comments.replace(/<authors\b[^>]*>[\s\S]*?<\/authors>/i, authorXml),
    );
  }
}
