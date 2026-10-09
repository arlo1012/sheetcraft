import { strFromU8, strToU8, type Unzipped } from "fflate/browser";
import {
  getColumnWidth,
  getRowHeight,
  normalizeCellNote,
  type CellNote,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { readXlsxWorksheetPartTargets } from "./raw-cell-values.js";
import { decodeSpreadsheetText } from "./native/reader-xml.js";
import { xlsxText } from "./native/writer-text.js";

type RawCellNotes = Array<Map<string, CellNote>>;
export type XlsxVmlNoteBox = Readonly<{ left: number; top: number; width: number; height: number }>;

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

function relationshipPartForWorksheet(
  entries: Record<string, Uint8Array>,
  worksheetPart: string,
  typeSuffix: string,
): string | undefined {
  const rels = entries[worksheetRelationshipPart(worksheetPart)];
  if (!rels) return undefined;
  for (const relation of strFromU8(rels).matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attrs = relation[1] ?? "";
    if (!new RegExp(`/${typeSuffix}$`, "i").test(attribute(attrs, "Type") ?? "")) continue;
    const target = attribute(attrs, "Target");
    const path = target ? normalizeRelationshipTarget(worksheetPart, target) : undefined;
    if (path && entries[path]) return path;
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
  ].map((match) => decodeSpreadsheetText(decodeXml(match[1] ?? "")));
  const notes = new Map<string, CellNote>();
  for (const comment of xml.matchAll(
    /<(?:\w+:)?comment\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?comment>)/gi,
  )) {
    const ref = attribute(comment[1] ?? "", "ref")?.toUpperCase();
    if (!ref) continue;
    const content = comment[2] ?? "";
    const text = [...content.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi)]
      .map((match) => decodeSpreadsheetText(decodeXml(match[1] ?? "")))
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

/** Reads classic XLSX cell notes, including author identity, through relationship targets. */
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

function cssPixels(style: string | undefined, property: string): number | undefined {
  if (!style) return undefined;
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:^|;)\\s*${escaped}\\s*:\\s*(-?(?:\\d+\\.?\\d*|\\.\\d+))(pt|px)?`,
    "i",
  ).exec(style);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return match[2]?.toLowerCase() === "pt" ? (value * 4) / 3 : value;
}

function vmlTagText(xml: string, localName: string): string | undefined {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `<(?:\\w+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${escaped}>`,
    "i",
  ).exec(xml)?.[1];
}

function noteReference(row: string | undefined, column: string | undefined): string | undefined {
  const rowNumber = Number(row?.trim());
  const columnNumber = Number(column?.trim());
  if (
    !Number.isInteger(rowNumber) ||
    !Number.isInteger(columnNumber) ||
    rowNumber < 0 ||
    columnNumber < 0
  )
    return undefined;
  let label = "";
  for (let value = columnNumber + 1; value > 0; value = Math.floor((value - 1) / 26))
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return `${label}${rowNumber + 1}`;
}

/** Reads the rendered VML rectangle of each classic note in CSS pixels. */
export function readXlsxCellNoteVmlBoxes(
  entries: Record<string, Uint8Array>,
): Array<Map<string, XlsxVmlNoteBox>> {
  return readXlsxWorksheetPartTargets(entries).map((worksheetPart) => {
    const vmlPart = relationshipPartForWorksheet(entries, worksheetPart, "vmlDrawing");
    if (!vmlPart) return new Map<string, XlsxVmlNoteBox>();
    const result = new Map<string, XlsxVmlNoteBox>();
    const xml = strFromU8(entries[vmlPart]!);
    for (const shape of xml.matchAll(
      /<(?:\w+:)?shape\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?shape>)/gi,
    )) {
      const body = shape[2] ?? "";
      const clientData =
        /<(?:\w+:)?ClientData\b[^>]*ObjectType\s*=\s*(["'])Note\1[^>]*>([\s\S]*?)<\/(?:\w+:)?ClientData>/i.exec(
          body,
        )?.[2];
      if (!clientData) continue;
      const reference = noteReference(
        vmlTagText(clientData, "Row"),
        vmlTagText(clientData, "Column"),
      );
      const style = attribute(shape[1] ?? "", "style");
      const left = cssPixels(style, "margin-left");
      const top = cssPixels(style, "margin-top");
      const width = cssPixels(style, "width");
      const height = cssPixels(style, "height");
      if (
        !reference ||
        left === undefined ||
        top === undefined ||
        width === undefined ||
        height === undefined
      )
        continue;
      result.set(reference, { left, top, width, height });
    }
    return result;
  });
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
    const authorXml = `<authors>${authors.map((author) => `<author>${xlsxText(author)}</author>`).join("")}</authors>`;
    entries[commentPart] = strToU8(
      comments.replace(/<authors\b[^>]*>[\s\S]*?<\/authors>/i, authorXml),
    );
  }
}

function pixelsToPoints(value: number): string {
  return `${Number(((value * 3) / 4).toFixed(3))}pt`;
}

function replaceStyleLength(style: string, property: string, pixels: number): string {
  const expression = new RegExp(`(^|;)\\s*${property}\\s*:[^;]*`, "i");
  const replacement = `$1${property}:${pixelsToPoints(pixels)}`;
  return expression.test(style)
    ? style.replace(expression, replacement)
    : `${style};${replacement.slice(1)}`;
}

function noteBoxAnchor(
  sheet: Sheet,
  horizontal: number,
  vertical: number,
): [number, number, number, number] {
  let column = 0;
  let left = Math.max(0, horizontal);
  while (column < 16_383) {
    const width = getColumnWidth(sheet, column);
    if (left <= width) break;
    left -= width;
    column += 1;
  }
  let row = 0;
  let top = Math.max(0, vertical);
  while (row < 1_048_575) {
    const height = getRowHeight(sheet, row);
    if (top <= height) break;
    top -= height;
    row += 1;
  }
  return [
    column,
    Math.round((left / getColumnWidth(sheet, column)) * 1024),
    row,
    Math.round((top / getRowHeight(sheet, row)) * 256),
  ];
}

function noteBoxPosition(sheet: Sheet, row: number, column: number, note: CellNote) {
  const box = note.box!;
  let cellRight = 0;
  for (let index = 0; index <= column; index += 1) cellRight += getColumnWidth(sheet, index);
  let cellTop = 0;
  for (let index = 0; index < row; index += 1) cellTop += getRowHeight(sheet, index);
  const left = cellRight + box.offsetX;
  const top = cellTop + box.offsetY;
  const right = left + box.width;
  const bottom = top + box.height;
  return {
    left,
    top,
    width: box.width,
    height: box.height,
    anchor: [...noteBoxAnchor(sheet, left, top), ...noteBoxAnchor(sheet, right, bottom)].join(", "),
  };
}

/** Writes Core note rectangles into the generated classic-comment VML drawing. */
export function writeXlsxCellNoteVmlBoxes(entries: Unzipped, sheets: readonly Sheet[]): void {
  const worksheetParts = readXlsxWorksheetPartTargets(entries);
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const worksheetPart = worksheetParts[sheetIndex];
    if (!worksheetPart) continue;
    const vmlPart = relationshipPartForWorksheet(entries, worksheetPart, "vmlDrawing");
    if (!vmlPart) continue;
    const xml = strFromU8(entries[vmlPart]!);
    entries[vmlPart] = strToU8(
      xml.replace(
        /<(?:\w+:)?shape\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?shape>)/gi,
        (whole, attrs: string, body: string | undefined) => {
          if (!body) return whole;
          const clientData =
            /<(?:\w+:)?ClientData\b[^>]*ObjectType\s*=\s*(["'])Note\1[^>]*>([\s\S]*?)<\/(?:\w+:)?ClientData>/i.exec(
              body,
            )?.[2];
          const reference = clientData
            ? noteReference(vmlTagText(clientData, "Row"), vmlTagText(clientData, "Column"))
            : undefined;
          const address = reference ? /^([A-Z]+)([1-9]\d*)$/i.exec(reference) : undefined;
          if (!address) return whole;
          const column =
            [...address[1]!.toUpperCase()].reduce(
              (value, character) => value * 26 + character.charCodeAt(0) - 64,
              0,
            ) - 1;
          const row = Number(address[2]) - 1;
          const note = sheet.cells.get(`${row}:${column}`)?.note;
          if (!note?.box) return whole;
          const position = noteBoxPosition(sheet, row, column, note);
          const style = attribute(attrs, "style") ?? "";
          const nextStyle = replaceStyleLength(
            replaceStyleLength(
              replaceStyleLength(style, "margin-left", position.left),
              "margin-top",
              position.top,
            ),
            "width",
            position.width,
          );
          const sizedStyle = replaceStyleLength(nextStyle, "height", position.height);
          const styled = whole.replace(
            attrs,
            attrs.replace(/\bstyle\s*=\s*(["'])[^"']*\1/i, `style="${sizedStyle}"`),
          );
          return /<(?:\w+:)?Anchor\b[^>]*>/i.test(styled)
            ? styled.replace(
                /(<(?:\w+:)?Anchor\b[^>]*>)[\s\S]*?(<\/(?:\w+:)?Anchor>)/i,
                `$1${position.anchor}$2`,
              )
            : styled.replace(
                /(<(?:\w+:)?Row\b[^>]*>)/i,
                `<x:Anchor>${position.anchor}</x:Anchor>$1`,
              );
        },
      ),
    );
  }
}
