import type { SplitTextOptions, SplitTextType } from "./contracts.js";
import { datePartsToExcelSerial, type ExcelDateSystem } from "../formula/date-system.js";
import type { SplitDateOrder } from "./contracts.js";

export type SplitColumnSuggestion = {
  id: string;
  options: SplitTextOptions;
  confidence: number;
  columnCount: number;
};

export type SplitColumnFieldType = "general" | "text" | "date" | "skip";
export type SplitColumnFieldConversion = {
  value: string | number;
  numberFormat?: { kind: "date"; code: string } | { kind: "text" };
};

type DelimiterOptions = Pick<SplitTextOptions, "textQualifier" | "mergeDelimiters" | "parseQuoted">;

function qualifierFor(options: DelimiterOptions): '"' | "'" | undefined {
  if (options.textQualifier === "none") return undefined;
  if (options.textQualifier === '"' || options.textQualifier === "'") return options.textQualifier;
  if (options.parseQuoted === false) return undefined;
  return options.textQualifier === "'" ? "'" : '"';
}

function delimiterTokens(options: SplitTextOptions): string[] {
  const raw =
    options.delimiters !== undefined ? options.delimiters : Array.from(options.delimiter ?? ",");
  const tokens = [...new Set(raw.filter((token) => token.length > 0))].sort(
    (left, right) => right.length - left.length || left.localeCompare(right),
  );
  if (!tokens.length) throw new RangeError("A delimiter is required.");
  return tokens;
}

function delimiterAt(text: string, index: number, tokens: readonly string[]): string | undefined {
  for (const token of tokens) {
    // A newline delimiter represents an input line ending, including Windows CRLF.
    if (token === "\n" && text.startsWith("\r\n", index)) return "\r\n";
    if (text.startsWith(token, index)) return token;
  }
  return undefined;
}

/** Parses quoted fields and both legacy character delimiters and atomic tokens. */
export function splitDelimitedText(
  text: string,
  delimiter: string,
  options: boolean | DelimiterOptions = true,
): string[] {
  return splitText(text, {
    mode: "delimiter",
    delimiter,
    ...(typeof options === "boolean"
      ? { parseQuoted: options }
      : { textQualifier: options.textQualifier, mergeDelimiters: options.mergeDelimiters }),
  });
}

export function splitFixedWidthText(text: string, widths: readonly number[]): string[] {
  if (!widths.length || widths.some((width) => !Number.isInteger(width) || width <= 0))
    throw new RangeError("Fixed widths must be positive integers.");
  const points = Array.from(text);
  const fields: string[] = [];
  let offset = 0;
  for (const width of widths) {
    fields.push(points.slice(offset, offset + width).join(""));
    offset += width;
  }
  fields.push(points.slice(offset).join(""));
  return fields;
}

function splitByDelimiter(text: string, options: SplitTextOptions): string[] {
  const tokens = delimiterTokens(options);
  const qualifier = qualifierFor(options);
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length;) {
    const char = text[index]!;
    if (qualifier && char === qualifier && (inQuotes || field.length === 0)) {
      if (inQuotes && text[index + 1] === qualifier) {
        field += qualifier;
        index += 2;
      } else {
        inQuotes = !inQuotes;
        index += 1;
      }
      continue;
    }
    const token = !inQuotes ? delimiterAt(text, index, tokens) : undefined;
    if (!token) {
      field += char;
      index += 1;
      continue;
    }
    fields.push(field);
    field = "";
    index += token.length;
    if (options.mergeDelimiters)
      while (index < text.length) {
        const adjacent = delimiterAt(text, index, tokens);
        if (!adjacent) break;
        index += adjacent.length;
      }
  }
  fields.push(field);
  return fields;
}

function characterType(char: string): SplitTextType | undefined {
  if (/^[\p{Script=Han}]$/u.test(char)) return "chinese";
  if (/^[A-Za-z]$/u.test(char)) return "english";
  if (/^[0-9]$/u.test(char)) return "number";
  return undefined;
}

function splitByTextType(text: string, requested: readonly SplitTextType[]): string[] {
  const selected = new Set(requested);
  if (!selected.size) throw new RangeError("At least one text type is required.");
  const fields: string[] = [];
  let field = "";
  let prior: SplitTextType | undefined;
  for (const char of Array.from(text)) {
    const current = characterType(char);
    // End a selected run when a differently typed character follows it. This
    // preserves punctuation and unselected text instead of dropping it.
    if (field && prior && selected.has(prior) && current !== prior) {
      fields.push(field);
      field = "";
    }
    field += char;
    prior = current;
  }
  if (field) fields.push(field);
  return fields.length ? fields : [""];
}

type KeywordMatch = { start: number; end: number };

function keywordMatches(text: string, keywords: readonly string[]): KeywordMatch[] {
  const tokens = [...new Set(keywords)].sort(
    (left, right) => right.length - left.length || left.localeCompare(right),
  );
  if (!tokens.length || tokens.some((keyword) => keyword.length === 0))
    throw new RangeError("At least one non-empty keyword is required.");
  const matches: KeywordMatch[] = [];
  for (let index = 0; index < text.length;) {
    const token = tokens.find((candidate) => text.startsWith(candidate, index));
    if (!token) {
      index += 1;
      continue;
    }
    matches.push({ start: index, end: index + token.length });
    index += token.length;
  }
  return matches;
}

function splitByKeyword(text: string, options: SplitTextOptions): string[] {
  const matches = keywordMatches(text, options.keywords ?? []);
  if (!matches.length) return [text];
  const position = options.keywordPosition ?? "after";
  const keep = options.keepKeywords ?? true;
  const fields: string[] = [];
  let cursor = 0;
  for (const match of matches) {
    const boundary = position === "before" ? match.start : match.end;
    if (keep) {
      if (boundary > cursor) fields.push(text.slice(cursor, boundary));
      cursor = boundary;
    } else {
      if (match.start > cursor) fields.push(text.slice(cursor, match.start));
      cursor = match.end;
    }
  }
  if (cursor < text.length) fields.push(text.slice(cursor));
  return fields.length ? fields : [""];
}

/** Shared parser for previews and workbook commands. */
export function splitText(text: string, options: SplitTextOptions): string[] {
  switch (options.mode) {
    case "delimiter":
      return splitByDelimiter(text, options);
    case "fixedWidth":
      return splitFixedWidthText(text, options.fixedWidths ?? []);
    case "textType":
      return splitByTextType(text, options.textTypes ?? []);
    case "keyword":
      return splitByKeyword(text, options);
  }
}

function parseDateParts(
  raw: string,
  order: SplitDateOrder,
): { year: number; month: number; day: number } | undefined {
  const trimmed = raw.trim();
  const chinese = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/u);
  const compact = trimmed.match(/^\d{8}$/u);
  const separated = trimmed.match(/^(\d{1,4})[-/.](\d{1,4})[-/.](\d{1,4})$/u);
  const values = chinese
    ? [chinese[1]!, chinese[2]!, chinese[3]!]
    : compact
      ? (() => {
          let cursor = 0;
          return order.split("").map((part) => {
            const width = part === "Y" ? 4 : 2;
            const value = trimmed.slice(cursor, cursor + width);
            cursor += width;
            return value;
          });
        })()
      : separated
        ? [separated[1]!, separated[2]!, separated[3]!]
        : undefined;
  if (!values) return undefined;
  // Chinese dates are always written in YMD order; compact dates honour the
  // selected order (one four-digit year component and two two-digit components).
  const effectiveOrder = chinese ? "YMD" : order;
  const parts: Record<"Y" | "M" | "D", number> = { Y: 0, M: 0, D: 0 };
  for (let index = 0; index < 3; index += 1)
    parts[effectiveOrder[index] as "Y" | "M" | "D"] = Number(values[index]);
  return { year: parts.Y, month: parts.M, day: parts.D };
}

function safeGeneralNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(trimmed))
    return undefined;
  // Do not silently turn an identifier into a rounded IEEE-754 number.
  const integerDigits = trimmed.replace(/^[+-]/u, "").split(/[.eE]/u)[0] ?? "";
  if (integerDigits.length > 15 && !/[.eE]/u.test(trimmed)) return undefined;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Converts a parsed field exactly as SplitColumnCommand writes it. This is
 * intentionally pure so result previews can display the same values.
 */
export function convertSplitColumnField(
  raw: string,
  type: SplitColumnFieldType,
  dateOrder: SplitDateOrder | undefined,
  dateSystem: ExcelDateSystem,
): SplitColumnFieldConversion {
  if (type === "date") {
    const parts = parseDateParts(raw, dateOrder ?? "YMD");
    if (parts) {
      try {
        return {
          value: datePartsToExcelSerial(
            { ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 },
            dateSystem,
          ),
          numberFormat: { kind: "date", code: "yyyy-mm-dd" },
        };
      } catch {
        // An invalid date remains text, matching spreadsheet import behavior.
      }
    }
    return { value: raw, numberFormat: { kind: "text" } };
  }
  if (type === "general") return { value: safeGeneralNumber(raw) ?? raw };
  return { value: raw, numberFormat: { kind: "text" } };
}

const COMMON_DELIMITERS = [",", "，", ";", "；", "\t", "|", "/", "\n", " "] as const;

function fieldCount(text: string, options: SplitTextOptions): number {
  try {
    return splitText(text, options).length;
  } catch {
    return 1;
  }
}

/**
 * Produces stable, data-wide suggestions. A candidate must split a majority
 * of non-empty samples, so an unusual single row cannot choose the rule.
 */
export function suggestSplitColumnOptions(texts: readonly string[]): SplitColumnSuggestion[] {
  const samples = texts.filter((text) => text.length > 0);
  if (!samples.length) return [];
  const scalarOnly = samples.every(
    (text) =>
      /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(text.trim()) ||
      /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(text.trim()) ||
      /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/u.test(text.trim()) ||
      /^\d{4}年\d{1,2}月\d{1,2}日?$/u.test(text.trim()),
  );
  // A column that is entirely scalar-looking is never inferred as a split,
  // including date separators and thousands separators.
  if (scalarOnly) return [];
  const suggestions: SplitColumnSuggestion[] = [];
  for (const token of COMMON_DELIMITERS) {
    const options: SplitTextOptions = { mode: "delimiter", delimiters: [token] };
    const counts = samples.map((text) => fieldCount(text, options));
    const splitRows = counts.filter((count) => count > 1).length;
    if (splitRows * 2 <= samples.length) continue;
    suggestions.push({
      id: `delimiter:${JSON.stringify(token)}`,
      options,
      confidence: Math.round((splitRows / samples.length) * 100) / 100,
      columnCount: Math.max(...counts),
    });
  }
  const discovered = new Set<SplitTextType>();
  for (const text of samples)
    for (const char of Array.from(text)) {
      const type = characterType(char);
      if (type) discovered.add(type);
    }
  if (discovered.size >= 2) {
    const options: SplitTextOptions = { mode: "textType", textTypes: [...discovered].sort() };
    const counts = samples.map((text) => fieldCount(text, options));
    const splitRows = counts.filter((count) => count > 1).length;
    if (splitRows * 2 > samples.length)
      suggestions.push({
        id: `textType:${options.textTypes!.join(",")}`,
        options,
        confidence: Math.round((splitRows / samples.length) * 100) / 100,
        columnCount: Math.max(...counts),
      });
  }
  return suggestions.sort((left, right) => right.confidence - left.confidence).slice(0, 5);
}
