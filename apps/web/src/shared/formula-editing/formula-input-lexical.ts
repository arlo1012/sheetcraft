import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type CellRange } from "@idea10/core/workbook";
import { formatCellAddress } from "@idea10/core/coordinates";
import { getFormulaFunctionMetadata, type FormulaFunctionMetadata } from "@idea10/core/formula";
import {
  getFormulaReferenceTokens,
  type FormulaReferenceRangeKind,
} from "./formula-reference-tokens";

export type FormulaFunctionCandidate = FormulaFunctionMetadata & Readonly<{ id: string }>;

const SUPPORTED_FORMULA_FUNCTIONS: readonly FormulaFunctionCandidate[] =
  getFormulaFunctionMetadata().map((metadata) => ({
    ...metadata,
    id: metadata.name,
  }));

export type FormulaCompletionContext = {
  replaceStart: number;
  replaceEnd: number;
  query: string;
  argument: { functionName: string; index: number } | null;
};

export type FormulaReferenceEditContext = {
  replaceStart: number;
  replaceEnd: number;
};

type Range = { start: number; end: number };

const IDENTIFIER = /[A-Za-z_]/;
const IDENTIFIER_PART = /[A-Za-z0-9_]/;

export function getFormulaCompletionContext(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): FormulaCompletionContext | null {
  if (!isFormula(value)) return null;
  const selection = normalizeSelection(value, selectionStart, selectionEnd);
  if (isInsideQuotedText(value, selection.start)) return null;
  const token = identifierRangeAt(value, selection.start);
  if (!token) return null;
  if (referenceRangeAt(value, { start: token.start, end: token.end })) return null;
  const selectedWholeToken =
    selection.start !== selection.end &&
    selection.start === token.start &&
    selection.end === token.end;
  if (selection.start !== selection.end && !selectedWholeToken) return null;
  const caret = selectedWholeToken ? token.end : selection.start;
  const query = value.slice(token.start, caret);
  if (!query || !IDENTIFIER.test(query[0] ?? "") || !isFunctionPosition(value, token.start))
    return null;
  return {
    replaceStart: token.start,
    replaceEnd: token.end,
    query,
    argument: getFormulaArgumentContext(value, token.start),
  };
}

export function getSupportedFormulaCandidates(context: FormulaCompletionContext | null) {
  if (!context) return [];
  const prefix = context.query.toUpperCase();
  return SUPPORTED_FORMULA_FUNCTIONS.filter((candidate) => candidate.id.startsWith(prefix));
}

export function getSupportedFormulaFunction(name: string): FormulaFunctionCandidate | undefined {
  return SUPPORTED_FORMULA_FUNCTIONS.find((candidate) => candidate.name === name.toUpperCase());
}

export function applyFunctionCompletion(
  value: string,
  context: FormulaCompletionContext,
  functionName: string,
): { value: string; caret: number } {
  const after = value.slice(context.replaceEnd);
  const insertion = /^\s*\(/.test(after) ? functionName : `${functionName}(`;
  return replaceRange(value, context.replaceStart, context.replaceEnd, insertion);
}

export function getFormulaReferenceEditContext(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): FormulaReferenceEditContext | null {
  if (!isFormula(value)) return null;
  const selection = normalizeSelection(value, selectionStart, selectionEnd);
  const token = referenceRangeAt(value, selection);
  if (token) return { replaceStart: token.start, replaceEnd: token.end };
  if (isInsideQuotedText(value, selection.start)) return null;
  if (selection.start !== selection.end) return null;
  const previous = previousNonWhitespace(value, selection.start);
  return previous === "=" ||
    previous === "(" ||
    previous === "," ||
    previous === "+" ||
    previous === "-" ||
    previous === "*" ||
    previous === "/" ||
    previous === "^" ||
    previous === "<" ||
    previous === ">" ||
    previous === "=" ||
    previous === "&"
    ? { replaceStart: selection.start, replaceEnd: selection.end }
    : null;
}

export function formatFormulaReferenceRange(
  range: CellRange,
  sheetName?: string,
  rangeKind?: Exclude<FormulaReferenceRangeKind, "spill">,
): string {
  const kind = rangeKind ?? inferReferenceRangeKind(range);
  if (kind === "column-axis") {
    const start = columnLabel(Math.min(range.start.column, range.end.column));
    const end = columnLabel(Math.max(range.start.column, range.end.column));
    return `${sheetName ? `${quoteFormulaSheetName(sheetName)}!` : ""}${start}:${end}`;
  }
  if (kind === "row-axis") {
    const start = Math.min(range.start.row, range.end.row) + 1;
    const end = Math.max(range.start.row, range.end.row) + 1;
    return `${sheetName ? `${quoteFormulaSheetName(sheetName)}!` : ""}${start}:${end}`;
  }
  const start = formatCellAddress({
    row: Math.min(range.start.row, range.end.row),
    column: Math.min(range.start.column, range.end.column),
  });
  const end = formatCellAddress({
    row: Math.max(range.start.row, range.end.row),
    column: Math.max(range.start.column, range.end.column),
  });
  const reference = start === end ? start : `${start}:${end}`;
  return sheetName ? `${quoteFormulaSheetName(sheetName)}!${reference}` : reference;
}

export function quoteFormulaSheetName(sheetName: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheetName)
    ? sheetName
    : `'${sheetName.replaceAll("'", "''")}'`;
}

export function replaceFormulaReference(
  value: string,
  context: FormulaReferenceEditContext,
  range: CellRange,
  sheetName?: string,
  rangeKind?: Exclude<FormulaReferenceRangeKind, "spill">,
): { value: string; caret: number; context: FormulaReferenceEditContext } {
  const insertion = formatFormulaReferenceRange(range, sheetName, rangeKind);
  const edit = replaceRange(value, context.replaceStart, context.replaceEnd, insertion);
  return {
    ...edit,
    context: {
      replaceStart: context.replaceStart,
      replaceEnd: context.replaceStart + insertion.length,
    },
  };
}

export function cycleFormulaReferenceAbsoluteMarkers(
  value: string,
  context: FormulaReferenceEditContext,
): {
  value: string;
  caret: number;
  context: FormulaReferenceEditContext;
} | null {
  const text = value.slice(context.replaceStart, context.replaceEnd);
  const token = getFormulaReferenceTokens(`=${text}`)[0];
  if (!token || token.text.length !== text.length) return null;
  const qualifierEnd = text.lastIndexOf("!") + 1;
  const suffix = token.rangeKind === "spill" ? "#" : "";
  const body = text.slice(qualifierEnd, suffix ? -1 : undefined);
  const insertion =
    text.slice(0, qualifierEnd) + cycleReferenceBody(body, token.rangeKind ?? "cells") + suffix;
  const edit = replaceRange(value, context.replaceStart, context.replaceEnd, insertion);
  return {
    ...edit,
    context: {
      replaceStart: context.replaceStart,
      replaceEnd: context.replaceStart + insertion.length,
    },
  };
}

function cycleReferenceBody(reference: string, rangeKind: FormulaReferenceRangeKind): string {
  if (rangeKind === "column-axis")
    return reference
      .split(":")
      .map((part) => cycleAxisReference(part.trim(), /^[A-Za-z]+$/))
      .join(":");
  if (rangeKind === "row-axis")
    return reference
      .split(":")
      .map((part) => cycleAxisReference(part.trim(), /^\d+$/))
      .join(":");
  return reference
    .split(":")
    .map((part) => cycleSingleReference(part.trim()))
    .join(":");
}

function cycleAxisReference(reference: string, valid: RegExp): string {
  const marker = reference.startsWith("$") ? "$" : "";
  const value = marker ? reference.slice(1) : reference;
  return valid.test(value) ? `${marker ? "" : "$"}${value}` : reference;
}

function cycleSingleReference(reference: string): string {
  const match = /^(\$?)([A-Za-z]+)(\$?)([1-9]\d*)$/.exec(reference);
  if (!match) return reference;
  const [, columnMarker, column, rowMarker, row] = match;
  if (!column || !row) return reference;
  if (columnMarker !== "$" && rowMarker !== "$") return `$${column}$${row}`;
  if (columnMarker === "$" && rowMarker === "$") return `${column}$${row}`;
  if (columnMarker !== "$" && rowMarker === "$") return `$${column}${row}`;
  return `${column}${row}`;
}

function inferReferenceRangeKind(range: CellRange): Exclude<FormulaReferenceRangeKind, "spill"> {
  const rows =
    Math.min(range.start.row, range.end.row) === 0 &&
    Math.max(range.start.row, range.end.row) === MAX_SHEET_ROWS - 1;
  const columns =
    Math.min(range.start.column, range.end.column) === 0 &&
    Math.max(range.start.column, range.end.column) === MAX_SHEET_COLUMNS - 1;
  if (rows && !columns) return "column-axis";
  if (columns && !rows) return "row-axis";
  return "cells";
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

export function getFormulaArgumentContext(
  value: string,
  limit: number,
): FormulaCompletionContext["argument"] {
  const calls: Array<{ functionName: string; index: number }> = [];
  let quote: '"' | "'" | null = null;
  for (let index = 1; index < limit; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index + 1] === quote) index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") {
      const before = value.slice(0, index).replace(/\s+$/, "");
      const name = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(before)?.[1];
      calls.push({ functionName: name?.toUpperCase() ?? "", index: 0 });
    } else if (character === ")") {
      calls.pop();
    } else if (character === "," && calls.length > 0) {
      const call = calls.at(-1);
      if (call) call.index += 1;
    }
  }
  const call = calls.at(-1);
  return call?.functionName ? { functionName: call.functionName, index: call.index } : null;
}

function identifierRangeAt(value: string, caret: number): Range | null {
  let start = caret;
  let end = caret;
  while (start > 0 && IDENTIFIER_PART.test(value[start - 1] ?? "")) start -= 1;
  while (end < value.length && IDENTIFIER_PART.test(value[end] ?? "")) end += 1;
  return start === end ? null : { start, end };
}

function referenceRangeAt(value: string, selection: Range): Range | null {
  const token = getFormulaReferenceTokens(value).find(
    (reference) => selection.start >= reference.start && selection.end <= reference.end,
  );
  return token ? { start: token.start, end: token.end } : null;
}

function isFunctionPosition(value: string, start: number): boolean {
  const previous = previousNonWhitespace(value, start);
  return (
    previous === "=" ||
    previous === "(" ||
    previous === "," ||
    previous === "+" ||
    previous === "-" ||
    previous === "*" ||
    previous === "/" ||
    previous === "^" ||
    previous === "<" ||
    previous === ">" ||
    previous === "=" ||
    previous === "&"
  );
}

function previousNonWhitespace(value: string, offset: number): string | null {
  for (let index = offset - 1; index >= 0; index -= 1) {
    const character = value[index] ?? "";
    if (!/\s/.test(character)) return character;
  }
  return null;
}

function isInsideQuotedText(value: string, limit: number): boolean {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < limit; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index + 1] === quote) index += 1;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    }
  }
  return quote !== null;
}

function isFormula(value: string): boolean {
  return value.startsWith("=");
}

function normalizeSelection(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): Range {
  const start = Math.max(0, Math.min(selectionStart ?? value.length, value.length));
  const end = Math.max(start, Math.min(selectionEnd ?? start, value.length));
  return { start, end };
}

function replaceRange(value: string, start: number, end: number, insertion: string) {
  return {
    value: `${value.slice(0, start)}${insertion}${value.slice(end)}`,
    caret: start + insertion.length,
  };
}
