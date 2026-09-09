import { addLocale, format, formatColor, getFormatDateInfo, getLocale, isTextFormat } from "numfmt";
import { FORMULA_ERROR_TOKENS, isFormulaError, type FormulaValue } from "./formula/types.js";
import type { ExcelDateSystem } from "./formula/date-system.js";
import {
  canonicalizeCellNumberFormatCode,
  validateCellNumberFormatCode as validateFormatCode,
} from "./number-format-code.js";
import { NUMBER_FORMAT_LOCALES, getNumberFormatLocaleId } from "./number-format-locales.js";
import type { CellNumberFormat, CellNumberFormatNegativeStyle } from "./style.js";

export {
  NUMBER_FORMAT_LOCALES,
  getNumberFormatLocale,
  getNumberFormatLocaleCurrency,
  getNumberFormatLocaleId,
} from "./number-format-locales.js";

export type CellNumberFormatPresentation = Readonly<{
  text: string;
  color?: string;
  /** The grid expands `character` between these portions to match the cell width. */
  fill?: Readonly<{ before: string; after: string; character: string }>;
}>;

export type CellNumberFormatOptions = Readonly<{
  locale?: string;
  dateSystem?: ExcelDateSystem;
}>;

const DEFAULT_LOCALE = "en-US";
const DATE_LOCALE_KEY_BY_LCID = new Map<string, string>();

/**
 * numfmt recognizes the Excel LCID embedded in a format code, but its bundled
 * date-name tables intentionally cover only a subset of Microsoft's locales.
 * Register private, exact-LCID date tables from the host's ICU data. The
 * calendar, numbering system, and time zone are specified so this
 * initialization never depends on workbook or host date settings.
 */
registerMissingDateLocales();

function registerMissingDateLocales(): void {
  for (const entry of NUMBER_FORMAT_LOCALES) {
    const language = entry.locale.split("-", 1)[0];
    if (
      !language ||
      (getLocale(language) && getLocale(entry.lcid) && !hasScriptSubtag(entry.locale)) ||
      !supportsDateLocale(entry.locale)
    ) {
      continue;
    }
    const data = createDateLocaleData(entry.locale);
    if (!data) continue;
    const key = `idea10l${entry.lcid.toLowerCase()}`;
    addLocale({ ...getLegacyFallbackLocale(language), ...data }, key);
    DATE_LOCALE_KEY_BY_LCID.set(entry.lcid, key);
  }
}

function hasScriptSubtag(locale: string): boolean {
  return locale.split("-").some((part) => /^[A-Z][a-z]{3}$/.test(part));
}

function getLegacyFallbackLocale(locale = DEFAULT_LOCALE): Record<string, unknown> {
  // Preserve numfmt's previous fallback for numeric, currency and boolean
  // formats. The date-name fields are the only values this module changes.
  return { ...(getLocale(locale) ?? getLocale(DEFAULT_LOCALE)) };
}

function supportsDateLocale(locale: string): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

function createDateLocaleData(locale: string):
  | {
      mmmm: string[];
      mmm: string[];
      dddd: string[];
      ddd: string[];
      ampm: string[];
      preferMDY: boolean;
    }
  | undefined {
  try {
    const options = { calendar: "gregory", numberingSystem: "latn", timeZone: "UTC" } as const;
    const month = (style: "long" | "short") =>
      getDateParts(
        locale,
        { ...options, day: "numeric", month: style },
        "month",
        12,
        (index) => new Date(Date.UTC(2024, index, 1)),
      );
    const weekday = (style: "long" | "short") =>
      getDateParts(
        locale,
        { ...options, weekday: style },
        "weekday",
        7,
        (index) => new Date(Date.UTC(2024, 0, 7 + index)),
      );
    const ampm = getDateParts(
      locale,
      { ...options, hour: "numeric", hour12: true },
      "dayPeriod",
      2,
      (index) => new Date(Date.UTC(2024, 0, 1, index ? 13 : 1)),
    );
    const order = new Intl.DateTimeFormat(locale, {
      ...options,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(new Date(Date.UTC(2024, 10, 21)))
      .filter((part) => part.type === "month" || part.type === "day")
      .map((part) => part.type);
    const mmmm = month("long");
    const mmm = month("short");
    const dddd = weekday("long");
    const ddd = weekday("short");
    if (!mmmm || !mmm || !dddd || !ddd || !ampm) return undefined;
    return {
      mmmm,
      mmm,
      dddd,
      ddd,
      ampm,
      preferMDY: order[0] === "month",
    };
  } catch {
    return undefined;
  }
}

function getDateParts(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  partType: Intl.DateTimeFormatPartTypes,
  length: number,
  dateAt: (index: number) => Date,
): string[] | undefined {
  const formatter = new Intl.DateTimeFormat(locale, options);
  const values = Array.from(
    { length },
    (_, index) =>
      formatter.formatToParts(dateAt(index)).find((part) => part.type === partType)?.value,
  );
  return values.every((value): value is string => Boolean(value)) ? values : undefined;
}

/** Converts a semantic format into its XLSX-compatible format code. */
export function toCellNumberFormatCode(
  format: CellNumberFormat | undefined,
  _locale?: string,
): string {
  if (!format) return "General";
  if (
    format.kind === "date" ||
    format.kind === "time" ||
    format.kind === "fraction" ||
    format.kind === "special" ||
    format.kind === "custom"
  ) {
    return canonicalizeCellNumberFormatCode(format.code);
  }
  if (format.kind === "text") return "@";
  if (format.kind === "scientific") return `0${decimalPlaces(format.fractionDigits)}E+00`;

  if (format.kind === "number" || format.kind === "percent") {
    const number = `${format.useGrouping === false ? "0" : "#,##0"}${decimalPlaces(format.fractionDigits)}`;
    return format.kind === "percent"
      ? withNegativeStyle(`${number}%`, format.negativeStyle)
      : withNegativeStyle(number, format.negativeStyle);
  }
  const currency = currencyFormatPrefix(format.currency, format.currencySymbol, format.locale);
  const number = `#,##0${decimalPlaces(format.fractionDigits)}`;
  return format.kind === "currency"
    ? withNegativeStyle(`${currency}${number}`, format.negativeStyle)
    : accountingCode(currency, format.fractionDigits, format.negativeStyle);
}

/**
 * Formats a core value without depending on DOM, Vue, Intl browser state, or
 * the host time zone.  Fill directives are surfaced, not expanded, because
 * only the grid knows the rendered cell width.
 */
export function formatCellNumberValue(
  value: FormulaValue,
  cellFormat: CellNumberFormat | undefined,
  options: CellNumberFormatOptions = {},
): CellNumberFormatPresentation {
  if (isFormulaError(value)) return { text: FORMULA_ERROR_TOKENS[value.code] };
  const code = localizeDateLocaleCodes(toCellNumberFormatCode(cellFormat, options.locale));
  const locale =
    cellFormat?.kind === "text" ? options.locale : (cellFormat?.locale ?? options.locale);
  const formatterOptions = { locale: locale ?? DEFAULT_LOCALE, throws: true, nbsp: false } as const;
  const rendering = selectFormatRendering(code, value, options.dateSystem, formatterOptions);
  const text = format(rendering.code, rendering.value, formatterOptions);
  const color = formatColor(rendering.code, rendering.value, formatterOptions);
  const selectedDbNum = findSelectedDbNumModifier(
    rendering.code,
    rendering.value,
    formatterOptions,
  );
  const fill = findSelectedFill(rendering.code, rendering.value, formatterOptions, text);
  const nativeText = applyChineseNativeDigits(text, selectedDbNum);
  const nativeFill =
    fill && selectedDbNum ? applyNativeDigitsToFill(fill, selectedDbNum, nativeText) : fill;
  return {
    text: nativeText,
    ...(typeof color === "string" ? { color } : {}),
    ...(nativeFill ? { fill: nativeFill } : {}),
  };
}

function localizeDateLocaleCodes(code: string): string {
  if (!code.includes("[$")) return code;
  return splitFormatSections(code)
    .map((section) => {
      const info = getFormatDateInfo(section);
      if (!(info.year || info.month || info.day || info.hours || info.minutes || info.seconds))
        return section;
      return replaceOutsideQuotedText(section, (source, index) => {
        if (source[index] !== "[") return undefined;
        const match = /^\[\$([^\]-]*)-([0-9a-f]+)\]/i.exec(source.slice(index));
        if (!match) return undefined;
        const currency = match[1] ?? "";
        const lcid = match[2]?.toUpperCase().replace(/^0+(?=[0-9A-F])/, "");
        const localeKey = lcid ? DATE_LOCALE_KEY_BY_LCID.get(lcid) : undefined;
        return localeKey
          ? { value: `[$${currency}-${localeKey}]`, length: match[0].length }
          : undefined;
      });
    })
    .join(";");
}

/** Returns false for malformed codes and intentionally unsupported native-number modifiers. */
export const validateCellNumberFormatCode = validateFormatCode;

type FormatterOptions = Readonly<{ locale: string; throws: true; nbsp: false }>;
type SelectedDbNum = Readonly<{ modifier: "1" | "2"; section: string }>;
type SelectedFill = Readonly<{ before: string; after: string; character: string }>;

function findSelectedDbNumModifier(
  code: string,
  value: Exclude<FormulaValue, { kind: "formula-error" }>,
  options: FormatterOptions,
): SelectedDbNum | undefined {
  const sections = splitFormatSections(code);
  const candidates = sections.flatMap((section, index) => {
    const modifier = /\[DBNum([12])\]/i.exec(section)?.[1] as "1" | "2" | undefined;
    return modifier
      ? [
          {
            modifier,
            section,
            sectionIndex: index,
            marker: createMarker(code, value, "dbnum", index),
          },
        ]
      : [];
  });
  if (!candidates.length) return undefined;
  const markedCode = sections
    .map((section, index) => {
      const candidate = candidates.find((entry) => entry.sectionIndex === index);
      return candidate ? `${section}"${candidate.marker}"` : section;
    })
    .join(";");
  const markedText = format(markedCode, value, options);
  const selected = candidates.find((candidate) => markedText.includes(candidate.marker));
  return selected ? { modifier: selected.modifier, section: selected.section } : undefined;
}

function findSelectedFill(
  code: string,
  value: Exclude<FormulaValue, { kind: "formula-error" }>,
  options: FormatterOptions,
  text: string,
): SelectedFill | undefined {
  const fills: Array<{ marker: string; character: string }> = [];
  const markedCode = replaceOutsideQuotedText(code, (source, index) => {
    if (source[index] !== "*" || index + 1 >= source.length) return undefined;
    const marker = createMarker(code, value, "fill", fills.length);
    fills.push({ marker, character: source[index + 1] ?? "" });
    return { value: `"${marker}"`, length: 2 };
  });
  if (!fills.length) return undefined;
  const markedText = format(markedCode, value, options);
  const selected = fills.filter((fill) => markedText.includes(fill.marker));
  if (selected.length !== 1) return undefined;
  const fill = selected[0];
  if (!fill) return undefined;
  const index = markedText.indexOf(fill.marker);
  if (index < 0) return undefined;
  // Replacing a fill with a marker only adds that marker; removing it restores
  // numfmt's normal single-space/skip output exactly.
  const before = markedText.slice(0, index);
  const after = markedText.slice(index + fill.marker.length);
  return before + after === text ? { before, after, character: fill.character } : undefined;
}

function selectFormatRendering(
  code: string,
  value: Exclude<FormulaValue, { kind: "formula-error" }>,
  dateSystem: ExcelDateSystem | undefined,
  options: FormatterOptions,
): Readonly<{ code: string; value: Exclude<FormulaValue, { kind: "formula-error" }> }> {
  if (dateSystem !== "1904" || typeof value !== "number") return { code, value };
  const sections = splitFormatSections(code);
  const markers = sections.map((_, index) => createMarker(code, value, "section", index));
  const markedCode = sections
    .map((section, index) => `${section}"${markers[index] ?? ""}"`)
    .join(";");
  const selectedText = format(markedCode, value, options);
  const selectedIndex = markers.findIndex((marker) => selectedText.includes(marker));
  const selectedSection = selectedIndex >= 0 ? sections[selectedIndex] : undefined;
  if (!selectedSection || !hasCalendarFields(selectedSection)) return { code, value };
  // Conditions select a section from the original serial. Once selected, they
  // must not be evaluated again against the 1904-shifted serial.
  return { code: removeConditions(selectedSection), value: value + 1462 };
}

function hasCalendarFields(section: string): boolean {
  try {
    const info = getFormatDateInfo(section);
    return info.year || info.month || info.day;
  } catch {
    return false;
  }
}

function splitFormatSections(code: string): string[] {
  const sections: string[] = [];
  let section = "";
  let quoted = false;
  let bracketDepth = 0;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index] ?? "";
    if (character === "\\") {
      section += character + (code[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (character === '"') {
      if (quoted && code[index + 1] === '"') {
        section += '""';
        index += 1;
      } else {
        quoted = !quoted;
        section += character;
      }
      continue;
    }
    if (!quoted && character === "[") bracketDepth += 1;
    if (!quoted && character === "]" && bracketDepth > 0) bracketDepth -= 1;
    if (!quoted && bracketDepth === 0 && character === ";") {
      sections.push(section);
      section = "";
    } else {
      section += character;
    }
  }
  sections.push(section);
  return sections;
}

function replaceOutsideQuotedText(
  code: string,
  replacement: (source: string, index: number) => { value: string; length: number } | undefined,
): string {
  let output = "";
  let quoted = false;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index] ?? "";
    if (character === "\\") {
      output += character + (code[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (character === '"') {
      if (quoted && code[index + 1] === '"') {
        output += '""';
        index += 1;
      } else {
        quoted = !quoted;
        output += character;
      }
      continue;
    }
    if (!quoted) {
      const result = replacement(code, index);
      if (result) {
        output += result.value;
        index += result.length - 1;
        continue;
      }
    }
    output += character;
  }
  return output;
}

function createMarker(code: string, value: unknown, purpose: string, index: number): string {
  let suffix = 0;
  let marker = "";
  do {
    marker = `\uE000idea10-${purpose}-${index}-${suffix}\uE001`;
    suffix += 1;
  } while (code.includes(marker) || String(value).includes(marker));
  return marker;
}

export function isTextCellNumberFormat(format: CellNumberFormat | undefined): boolean {
  if (!format) return false;
  if (format.kind === "text") return true;
  if (format.kind !== "custom") return false;
  try {
    return isTextFormat(format.code);
  } catch {
    return false;
  }
}

function decimalPlaces(fractionDigits: number): string {
  return fractionDigits ? `.${"0".repeat(fractionDigits)}` : "";
}

function withNegativeStyle(
  code: string,
  negativeStyle: CellNumberFormatNegativeStyle | undefined,
): string {
  switch (negativeStyle) {
    case "red":
      return `${code};[Red]-${code}`;
    case "parentheses":
      return `${code};(${code})`;
    case "red-parentheses":
      return `${code};[Red](${code})`;
    default:
      return code;
  }
}

function accountingCode(
  currency: string,
  fractionDigits: number,
  negativeStyle: CellNumberFormatNegativeStyle | undefined,
): string {
  const decimals = decimalPlaces(fractionDigits);
  const prefix = currency ? `_(${currency}* ` : "_(* ";
  const negativeColor =
    negativeStyle === "red" || negativeStyle === "red-parentheses" ? "[Red]" : "";
  const negativeValue =
    negativeStyle === "minus" || negativeStyle === "red"
      ? `-#,##0${decimals}`
      : `\\(#,##0${decimals}\\)`;
  return `${prefix}#,##0${decimals}_);${negativeColor}${prefix}${negativeValue}_);${prefix}"-"${decimals ? "??" : ""}_);_(@_)`;
}

function removeConditions(section: string): string {
  return replaceOutsideQuotedText(section, (source, index) => {
    const condition = /^\[(?:>=|<=|<>|>|<|=)-?(?:\d+(?:\.\d*)?|\.\d+)\]/.exec(source.slice(index));
    return condition ? { value: "", length: condition[0].length } : undefined;
  });
}

function applyChineseNativeDigits(text: string, selectedDbNum: SelectedDbNum | undefined): string {
  if (!selectedDbNum) return text;
  const native = selectedDbNum.modifier === "1" ? CHINESE_LOWER : CHINESE_UPPER;
  const dateInfo = getFormatDateInfo(selectedDbNum.section);
  if (dateInfo.year || dateInfo.month || dateInfo.day) {
    const order = getDateComponentOrder(selectedDbNum.section);
    let componentIndex = 0;
    return text.replace(/\d+/g, (number) => {
      const component = order[componentIndex];
      componentIndex += 1;
      return component === "year"
        ? toChineseYear(number, native.digits)
        : toChineseInteger(number, native);
    });
  }
  return text.replace(/[0-9][0-9,]*(?:\.\d+)?/g, (number) =>
    toChineseNumber(number.replaceAll(",", ""), native),
  );
}

function applyNativeDigitsToFill(
  fill: SelectedFill,
  selectedDbNum: SelectedDbNum,
  nativeText: string,
): SelectedFill | undefined {
  const before = applyChineseNativeDigits(fill.before, selectedDbNum);
  const after = applyChineseNativeDigits(fill.after, selectedDbNum);
  return before + after === nativeText ? { before, after, character: fill.character } : undefined;
}

type ChineseNativeNumber = Readonly<{
  digits: readonly string[];
  smallUnits: readonly string[];
  largeUnits: readonly string[];
}>;

const CHINESE_LOWER: ChineseNativeNumber = {
  digits: ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"],
  smallUnits: ["", "十", "百", "千"],
  largeUnits: ["", "万", "亿", "兆"],
};
const CHINESE_UPPER: ChineseNativeNumber = {
  digits: ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"],
  smallUnits: ["", "拾", "佰", "仟"],
  largeUnits: ["", "万", "亿", "兆"],
};

function toChineseYear(year: string, digits: readonly string[]): string {
  return year.replace(/\d/g, (digit) => (digit === "0" ? "〇" : (digits[Number(digit)] ?? digit)));
}

function toChineseInteger(value: string, native: ChineseNativeNumber): string {
  if (!/^\d+$/.test(value)) return value;
  const normalized = value.replace(/^0+(?=\d)/, "");
  if (normalized === "0") return native.digits[0] ?? "0";
  const groups: string[] = [];
  for (let end = normalized.length; end > 0; end -= 4) {
    groups.unshift(normalized.slice(Math.max(0, end - 4), end));
  }
  let output = "";
  let needsZero = false;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!group || /^0+$/.test(group)) {
      if (output) needsZero = true;
      continue;
    }
    if (
      output &&
      (needsZero || Number(group) < 1000) &&
      !output.endsWith(native.digits[0] ?? "零")
    ) {
      output += native.digits[0] ?? "零";
    }
    output += toChineseGroup(group, native);
    const largeUnit = native.largeUnits[groups.length - index - 1];
    if (largeUnit) output += largeUnit;
    needsZero = false;
  }
  return native === CHINESE_LOWER && normalized.length <= 2 && output.startsWith("一十")
    ? output.slice(1)
    : output;
}

function toChineseNumber(value: string, native: ChineseNativeNumber): string {
  const [integer, decimal] = value.split(".");
  const integerText = toChineseInteger(integer ?? "0", native);
  if (decimal === undefined) return integerText;
  return `${integerText}点${decimal.replace(/\d/g, (digit) => native.digits[Number(digit)] ?? digit)}`;
}

function getDateComponentOrder(section: string): Array<"year" | "month" | "day"> {
  const components: Array<"year" | "month" | "day"> = [];
  let quoted = false;
  let bracketDepth = 0;
  for (let index = 0; index < section.length; index += 1) {
    const character = section[index]?.toLowerCase();
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === "[") {
      bracketDepth += 1;
      continue;
    }
    if (!quoted && character === "]" && bracketDepth > 0) {
      bracketDepth -= 1;
      continue;
    }
    if (quoted || bracketDepth > 0 || (character !== "y" && character !== "m" && character !== "d"))
      continue;
    const component = character === "y" ? "year" : character === "m" ? "month" : "day";
    if (!components.includes(component)) components.push(component);
    while (section[index + 1]?.toLowerCase() === character) index += 1;
  }
  return components;
}

function toChineseGroup(group: string, native: ChineseNativeNumber): string {
  let output = "";
  let needsZero = false;
  for (let index = 0; index < group.length; index += 1) {
    const digit = Number(group[index]);
    const unit = native.smallUnits[group.length - index - 1];
    if (digit === 0) {
      if (output) needsZero = true;
      continue;
    }
    if (needsZero && !output.endsWith(native.digits[0] ?? "零")) output += native.digits[0] ?? "零";
    output += `${native.digits[digit] ?? ""}${unit ?? ""}`;
    needsZero = false;
  }
  return output;
}

function currencyFormatPrefix(
  currency: string,
  currencySymbol: string | undefined,
  locale: string | undefined,
): string {
  if (currencySymbol) {
    const localeId = locale ? getNumberFormatLocaleId(locale) : undefined;
    if (localeId && canUseCurrencyLocalePrefix(currencySymbol)) {
      return `[$${currencySymbol}-${localeId}]`;
    }
    return quoteCurrencySymbol(currencySymbol);
  }
  const prefix = CURRENCY_FORMAT_PREFIXES[currency];
  return prefix ?? (currency ? `"${currency.replaceAll('"', '""')}"` : "");
}

function canUseCurrencyLocalePrefix(symbol: string): boolean {
  return !["[", "]", '"', ";", "\\"].some((character) => symbol.includes(character));
}

function quoteCurrencySymbol(symbol: string): string {
  return `"${symbol.replaceAll('"', '""')}"`;
}

const CURRENCY_FORMAT_PREFIXES: Readonly<Record<string, string>> = {
  AUD: "[$A$-C09]",
  CAD: "[$CA$-1009]",
  CNY: "[$¥-804]",
  EUR: "[$€-407]",
  GBP: "[$£-809]",
  HKD: "[$HK$-C04]",
  JPY: "[$¥-411]",
  KRW: "[$₩-412]",
  SGD: "[$S$-4809]",
  TWD: "[$NT$-404]",
  USD: "[$$-409]",
};
