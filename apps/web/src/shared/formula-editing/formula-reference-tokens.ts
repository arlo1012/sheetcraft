import { parseA1FormulaReference } from "@idea10/core/formula";
import type { CellRange } from "@idea10/core/workbook";

export type FormulaReferenceToken = Readonly<{
  start: number;
  end: number;
  text: string;
  range: CellRange;
  colorIndex: number;
  key: string;
}>;

const REFERENCE_AT_START = /^\$?[A-Za-z]+\$?[1-9]\d*(?:\s*:\s*\$?[A-Za-z]+\$?[1-9]\d*)?/;

/** Finds local A1 references without requiring the incomplete formula to parse. */
export function getFormulaReferenceTokens(source: string): readonly FormulaReferenceToken[] {
  if (!source.startsWith("=")) return [];
  const tokens: FormulaReferenceToken[] = [];
  const colors = new Map<string, number>();
  let quote: '"' | "'" | null = null;
  let bracketDepth = 0;
  for (let start = 0; start < source.length; start += 1) {
    const character = source[start];
    if (quote) {
      if (character === quote && source[start + 1] === quote) start += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") bracketDepth += 1;
    if (character === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (bracketDepth > 0) continue;
    if (!hasReferenceBoundaryBefore(source, start)) continue;
    const text = REFERENCE_AT_START.exec(source.slice(start))?.[0];
    if (!text) continue;
    const end = start + text.length;
    if (!hasReferenceBoundaryAfter(source, end) || /^\s*\(/.test(source.slice(end))) continue;
    const range = parseLocalRange(text);
    if (!range) continue;
    const key = normalizedRangeKey(range);
    const colorIndex = colors.get(key) ?? colors.size;
    colors.set(key, colorIndex);
    tokens.push({ start, end, text, range, colorIndex, key });
    start = end - 1;
  }
  return tokens;
}

function parseLocalRange(text: string): CellRange | null {
  const [startText, endText] = text.split(":").map((part) => part.trim());
  if (!startText) return null;
  const start = parseA1FormulaReference(startText);
  const end = endText ? parseA1FormulaReference(endText) : start;
  return start && end
    ? { start: { row: start.row, column: start.column }, end: { row: end.row, column: end.column } }
    : null;
}

function normalizedRangeKey(range: CellRange): string {
  return `${Math.min(range.start.row, range.end.row)}:${Math.min(range.start.column, range.end.column)}-${Math.max(range.start.row, range.end.row)}:${Math.max(range.start.column, range.end.column)}`;
}

function hasReferenceBoundaryBefore(source: string, start: number): boolean {
  const previous = source[start - 1];
  return previous === undefined || !isReferenceIdentifierCharacter(previous);
}

function hasReferenceBoundaryAfter(source: string, end: number): boolean {
  const next = source[end];
  return next === undefined || !isReferenceIdentifierCharacter(next);
}

function isReferenceIdentifierCharacter(character: string): boolean {
  return /[\p{L}\p{N}_$#!:[\]]/u.test(character);
}
