import { formatCellContentForInput, formatComputedValueForDisplay } from "./input.js";
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
        formatCellContentForInput(cell.content),
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
