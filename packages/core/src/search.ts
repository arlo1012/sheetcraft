import {
  isCellTextBoundary,
  replaceCellTextRange,
  type CellTextDocument,
} from "./text-font-runs.js";
import { formatCellContentForInput, formatComputedValueForDisplay } from "./input.js";
import type { CellContent } from "./formula/types.js";
import type { CellStyle } from "./style.js";
import {
  createSheetEvaluator,
  type CellAddress,
  type Sheet,
  type SheetEvaluator,
} from "./workbook.js";

export type SheetSearchDirection = "forward" | "backward";

export type SheetSearchFormat = {
  style: CellStyle;
  keys: readonly (keyof CellStyle)[];
};

export type SheetSearchOptions = {
  order?: "rows" | "columns";
  lookIn?: "smart" | "formulas" | "values";
  matchCase?: boolean;
  matchEntireCell?: boolean;
  matchWidth?: boolean;
  format?: SheetSearchFormat;
};

type GlobToken = { kind: "literal"; value: string } | { kind: "any" } | { kind: "star" };

export type SheetTextReplacement = {
  address: CellAddress;
  /** The replacement-ready cell input, preserving a formula's leading `=`. */
  input: string;
  /** Exact replacement for rich text; callers must prefer this over reparsing input. */
  content?: CellContent;
};

function parseCellKey(key: string): CellAddress | null {
  const separator = key.indexOf(":");
  if (separator < 1 || separator === key.length - 1) return null;

  const row = Number(key.slice(0, separator));
  const column = Number(key.slice(separator + 1));
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
}

function compareAddresses(
  left: CellAddress,
  right: CellAddress,
  order: "rows" | "columns" = "rows",
): number {
  return order === "rows"
    ? left.row - right.row || left.column - right.column
    : left.column - right.column || left.row - right.row;
}

function normalizeSearchText(value: string, options: SheetSearchOptions): string {
  let normalized = options.matchWidth
    ? value
    : value.replace(/[\u3000\uff01-\uff5e]/g, (character) =>
        character === "\u3000" ? " " : String.fromCharCode(character.charCodeAt(0) - 0xfee0),
      );
  if (!options.matchCase) normalized = normalized.toLowerCase();
  return normalized;
}

type NormalizedSearchText = {
  value: string;
  /** Raw offsets for a normalized match's start and exclusive end boundaries. */
  startOffsets: readonly number[];
  endOffsets: readonly number[];
};

function normalizeSearchTextWithOffsets(
  value: string,
  options: SheetSearchOptions,
): NormalizedSearchText {
  const normalized = normalizeSearchText(value, options);
  const startOffsets = Array<number>(normalized.length + 1).fill(value.length);
  const endOffsets = Array<number>(normalized.length + 1).fill(value.length);
  let normalizedOffset = 0;
  for (let rawOffset = 0; rawOffset < value.length; rawOffset += 1) {
    // Normalize each UTF-16 unit only to learn its output width. The whole
    // string above remains the match source, preserving current contextual
    // lowercasing semantics.
    const width = normalizeSearchText(value[rawOffset]!, options).length;
    const normalizedEnd = Math.min(normalizedOffset + width, normalized.length);
    for (let index = normalizedOffset; index < normalizedEnd; index += 1) {
      startOffsets[index] = rawOffset;
      endOffsets[index + 1] = rawOffset + 1;
    }
    normalizedOffset = normalizedEnd;
  }
  startOffsets[normalized.length] = value.length;
  endOffsets[0] = 0;
  return { value: normalized, startOffsets, endOffsets };
}

function parseGlob(query: string): GlobToken[] {
  const tokens: GlobToken[] = [];
  for (let index = 0; index < query.length; index += 1) {
    const character = query[index]!;
    if (
      character === "~" &&
      (query[index + 1] === "*" || query[index + 1] === "?" || query[index + 1] === "~")
    ) {
      tokens.push({ kind: "literal", value: query[index + 1]! });
      index += 1;
    } else if (character === "*") {
      if (tokens.at(-1)?.kind !== "star") tokens.push({ kind: "star" });
    } else if (character === "?") {
      tokens.push({ kind: "any" });
    } else {
      tokens.push({ kind: "literal", value: character });
    }
  }
  return tokens;
}

/**
 * Matches a glob with iterative star backtracking, avoiding regular-expression
 * expansion for user-supplied patterns. `*` and `?` also match line breaks.
 */
function matchesGlob(value: string, query: string, entireCell: boolean): boolean {
  const tokens = parseGlob(query);
  if (!entireCell) tokens.unshift({ kind: "star" });
  if (!entireCell) tokens.push({ kind: "star" });

  let valueIndex = 0;
  let tokenIndex = 0;
  let starIndex = -1;
  let starValueIndex = 0;
  while (valueIndex < value.length) {
    const token = tokens[tokenIndex];
    if (token?.kind === "any" || (token?.kind === "literal" && token.value === value[valueIndex])) {
      valueIndex += 1;
      tokenIndex += 1;
    } else if (token?.kind === "star") {
      starIndex = tokenIndex;
      starValueIndex = valueIndex;
      tokenIndex += 1;
    } else if (starIndex >= 0) {
      tokenIndex = starIndex + 1;
      starValueIndex += 1;
      valueIndex = starValueIndex;
    } else {
      return false;
    }
  }

  while (tokens[tokenIndex]?.kind === "star") tokenIndex += 1;
  return tokenIndex === tokens.length;
}

/**
 * Returns the end of the longest glob match beginning at `start`. It uses a
 * small iterative NFA so repeated stars cannot cause recursive backtracking.
 */
function matchGlobAt(value: string, tokens: readonly GlobToken[], start: number): number | null {
  function expandStarEpsilon(states: Set<number>): void {
    for (let index = 0; index < tokens.length; index += 1) {
      if (states.has(index) && tokens[index]?.kind === "star") states.add(index + 1);
    }
  }

  let states = new Set([0]);
  expandStarEpsilon(states);
  let longestEnd = states.has(tokens.length) ? start : null;
  for (let valueIndex = start; valueIndex < value.length; valueIndex += 1) {
    const nextStates = new Set<number>();
    for (const tokenIndex of states) {
      const token = tokens[tokenIndex];
      if (token?.kind === "star") nextStates.add(tokenIndex);
      else if (token?.kind === "any") nextStates.add(tokenIndex + 1);
      else if (token?.kind === "literal" && value.startsWith(token.value, valueIndex)) {
        nextStates.add(tokenIndex + 1);
      }
    }
    expandStarEpsilon(nextStates);
    states = nextStates;
    if (states.has(tokens.length)) longestEnd = valueIndex + 1;
    if (states.size === 0) break;
  }
  return longestEnd;
}

function findGlobMatchRanges(
  value: string,
  query: string,
  options: SheetSearchOptions,
): Array<readonly [start: number, end: number]> {
  if (query === "") return [];
  const normalized = normalizeSearchTextWithOffsets(value, options);
  const normalizedValue = normalized.value;
  const normalizedQuery = normalizeSearchText(query, options);
  const tokens = parseGlob(normalizedQuery);
  const isLiteral = tokens.every((token) => token.kind === "literal");
  const literalQuery = isLiteral
    ? tokens.map((token) => (token as Extract<GlobToken, { kind: "literal" }>).value).join("")
    : "";
  const toRawRange = (start: number, end: number): readonly [number, number] => [
    normalized.startOffsets[start]!,
    normalized.endOffsets[end]!,
  ];
  if (options.matchEntireCell) {
    const matches = isLiteral
      ? normalizedValue === literalQuery
      : matchGlobAt(normalizedValue, tokens, 0) === normalizedValue.length;
    return matches ? [toRawRange(0, normalizedValue.length)] : [];
  }

  const ranges: Array<readonly [start: number, end: number]> = [];
  if (isLiteral) {
    for (let start = normalizedValue.indexOf(literalQuery); start >= 0;) {
      const end = start + literalQuery.length;
      ranges.push(toRawRange(start, end));
      start = normalizedValue.indexOf(literalQuery, end);
    }
    return ranges;
  }
  let lastRawEnd = 0;
  for (let start = 0; start < normalizedValue.length;) {
    const end = matchGlobAt(normalizedValue, tokens, start);
    if (end === null || end === start) {
      start += 1;
      continue;
    }
    const rawRange = toRawRange(start, end);
    if (rawRange[0] >= lastRawEnd) {
      ranges.push(rawRange);
      lastRawEnd = rawRange[1];
    }
    start = end;
  }
  return ranges;
}

function replaceGlobMatches(
  value: string,
  query: string,
  replacement: string,
  options: SheetSearchOptions,
): string | null {
  const ranges = findGlobMatchRanges(value, query, options);
  if (!ranges.length) return null;
  let input = "";
  let lastEnd = 0;
  for (const [start, end] of ranges) {
    input += value.slice(lastEnd, start) + replacement;
    lastEnd = end;
  }
  return input + value.slice(lastEnd);
}

function areSearchStyleValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => areSearchStyleValuesEqual(value, right[index]))
    );
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        areSearchStyleValuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function matchesFormat(
  cellStyle: CellStyle | undefined,
  format: SheetSearchFormat | undefined,
): boolean {
  return (
    !format ||
    format.keys.every((key) => areSearchStyleValuesEqual(cellStyle?.[key], format.style[key]))
  );
}

function matchesText(
  rawInput: string,
  displayValue: string,
  query: string,
  options: SheetSearchOptions,
): boolean {
  if (query === "") return true;
  const normalizedQuery = normalizeSearchText(query, options);
  const matches = (value: string) =>
    matchesGlob(normalizeSearchText(value, options), normalizedQuery, !!options.matchEntireCell);
  switch (options.lookIn ?? "smart") {
    case "formulas":
      return matches(rawInput);
    case "values":
      return matches(displayValue);
    default:
      return matches(rawInput) || matches(displayValue);
  }
}

/**
 * Text literals are already their editable input. Formatting them for input
 * would add a protective apostrophe before values such as `=total` or `0123`,
 * which must remain invisible to find/replace callers.
 */
function getSearchableInput(content: CellContent | null | undefined): string {
  return content?.kind === "literal" && typeof content.value === "string"
    ? content.value
    : formatCellContentForInput(content);
}

/** Returns sparse matching cells, ordered by rows (default) or columns. */
export function findCellsByText(
  sheet: Sheet,
  query: string,
  evaluator: SheetEvaluator = createSheetEvaluator(sheet),
  options: SheetSearchOptions = {},
): CellAddress[] {
  if (query === "" && !options.format) return [];

  const matches: CellAddress[] = [];
  for (const [key, cell] of sheet.cells) {
    const address = parseCellKey(key);
    if (!address || !matchesFormat(cell.style, options.format)) continue;
    if (
      matchesText(
        getSearchableInput(cell.content),
        formatComputedValueForDisplay(evaluator.getComputedValue(address)),
        query,
        options,
      )
    ) {
      matches.push(address);
    }
  }
  return matches.sort((left, right) => compareAddresses(left, right, options.order));
}

/**
 * Plans sparse text replacements without mutating the sheet. Only original
 * cell input and formula source can be changed: a match found solely in a
 * formula's computed result is intentionally excluded.
 */
export function buildSheetTextReplacements(
  sheet: Sheet,
  query: string,
  replacement: string,
  evaluator?: SheetEvaluator,
  options: SheetSearchOptions = {},
): SheetTextReplacement[] {
  if (query === "") return [];
  // Kept in the public contract alongside the find APIs. Replacement never
  // writes a computed value, so it must not need to evaluate formulas.
  void evaluator;

  const replacements: SheetTextReplacement[] = [];
  for (const [key, cell] of sheet.cells) {
    const address = parseCellKey(key);
    const content = cell.content;
    if (
      !address ||
      !content ||
      !matchesFormat(cell.style, options.format) ||
      content.kind === "image"
    ) {
      continue;
    }
    const input = getSearchableInput(content);
    const replaced = replaceGlobMatches(input, query, replacement, options);
    if (replaced === null || replaced === input) continue;

    // `values` checks computed formula values in normal find. Those values are
    // read-only here, because replacing one would incorrectly turn the formula
    // into a literal.
    if (content.kind === "formula" && options.lookIn === "values") {
      continue;
    }
    let replacementContent: CellContent | undefined;
    if (
      content.kind === "literal" &&
      typeof content.value === "string" &&
      content.fontRuns?.length
    ) {
      let document: CellTextDocument = { text: content.value, fontRuns: content.fontRuns };
      const ranges = findGlobMatchRanges(input, query, options);
      // Do not split a supplementary character through a one-code-unit wildcard.
      if (
        ranges.some(
          ([start, end]) => !isCellTextBoundary(input, start) || !isCellTextBoundary(input, end),
        )
      )
        continue;
      for (const [start, end] of [...ranges].reverse())
        document = replaceCellTextRange(document, start, end, replacement);
      replacementContent = {
        kind: "literal",
        value: document.text,
        ...(document.fontRuns ? { fontRuns: document.fontRuns } : {}),
      };
    }
    replacements.push({
      address,
      input: replaced,
      ...(replacementContent ? { content: replacementContent } : {}),
    });
  }
  return replacements.sort((left, right) =>
    compareAddresses(left.address, right.address, options.order),
  );
}

/** Returns editable raw-input matches, excluding formula computed values. */
export function findSheetTextReplacementAddresses(
  sheet: Sheet,
  query: string,
  evaluator?: SheetEvaluator,
  options: SheetSearchOptions = {},
): CellAddress[] {
  if (query === "") return [];
  void evaluator;
  const matches: CellAddress[] = [];
  for (const [key, cell] of sheet.cells) {
    const address = parseCellKey(key);
    const content = cell.content;
    if (
      !address ||
      !content ||
      content.kind === "image" ||
      !matchesFormat(cell.style, options.format)
    ) {
      continue;
    }
    if (content.kind === "formula" && options.lookIn === "values") continue;
    if (findGlobMatchRanges(getSearchableInput(content), query, options).length)
      matches.push(address);
  }
  return matches.sort((left, right) => compareAddresses(left, right, options.order));
}

export function findCellByText(
  sheet: Sheet,
  query: string,
  from: CellAddress,
  direction: SheetSearchDirection = "forward",
  evaluator: SheetEvaluator = createSheetEvaluator(sheet),
  options: SheetSearchOptions = {},
): CellAddress | null {
  const matches = findCellsByText(sheet, query, evaluator, options);
  if (matches.length === 0) return null;

  const order = options.order;
  if (direction === "forward") {
    return matches.find((address) => compareAddresses(address, from, order) > 0) ?? matches[0]!;
  }
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const address = matches[index]!;
    if (compareAddresses(address, from, order) < 0) return address;
  }
  return matches.at(-1)!;
}
