import {
  getNumberFormatLocale,
  getNumberFormatLocaleCurrency,
  toCellNumberFormatCode,
  validateCellNumberFormatCode,
} from "@idea10/core/number-format";
import type { CellNumberFormat, CellNumberFormatNegativeStyle } from "@idea10/core/style";

export function toExcelNumberFormat(format: CellNumberFormat): string {
  return toCellNumberFormatCode(format);
}

/** `null` represents Excel's no-op General format; `undefined` is malformed or unsupported. */
export function fromExcelNumberFormat(value: unknown): CellNumberFormat | null | undefined {
  if (typeof value !== "string") return undefined;
  const code = value.trim();
  if (code.toLowerCase() === "general") return null;
  if (!validateCellNumberFormatCode(code)) return undefined;

  // Preserve the old canonical import shapes. Existing snapshots and consumers
  // expect these objects to omit optional presentation fields.
  const canonical = /^(?:\[\$([A-Z]{3})\])?(#,##0|0)(?:\.(0{1,20}))?(%)?$/i.exec(code);
  if (canonical) {
    const fractionDigits = (canonical[3] ?? "").length;
    const grouping = canonical[2] === "0" ? { useGrouping: false } : {};
    if (canonical[1] && canonical[4]) return createCodeFormat("custom", code);
    if (canonical[1]) {
      // The Core currency contract always groups. Keep a no-grouping currency
      // code lossless until that semantic option is exposed for currencies.
      if (canonical[2] === "0") return { kind: "custom", code };
      const format: CellNumberFormat = {
        kind: "currency",
        currency: canonical[1].toUpperCase(),
        fractionDigits,
      };
      return canRoundTripSemantically(format, code) ? format : createCodeFormat("custom", code);
    }
    const format: CellNumberFormat = canonical[4]
      ? { kind: "percent", fractionDigits, ...grouping }
      : { kind: "number", fractionDigits, ...grouping };
    return canRoundTripSemantically(format, code) ? format : createCodeFormat("custom", code);
  }
  if (code === "@") return { kind: "text" };

  const accounting = parseAccounting(code);
  if (accounting && canRoundTripSemantically(accounting, code)) return accounting;
  const styledDecimal = parseStyledDecimal(code);
  if (styledDecimal && canRoundTripSemantically(styledDecimal, code)) return styledDecimal;
  const scientific = /^0(?:\.(0{1,20}))?E[+-]0+$/i.exec(code);
  if (scientific) {
    const format: CellNumberFormat = {
      kind: "scientific",
      fractionDigits: (scientific[1] ?? "").length,
    };
    if (canRoundTripSemantically(format, code)) return format;
  }
  if (isFractionCode(code)) return createCodeFormat("fraction", code);
  if (isDateOrTimeCode(code)) return createCodeFormat(dateOrTimeKind(code), code);
  if (/\[DBNum[12]\]/i.test(code) || /^0{5,6}$/.test(code))
    return createCodeFormat("special", code);

  // Valid but not confidently semantic codes must remain lossless. This also
  // covers conditions, colors, locale tokens, and vendor extensions.
  return createCodeFormat("custom", code);
}

type CodeFormatKind = "date" | "time" | "fraction" | "special" | "custom";

function createCodeFormat(kind: CodeFormatKind, code: string): CellNumberFormat {
  const locale = inferCodeLocale(code);
  return locale ? { kind, code, locale } : { kind, code };
}

function inferCodeLocale(code: string): string | undefined {
  for (const token of findUnescapedLocalePrefixes(code)) {
    const locale = getNumberFormatLocale(token);
    if (locale) return locale;
  }
  return undefined;
}

/**
 * Locale prefixes only have meaning outside quoted literals and escaped text.
 * Keep unknown LCIDs out of the semantic locale field so their original code
 * remains the sole source of truth on a later XLSX export.
 */
function* findUnescapedLocalePrefixes(code: string): Generator<string> {
  let quoted = false;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index] ?? "";
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === '"') {
      if (quoted && code[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }
    if (quoted || character !== "[") continue;
    const end = code.indexOf("]", index + 1);
    if (end < 0) continue;
    const match = /^\[\$-([0-9a-f]+)\]$/i.exec(code.slice(index, end + 1));
    if (match?.[1]) yield match[1];
    index = end;
  }
}

function canRoundTripSemantically(format: CellNumberFormat, code: string): boolean {
  return normalizeSemanticCode(toCellNumberFormatCode(format)) === normalizeSemanticCode(code);
}

function parseStyledDecimal(code: string): CellNumberFormat | undefined {
  const sections = code.split(";");
  if (sections.length > 2) return undefined;
  const positive = /^(\[\$[^\]]+\])?(#,##0|0)(?:\.(0{1,20}))?(%)?$/i.exec(sections[0] ?? "");
  if (!positive) return undefined;
  const fractionDigits = (positive[3] ?? "").length;
  const negativeStyle = sections[1]
    ? parseNegativeStyle(sections[1], sections[0] ?? "")
    : undefined;
  if (sections[1] && !negativeStyle) return undefined;
  const base = {
    fractionDigits,
    ...(positive[2] === "0" ? { useGrouping: false } : {}),
    ...(negativeStyle ? { negativeStyle } : {}),
  };
  if (positive[1]) {
    if (positive[4]) return undefined;
    const currency = currencyFromPrefix(positive[1]);
    if (!currency || positive[2] === "0") return undefined;
    return {
      kind: "currency",
      ...currency,
      fractionDigits,
      ...(negativeStyle ? { negativeStyle } : {}),
    };
  }
  if (positive[4]) return { kind: "percent", ...base };
  return { kind: "number", ...base };
}

function parseNegativeStyle(
  negative: string,
  positive: string,
): CellNumberFormatNegativeStyle | undefined {
  const red = /^\[Red\]/i.test(negative);
  const body = negative.replace(/^\[Red\]/i, "");
  const comparable = positive.replace(/^\[\$[^\]]+\]/i, "");
  if (body === `-${positive}` || body === `-${comparable}`) return red ? "red" : "minus";
  if (body === `(${positive})` || body === `(${comparable})`)
    return red ? "red-parentheses" : "parentheses";
  return undefined;
}

function parseAccounting(
  code: string,
): Extract<CellNumberFormat, { kind: "accounting" }> | undefined {
  // Accounting codes include width-fill/alignment directives. Require both so
  // arbitrary custom codes containing one underscore do not change category.
  if (!/_\([^;]*\*|\*[^;]*_\)/.test(code)) return undefined;
  const prefix = /\[\$[^\]]+\]/i.exec(code)?.[0];
  const prefixCurrency = prefix ? currencyFromPrefix(prefix) : undefined;
  const currency = prefixCurrency?.currency ?? /"([A-Z]{3})"\*/.exec(code)?.[1] ?? "";
  const fractionDigits = /#,##0(?:\.(0{1,20}))?/.exec(code)?.[1]?.length ?? 0;
  const negativeSection = code.split(";")[1] ?? "";
  const negativeStyle: CellNumberFormatNegativeStyle | undefined = /\[Red\]/i.test(negativeSection)
    ? /\\?\(/.test(negativeSection)
      ? "red-parentheses"
      : "red"
    : /\\?\(/.test(negativeSection)
      ? "parentheses"
      : /-/.test(negativeSection)
        ? "minus"
        : undefined;
  return {
    kind: "accounting",
    currency: currency.toUpperCase(),
    ...(prefixCurrency?.currencySymbol ? { currencySymbol: prefixCurrency.currencySymbol } : {}),
    ...(prefixCurrency?.locale ? { locale: prefixCurrency.locale } : {}),
    fractionDigits,
    ...(negativeStyle ? { negativeStyle } : {}),
  };
}

function isFractionCode(code: string): boolean {
  const stripped = stripQuotedAndBracketedCode(code);
  return /(?:[#?0]+\s+)?[#?0]+\s*\/\s*[#?0]+/.test(stripped);
}

function isDateOrTimeCode(code: string): boolean {
  const stripped = stripQuotedAndBracketedCode(code);
  return (
    /(?:y|m|d|h|s|AM\/PM|A\/P)/i.test(stripped) ||
    /a{3,4}/i.test(stripped) ||
    /\[(?:h|m|s)\]/i.test(code)
  );
}

function dateOrTimeKind(code: string): "date" | "time" {
  const stripped = stripQuotedAndBracketedCode(code);
  if (/[yd]|a{3,4}/i.test(stripped)) return "date";
  if (/[hs]|AM\/PM|A\/P|m\s*:|\[(?:h|m|s)\]/i.test(stripped) || /\[(?:h|m|s)\]/i.test(code))
    return "time";
  return "date";
}

function stripQuotedAndBracketedCode(code: string): string {
  return code.replace(/"(?:[^"]|"")*"|\\.|\[[^\]]*\]/g, "");
}

type ParsedCurrencyPrefix = Readonly<{
  currency: string;
  currencySymbol?: string;
  locale?: string;
}>;

function currencyFromPrefix(prefix: string): ParsedCurrencyPrefix | undefined {
  const canonical = legacyCurrencyFromPrefix(prefix);
  if (canonical) return { currency: canonical };

  const legacy = /^\[\$([A-Z]{3})\]$/i.exec(prefix)?.[1];
  if (legacy) return { currency: legacy.toUpperCase() };

  const localized = /^\[\$([^\]-]+)-([0-9a-f]+)\]$/i.exec(prefix);
  if (!localized) return undefined;
  const symbol = localized[1] ?? "";
  const locale = getNumberFormatLocale(localized[2] ?? "");
  if (!locale) return undefined;
  const currency = currencyForLocalizedSymbol(symbol, locale);
  return currency ? { currency, currencySymbol: symbol, locale } : undefined;
}

/**
 * These eleven prefixes predate currency-symbol and locale fields. Keep their
 * original semantic shape so old snapshots do not gain presentation details.
 */
const LEGACY_CURRENCY_PREFIXES: Readonly<Record<string, string>> = {
  "[$$-409]": "USD",
  "[$A$-C09]": "AUD",
  "[$CA$-1009]": "CAD",
  "[$HK$-C04]": "HKD",
  "[$NT$-404]": "TWD",
  "[$S$-4809]": "SGD",
  "[$€-407]": "EUR",
  "[$£-809]": "GBP",
  "[$¥-411]": "JPY",
  "[$¥-804]": "CNY",
  "[$₩-412]": "KRW",
};

function legacyCurrencyFromPrefix(prefix: string): string | undefined {
  return (
    LEGACY_CURRENCY_PREFIXES[prefix] ??
    LEGACY_CURRENCY_PREFIXES[normalizeLegacyCurrencyPrefixCase(prefix)]
  );
}

function normalizeLegacyCurrencyPrefixCase(prefix: string): string {
  return prefix.replace(/-[0-9a-f]+\]$/i, (suffix) => suffix.toUpperCase());
}

function currencyFromLegacyCodePrefix(prefix: string): string | undefined {
  const legacy = /^\[\$([A-Z]{3})\]$/i.exec(prefix)?.[1];
  return legacy?.toUpperCase() ?? legacyCurrencyFromPrefix(prefix);
}

/**
 * An explicit national prefix (for example `US$`) identifies its currency even
 * when the number-format locale is a different language. A short symbol such
 * as `$` is only semantic when it is the locale's own currency symbol.
 */
function currencyForLocalizedSymbol(symbol: string, locale: string): string | undefined {
  const explicit = EXPLICIT_CURRENCY_SYMBOLS[symbol];
  if (explicit) return explicit;
  const currency = getNumberFormatLocaleCurrency(locale);
  return currency && symbolMatchesCurrency(symbol, locale, currency) ? currency : undefined;
}

function symbolMatchesCurrency(symbol: string, locale: string, currency: string): boolean {
  try {
    const displays = ["symbol", "narrowSymbol", "code"] as const;
    return displays.some((currencyDisplay) =>
      new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay })
        .formatToParts(0)
        .some((part) => part.type === "currency" && part.value === symbol),
    );
  } catch {
    return false;
  }
}

const EXPLICIT_CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  A$: "AUD",
  CA$: "CAD",
  "CN¥": "CNY",
  HK$: "HKD",
  NT$: "TWD",
  NZ$: "NZD",
  R$: "BRL",
  S$: "SGD",
  US$: "USD",
};

function normalizeCanonicalCurrencyCode(code: string): string {
  return code.replace(/\[\$[^\]]+\]/g, (prefix) => {
    const currency = currencyFromLegacyCodePrefix(prefix);
    return currency ? `[$${currency}]` : prefix;
  });
}

function normalizeSemanticCode(code: string): string {
  // ExcelJS serializes escaped accounting parentheses without the optional
  // backslashes. In a number format section both forms are literal parens.
  return normalizeCanonicalCurrencyCode(code).replace(/\\([()])/g, "$1");
}
