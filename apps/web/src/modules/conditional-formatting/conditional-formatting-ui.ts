import {
  cloneConditionalFormatRule as cloneCoreConditionalFormatRule,
  type ConditionalFormatOperand,
  type ConditionalFormatTextOperand,
  type SheetConditionalFormatRule,
} from "@sheetcraft/core/conditional-formatting";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
} from "@sheetcraft/core/workbook";

export type ConditionalFormatValueOperand = ConditionalFormatOperand;

/**
 * Converts the compact value syntax used by conditional-format controls into
 * the persisted operand. A leading equals sign is a formula; quoting or
 * an Excel-style leading apostrophe forces a literal value (including
 * numeric-looking and =-leading strings).
 */
export function parseConditionalFormatValueOperand(
  input: string,
  preserveLiteral = false,
): ConditionalFormatValueOperand {
  if (preserveLiteral) return input;
  const value = input.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  )
    return value.slice(1, -1).replace(/\\([\\"'])/g, "$1");
  if (value.startsWith("'")) return value.slice(1);
  if (value.startsWith("=")) return { formula: value };
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : input;
}

export function formatConditionalFormatValueOperand(operand: ConditionalFormatValueOperand): {
  value: string;
  literal: boolean;
} {
  if (typeof operand === "number") return { value: String(operand), literal: false };
  if (typeof operand === "string") return { value: operand, literal: true };
  return { value: operand.formula, literal: false };
}

/** Text conditions keep numeric-looking literals intact while accepting formulas. */
export function parseConditionalFormatTextOperand(
  input: string,
  preserveLiteral = false,
): ConditionalFormatTextOperand {
  const operand = parseConditionalFormatValueOperand(input, preserveLiteral);
  return typeof operand === "number" ? input : operand;
}

export type ConditionalFormatKind = SheetConditionalFormatRule["condition"]["kind"];

export function createConditionalFormatRuleId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `conditional-format-${Date.now()}-${Math.random()}`;
}

const CELL_REFERENCE = /^\$?([A-Z]{1,3})\$?([1-9]\d*)$/i;

function parseAddress(value: string): CellAddress | null {
  const match = CELL_REFERENCE.exec(value.trim());
  if (!match) return null;
  let column = 0;
  for (const character of match[1]!.toUpperCase())
    column = column * 26 + character.charCodeAt(0) - 64;
  const address = { row: Number(match[2]!) - 1, column: column - 1 };
  return address.row < MAX_SHEET_ROWS && address.column < MAX_SHEET_COLUMNS ? address : null;
}

function normalizeRange(start: CellAddress, end: CellAddress): CellRange {
  return {
    start: { row: Math.min(start.row, end.row), column: Math.min(start.column, end.column) },
    end: { row: Math.max(start.row, end.row), column: Math.max(start.column, end.column) },
  };
}

/** Parses the A1 areas accepted by the rule manager, e.g. A1:B4, D2. */
export function parseConditionalFormatRanges(reference: string): CellRange[] | null {
  const parts = reference
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const ranges: CellRange[] = [];
  for (const part of parts) {
    const [startText, endText, ...rest] = part.split(":");
    if (rest.length || !startText) return null;
    const start = parseAddress(startText);
    const end = parseAddress(endText ?? startText);
    if (!start || !end) return null;
    ranges.push(normalizeRange(start, end));
  }
  return ranges;
}

export function formatConditionalFormatRanges(ranges: readonly CellRange[]): string {
  return ranges
    .map((range) => {
      const start = formatCellAddress(range.start);
      const end = formatCellAddress(range.end);
      return start === end ? start : `${start}:${end}`;
    })
    .join(", ");
}

export function conditionalFormatRangesIntersect(
  left: readonly CellRange[],
  right: readonly CellRange[],
): boolean {
  return left.some((a) =>
    right.some(
      (b) =>
        a.start.row <= b.end.row &&
        a.end.row >= b.start.row &&
        a.start.column <= b.end.column &&
        a.end.column >= b.start.column,
    ),
  );
}

export function cloneConditionalFormatRule(
  rule: SheetConditionalFormatRule,
): SheetConditionalFormatRule {
  return cloneCoreConditionalFormatRule(rule);
}
