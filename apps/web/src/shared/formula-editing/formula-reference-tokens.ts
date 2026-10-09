import {
  MAX_FORMULA_COLUMNS,
  MAX_FORMULA_ROWS,
  parseA1FormulaReference,
} from "@sheetcraft/core/formula";
import type { CellRange } from "@sheetcraft/core/workbook";

export type FormulaReferenceRangeKind = "cells" | "row-axis" | "column-axis" | "spill";

export type FormulaReferenceToken = Readonly<{
  start: number;
  end: number;
  text: string;
  range: CellRange;
  sheetName?: string;
  colorIndex: number;
  key: string;
  /** Omitted only by legacy editor adapters; scanned tokens always provide it. */
  rangeKind?: FormulaReferenceRangeKind;
}>;

const REFERENCE_AT_START =
  /^(?:(?<sheet>'(?:[^']|'')+'|[\p{L}\p{N}_.]+)!)?(?<range>(?:\$?[A-Za-z]+\$?[1-9]\d*(?:\s*:\s*\$?[A-Za-z]+\$?[1-9]\d*)?#?)|(?:\$?[A-Za-z]+\s*:\s*\$?[A-Za-z]+)|(?:\$?[1-9]\d*\s*:\s*\$?[1-9]\d*))/u;

/** Finds A1 references without requiring the incomplete formula to parse. */
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
    if (character === '"') {
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
    const match = REFERENCE_AT_START.exec(source.slice(start));
    if (!match) {
      if (character === "'") quote = character;
      continue;
    }
    const text = match[0];
    const end = start + text.length;
    if (!hasReferenceBoundaryAfter(source, end) || /^\s*\(/.test(source.slice(end))) continue;
    const parsed = parseLocalRange(match.groups!.range!);
    if (!parsed) continue;
    const sheet = match.groups?.sheet;
    const sheetName = sheet?.startsWith("'") ? sheet.slice(1, -1).replaceAll("''", "'") : sheet;
    if (sheetName?.includes("[")) continue;
    const geometry = normalizedRangeKey(parsed.range);
    const key = `${sheetName ? `${sheetName.toLowerCase()}!` : ""}${parsed.rangeKind === "cells" ? "" : `${parsed.rangeKind}:`}${geometry}`;
    const colorIndex = colors.get(key) ?? colors.size;
    colors.set(key, colorIndex);
    tokens.push({
      start,
      end,
      text,
      range: parsed.range,
      rangeKind: parsed.rangeKind,
      colorIndex,
      key,
      ...(sheetName ? { sheetName } : {}),
    });
    start = end - 1;
  }
  return tokens;
}

function parseLocalRange(
  text: string,
): { range: CellRange; rangeKind: FormulaReferenceRangeKind } | null {
  const spill = text.endsWith("#");
  const referenceText = spill ? text.slice(0, -1) : text;
  const [startText, endText] = referenceText.split(":").map((part) => part.trim());
  if (!startText) return null;
  const start = parseA1FormulaReference(startText);
  const end = endText ? parseA1FormulaReference(endText) : start;
  if (start && end && !spill && (!endText || end))
    return {
      range: {
        start: { row: start.row, column: start.column },
        end: { row: end.row, column: end.column },
      },
      rangeKind: "cells",
    };
  if (start && !endText && spill)
    return {
      range: {
        start: { row: start.row, column: start.column },
        end: { row: start.row, column: start.column },
      },
      rangeKind: "spill",
    };
  if (!endText || spill) return null;
  const startColumn = columnIndex(startText.replace("$", ""));
  const endColumn = columnIndex(endText.replace("$", ""));
  if (startColumn !== null && endColumn !== null)
    return {
      range: {
        start: { row: 0, column: startColumn },
        end: { row: MAX_FORMULA_ROWS - 1, column: endColumn },
      },
      rangeKind: "column-axis",
    };
  const startRow = rowIndex(startText.replace("$", ""));
  const endRow = rowIndex(endText.replace("$", ""));
  return startRow !== null && endRow !== null
    ? {
        range: {
          start: { row: startRow, column: 0 },
          end: { row: endRow, column: MAX_FORMULA_COLUMNS - 1 },
        },
        rangeKind: "row-axis",
      }
    : null;
}

function columnIndex(value: string): number | null {
  if (!/^[A-Za-z]+$/.test(value)) return null;
  let result = 0;
  for (const character of value.toUpperCase()) result = result * 26 + character.charCodeAt(0) - 64;
  return result > 0 && result <= MAX_FORMULA_COLUMNS ? result - 1 : null;
}

function rowIndex(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result <= MAX_FORMULA_ROWS ? result - 1 : null;
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
