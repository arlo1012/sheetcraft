import type { CellRange } from "@idea10/core/workbook";
import { formatCellAddress } from "@idea10/core/coordinates";
import { getFormulaFunctionMetadata, type FormulaFunctionMetadata } from "@idea10/core/formula";

export type FormulaFunctionCandidate = FormulaFunctionMetadata & Readonly<{ id: string }>;

const SUPPORTED_FORMULA_FUNCTIONS: readonly FormulaFunctionCandidate[] =
  getFormulaFunctionMetadata().map((metadata) => ({ ...metadata, id: metadata.name }));

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
const REFERENCE = /^\$?[A-Za-z]+\$?[1-9]\d*(?::\$?[A-Za-z]+\$?[1-9]\d*)?$/;

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
  if (isInsideQuotedText(value, selection.start)) return null;
  const token = referenceRangeAt(value, selection);
  if (token) return { replaceStart: token.start, replaceEnd: token.end };
  if (selection.start !== selection.end) return null;
  const previous = previousNonWhitespace(value, selection.start);
  return previous === "=" ||
    previous === "(" ||
    previous === "," ||
    previous === "+" ||
    previous === "-" ||
    previous === "*" ||
    previous === "/" ||
    previous === "<" ||
    previous === ">" ||
    previous === "=" ||
    previous === "&"
    ? { replaceStart: selection.start, replaceEnd: selection.end }
    : null;
}

export function formatFormulaReferenceRange(range: CellRange): string {
  const start = formatCellAddress({
    row: Math.min(range.start.row, range.end.row),
    column: Math.min(range.start.column, range.end.column),
  });
  const end = formatCellAddress({
    row: Math.max(range.start.row, range.end.row),
    column: Math.max(range.start.column, range.end.column),
  });
  return start === end ? start : `${start}:${end}`;
}

export function replaceFormulaReference(
  value: string,
  context: FormulaReferenceEditContext,
  range: CellRange,
): { value: string; caret: number; context: FormulaReferenceEditContext } {
  const insertion = formatFormulaReferenceRange(range);
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
): { value: string; caret: number; context: FormulaReferenceEditContext } | null {
  const text = value.slice(context.replaceStart, context.replaceEnd);
  if (!REFERENCE.test(text)) return null;
  const insertion = text.split(":").map(cycleSingleReference).join(":");
  const edit = replaceRange(value, context.replaceStart, context.replaceEnd, insertion);
  return {
    ...edit,
    context: {
      replaceStart: context.replaceStart,
      replaceEnd: context.replaceStart + insertion.length,
    },
  };
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

export function getFormulaArgumentContext(
  value: string,
  limit: number,
): FormulaCompletionContext["argument"] {
  const calls: Array<{ functionName: string; index: number }> = [];
  let quoted = false;
  for (let index = 1; index < limit; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (quoted) continue;
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
  let start = selection.start;
  let end = selection.end;
  while (start > 0 && /[A-Za-z0-9$:]/.test(value[start - 1] ?? "")) start -= 1;
  while (end < value.length && /[A-Za-z0-9$:]/.test(value[end] ?? "")) end += 1;
  const text = value.slice(start, end);
  if (!REFERENCE.test(text)) return null;
  return selection.start >= start && selection.end <= end ? { start, end } : null;
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
  let quoted = false;
  for (let index = 0; index < limit; index += 1) {
    if (value[index] !== '"') continue;
    if (quoted && value[index + 1] === '"') {
      index += 1;
    } else {
      quoted = !quoted;
    }
  }
  return quoted;
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
