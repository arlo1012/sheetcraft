import {
  canonicalizeCellNumberFormatCode,
  validateCellNumberFormatCode,
} from "./number-format-code.js";

export const MIN_CELL_FONT_SIZE = 8;
export const MAX_CELL_FONT_SIZE = 72;
export const DEFAULT_CELL_FONT_SIZE = 13;
export const DEFAULT_CELL_FONT_FAMILY = "Inter";
export const DEFAULT_CELL_TEXT_COLOR = "#20242c";
export const DEFAULT_CELL_FILL_COLOR = "#ffffff";
export const MAX_CELL_STYLE_PATCH_CELLS = 100_000;
export const MIN_NUMBER_FORMAT_FRACTION_DIGITS = 0;
export const MAX_NUMBER_FORMAT_FRACTION_DIGITS = 20;
export const MAX_NUMBER_FORMAT_CURRENCY_SYMBOL_LENGTH = 32;

/** The effective alignment when no horizontal alignment is stored. */
export const DEFAULT_CELL_HORIZONTAL_ALIGNMENT = "general";
/** The effective alignment when no vertical alignment is stored. */
export const DEFAULT_CELL_VERTICAL_ALIGNMENT = "bottom";
/** The effective text direction when no direction is stored. */
export const DEFAULT_CELL_TEXT_DIRECTION = "context";
export const DEFAULT_CELL_INDENT = 0;
export const DEFAULT_CELL_TEXT_ROTATION = 0;
export const MIN_CELL_INDENT = 0;
export const MAX_CELL_INDENT = 250;
export const MIN_CELL_TEXT_ROTATION = -90;
export const MAX_CELL_TEXT_ROTATION = 90;

export type HorizontalCellAlignment =
  | "general"
  | "left"
  | "center"
  | "right"
  | "fill"
  | "justify"
  | "centerContinuous"
  | "distributed";
export type VerticalCellAlignment = "top" | "middle" | "bottom" | "justify" | "distributed";
export type CellTextDirection = "context" | "ltr" | "rtl";
export type CellTextRotation = number | "vertical";
/** `true` remains the backwards-compatible representation of a single underline. */
export type CellUnderlineStyle = true | "double" | "singleAccounting" | "doubleAccounting";
export type CellFontScript = "superscript" | "subscript";
export const CELL_BORDER_LINE_STYLES = [
  "hair",
  "thin",
  "medium",
  "thick",
  "dotted",
  "dashed",
  "mediumDashed",
  "dashDot",
  "mediumDashDot",
  "dashDotDot",
  "mediumDashDotDot",
  "slantDashDot",
  "double",
] as const;

export type CellBorderLineStyle = (typeof CELL_BORDER_LINE_STYLES)[number];

export type CellBorder = {
  style: CellBorderLineStyle;
  color: string;
};

export type CellNumberFormatNegativeStyle = "minus" | "red" | "parentheses" | "red-parentheses";

/**
 * The semantic formats exposed by product UI.  Custom codes are preserved as
 * codes rather than parsed into a lossy object, so they can round-trip through
 * XLSX unchanged.
 */
export type CellNumberFormat =
  | {
      kind: "number";
      fractionDigits: number;
      useGrouping?: boolean;
      negativeStyle?: CellNumberFormatNegativeStyle;
      locale?: string;
    }
  | {
      kind: "percent";
      fractionDigits: number;
      useGrouping?: boolean;
      negativeStyle?: CellNumberFormatNegativeStyle;
      locale?: string;
    }
  | {
      kind: "currency";
      /** An ISO-4217 code, or an empty string for an accounting format without a symbol. */
      currency: string;
      /** Optional display symbol, which distinguishes regional variants of the same currency. */
      currencySymbol?: string;
      fractionDigits: number;
      negativeStyle?: CellNumberFormatNegativeStyle;
      locale?: string;
    }
  | {
      kind: "accounting";
      /** An ISO-4217 code, or an empty string for an accounting format without a symbol. */
      currency: string;
      /** Optional display symbol, which distinguishes regional variants of the same currency. */
      currencySymbol?: string;
      fractionDigits: number;
      negativeStyle?: CellNumberFormatNegativeStyle;
      locale?: string;
    }
  | { kind: "date"; code: string; locale?: string; fractionDigits?: never }
  | { kind: "time"; code: string; locale?: string; fractionDigits?: never }
  | { kind: "fraction"; code: string; locale?: string; fractionDigits?: never }
  | {
      kind: "special";
      code: string;
      /** WPS-style compact upper Chinese numerals, represented by ordinary DBNum2 in XLSX. */
      chineseUpperStyle?: "compact";
      locale?: string;
      fractionDigits?: never;
    }
  | { kind: "custom"; code: string; locale?: string; fractionDigits?: never }
  | { kind: "scientific"; fractionDigits: number; locale?: string }
  | { kind: "text"; fractionDigits?: never };

export type CellBorderPreset =
  | "none"
  | "all"
  | "outer"
  | "inner"
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "innerHorizontal"
  | "innerVertical"
  | "diagonalUp"
  | "diagonalDown";

export type CellBorderAction = {
  preset: CellBorderPreset;
  /** Omit to apply the default thin border; pass null to clear this preset's edges. */
  border?: CellBorder | null;
};

export type CellBorderFormatPatch = {
  style?: CellBorderLineStyle;
  color?: string;
};

export type CellStyle = {
  fontFamily?: string;
  fontSize?: number;
  bold?: true;
  italic?: true;
  underline?: CellUnderlineStyle;
  strikethrough?: true;
  fontScript?: CellFontScript;
  textColor?: string;
  fillColor?: string;
  horizontalAlign?: HorizontalCellAlignment;
  verticalAlign?: VerticalCellAlignment;
  indent?: number;
  shrinkToFit?: true;
  textDirection?: CellTextDirection;
  textRotation?: CellTextRotation;
  wrapText?: true;
  numberFormat?: CellNumberFormat;
  borderTop?: CellBorder;
  borderRight?: CellBorder;
  borderBottom?: CellBorder;
  borderLeft?: CellBorder;
  borderDiagonalUp?: CellBorder;
  borderDiagonalDown?: CellBorder;
};

export type CellStylePatch = {
  [Key in keyof CellStyle]?: CellStyle[Key] | null | false;
};

export const CELL_STYLE_KEYS = [
  "fontFamily",
  "fontSize",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "fontScript",
  "textColor",
  "fillColor",
  "horizontalAlign",
  "verticalAlign",
  "indent",
  "shrinkToFit",
  "textDirection",
  "textRotation",
  "wrapText",
  "numberFormat",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "borderDiagonalUp",
  "borderDiagonalDown",
] as const satisfies readonly (keyof CellStyle)[];

export function createClearCellStylePatch(): CellStylePatch {
  const patch: CellStylePatch = {};
  for (const key of CELL_STYLE_KEYS) {
    Object.assign(patch, { [key]: null });
  }
  return patch;
}

const CELL_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const HORIZONTAL_ALIGNMENTS = new Set<HorizontalCellAlignment>([
  "general",
  "left",
  "center",
  "right",
  "fill",
  "justify",
  "centerContinuous",
  "distributed",
]);
const VERTICAL_ALIGNMENTS = new Set<VerticalCellAlignment>([
  "top",
  "middle",
  "bottom",
  "justify",
  "distributed",
]);
const TEXT_DIRECTIONS = new Set<CellTextDirection>(["context", "ltr", "rtl"]);
const BORDER_LINE_STYLES = new Set<CellBorderLineStyle>(CELL_BORDER_LINE_STYLES);
const BORDER_PRESETS = new Set<CellBorderPreset>([
  "none",
  "all",
  "outer",
  "inner",
  "top",
  "right",
  "bottom",
  "left",
  "innerHorizontal",
  "innerVertical",
  "diagonalUp",
  "diagonalDown",
]);
const NUMBER_FORMAT_KINDS = new Set<CellNumberFormat["kind"]>([
  "number",
  "percent",
  "currency",
  "accounting",
  "date",
  "time",
  "fraction",
  "scientific",
  "text",
  "special",
  "custom",
]);
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const NUMBER_FORMAT_NEGATIVE_STYLES = new Set<CellNumberFormatNegativeStyle>([
  "minus",
  "red",
  "parentheses",
  "red-parentheses",
]);
const MAX_NUMBER_FORMAT_CODE_LENGTH = 255;

export function normalizeCellNumberFormat(format: CellNumberFormat): CellNumberFormat {
  if (!format || typeof format !== "object" || !NUMBER_FORMAT_KINDS.has(format.kind)) {
    throw new TypeError("Cell number format kind is invalid.");
  }
  if (format.kind === "text") return { kind: "text" };
  const locale = normalizeNumberFormatLocale(format.locale);
  if (
    format.kind === "date" ||
    format.kind === "time" ||
    format.kind === "fraction" ||
    format.kind === "custom"
  ) {
    const code = normalizeNumberFormatCode(format.code);
    return locale ? { kind: format.kind, code, locale } : { kind: format.kind, code };
  }
  if (format.kind === "special") {
    const code = normalizeNumberFormatCode(format.code);
    if (format.chineseUpperStyle !== undefined && format.chineseUpperStyle !== "compact") {
      throw new TypeError("Cell special number format Chinese upper style is invalid.");
    }
    if (format.chineseUpperStyle === "compact" && code !== "[DBNum2][$-804]General") {
      throw new TypeError(
        "Compact Chinese upper formatting requires the DBNum2 Chinese General code.",
      );
    }
    return {
      kind: "special",
      code,
      ...(format.chineseUpperStyle ? { chineseUpperStyle: format.chineseUpperStyle } : {}),
      ...(locale ? { locale } : {}),
    };
  }
  if (format.kind === "number" || format.kind === "percent") {
    assertFractionDigits(format.fractionDigits);
    if (format.useGrouping !== undefined && typeof format.useGrouping !== "boolean") {
      throw new TypeError("Cell number format grouping must be a boolean.");
    }
    assertNegativeStyle(format.negativeStyle);
    return {
      kind: format.kind,
      fractionDigits: format.fractionDigits,
      ...(format.useGrouping === undefined ? {} : { useGrouping: format.useGrouping }),
      ...(format.negativeStyle === undefined ? {} : { negativeStyle: format.negativeStyle }),
      ...(locale ? { locale } : {}),
    };
  }
  if (format.kind === "scientific") {
    assertFractionDigits(format.fractionDigits);
    return locale
      ? { kind: "scientific", fractionDigits: format.fractionDigits, locale }
      : { kind: "scientific", fractionDigits: format.fractionDigits };
  }
  assertFractionDigits(format.fractionDigits);
  if (typeof format.currency !== "string") {
    throw new TypeError("Cell currency format must contain an ISO currency code.");
  }
  const currency = format.currency.trim().toUpperCase();
  if (currency && !CURRENCY_CODE_PATTERN.test(currency)) {
    throw new TypeError("Cell currency format must contain a three-letter ISO currency code.");
  }
  const currencySymbol = normalizeCurrencySymbol(format.currencySymbol);
  if (!currency && currencySymbol) {
    throw new TypeError("A cell currency symbol requires an ISO currency code.");
  }
  assertNegativeStyle(format.negativeStyle);
  return {
    kind: format.kind,
    currency,
    ...(currencySymbol ? { currencySymbol } : {}),
    fractionDigits: format.fractionDigits,
    ...(format.negativeStyle === undefined ? {} : { negativeStyle: format.negativeStyle }),
    ...(locale ? { locale } : {}),
  };
}

export function cloneCellNumberFormat(
  format: CellNumberFormat | undefined,
): CellNumberFormat | undefined {
  return format ? normalizeCellNumberFormat(format) : undefined;
}

export function areCellNumberFormatsEqual(
  left: CellNumberFormat | undefined,
  right: CellNumberFormat | undefined,
): boolean {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      JSON.stringify(normalizeCellNumberFormat(left)) ===
        JSON.stringify(normalizeCellNumberFormat(right)))
  );
}

function assertFractionDigits(fractionDigits: unknown): asserts fractionDigits is number {
  if (
    typeof fractionDigits !== "number" ||
    !Number.isInteger(fractionDigits) ||
    fractionDigits < MIN_NUMBER_FORMAT_FRACTION_DIGITS ||
    fractionDigits > MAX_NUMBER_FORMAT_FRACTION_DIGITS
  ) {
    throw new RangeError(
      `Cell number format fraction digits must be an integer between ${MIN_NUMBER_FORMAT_FRACTION_DIGITS} and ${MAX_NUMBER_FORMAT_FRACTION_DIGITS}.`,
    );
  }
}

function assertNegativeStyle(
  value: unknown,
): asserts value is CellNumberFormatNegativeStyle | undefined {
  if (
    value !== undefined &&
    !NUMBER_FORMAT_NEGATIVE_STYLES.has(value as CellNumberFormatNegativeStyle)
  ) {
    throw new TypeError("Cell number format negative style is invalid.");
  }
}

function normalizeNumberFormatLocale(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError("Cell number format locale must be a string.");
  const locale = value.trim();
  if (!locale || locale.length > 35)
    throw new RangeError("Cell number format locale must contain between 1 and 35 characters.");
  return locale;
}

function normalizeCurrencySymbol(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError("Cell currency symbol must be a string.");
  const symbol = value.trim();
  if (!symbol || symbol.length > MAX_NUMBER_FORMAT_CURRENCY_SYMBOL_LENGTH) {
    throw new RangeError(
      `Cell currency symbol must contain between 1 and ${MAX_NUMBER_FORMAT_CURRENCY_SYMBOL_LENGTH} characters.`,
    );
  }
  if (
    [...symbol].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    })
  ) {
    throw new TypeError("Cell currency symbol must not contain control characters.");
  }
  return symbol;
}

function normalizeNumberFormatCode(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Cell number format code must be a string.");
  const code = value.trim();
  if (
    !code ||
    code.length > MAX_NUMBER_FORMAT_CODE_LENGTH ||
    [...code].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new RangeError(
      `Cell number format code must contain between 1 and ${MAX_NUMBER_FORMAT_CODE_LENGTH} printable characters.`,
    );
  }
  const canonicalCode = canonicalizeCellNumberFormatCode(code);
  if (!validateCellNumberFormatCode(canonicalCode)) {
    throw new TypeError("Cell number format code is invalid or unsupported.");
  }
  return canonicalCode;
}

function normalizeFontFamily(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("Cell font family must be a string.");
  }
  const family = value.trim();
  if (!family || family.length > 80) {
    throw new RangeError("Cell font family must contain between 1 and 80 characters.");
  }
  return family;
}

function normalizeFontSize(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_CELL_FONT_SIZE ||
    value > MAX_CELL_FONT_SIZE
  ) {
    throw new RangeError(
      `Cell font size must be an integer between ${MIN_CELL_FONT_SIZE} and ${MAX_CELL_FONT_SIZE}.`,
    );
  }
  return value;
}

function normalizeUnderline(value: unknown): CellUnderlineStyle {
  if (
    value !== true &&
    value !== "double" &&
    value !== "singleAccounting" &&
    value !== "doubleAccounting"
  ) {
    throw new TypeError(
      "Cell underline must be true, double, singleAccounting, doubleAccounting, false, or null.",
    );
  }
  return value;
}

function normalizeFontScript(value: unknown): CellFontScript {
  if (value !== "superscript" && value !== "subscript") {
    throw new TypeError("Cell font script must be superscript or subscript.");
  }
  return value;
}

function normalizeColor(value: unknown, field: string): string {
  if (typeof value !== "string" || !CELL_COLOR_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a six-digit hexadecimal color.`);
  }
  return value.toLowerCase();
}

export function normalizeCellBorder(border: CellBorder): CellBorder {
  if (!border || typeof border !== "object") {
    throw new TypeError("Cell border must be an object.");
  }
  if (
    typeof border.style !== "string" ||
    !BORDER_LINE_STYLES.has(border.style as CellBorderLineStyle)
  ) {
    throw new TypeError(`Cell border style must be one of: ${CELL_BORDER_LINE_STYLES.join(", ")}.`);
  }
  return {
    style: border.style as CellBorderLineStyle,
    color: normalizeColor(border.color, "Cell border color"),
  };
}

export function normalizeCellBorderFormatPatch(
  patch: CellBorderFormatPatch,
): CellBorderFormatPatch {
  if (!patch || typeof patch !== "object") {
    throw new TypeError("Cell border format must be an object.");
  }
  const normalized: CellBorderFormatPatch = {};
  if ("style" in patch) {
    if (
      typeof patch.style !== "string" ||
      !BORDER_LINE_STYLES.has(patch.style as CellBorderLineStyle)
    ) {
      throw new TypeError(
        `Cell border style must be one of: ${CELL_BORDER_LINE_STYLES.join(", ")}.`,
      );
    }
    normalized.style = patch.style as CellBorderLineStyle;
  }
  if ("color" in patch) normalized.color = normalizeColor(patch.color, "Cell border color");
  if (!normalized.style && !normalized.color) {
    throw new TypeError("Cell border format must set a style or color.");
  }
  return normalized;
}

export function normalizeCellBorderAction(action: CellBorderAction): CellBorderAction {
  if (!action || typeof action !== "object" || !BORDER_PRESETS.has(action.preset)) {
    throw new TypeError("Unknown cell border preset.");
  }
  if (action.preset === "none") {
    return { preset: "none" };
  }
  if (action.border === null) {
    return { preset: action.preset, border: null };
  }
  if (action.border === undefined) {
    return {
      preset: action.preset,
      border: { style: "thin", color: DEFAULT_CELL_TEXT_COLOR },
    };
  }
  return { preset: action.preset, border: normalizeCellBorder(action.border) };
}

function normalizeHorizontalAlignment(value: unknown): HorizontalCellAlignment | undefined {
  if (typeof value !== "string" || !HORIZONTAL_ALIGNMENTS.has(value as HorizontalCellAlignment)) {
    throw new TypeError(
      "Cell horizontal alignment must be general, left, center, right, fill, justify, centerContinuous, or distributed.",
    );
  }
  return value === DEFAULT_CELL_HORIZONTAL_ALIGNMENT
    ? undefined
    : (value as HorizontalCellAlignment);
}

function normalizeVerticalAlignment(value: unknown): VerticalCellAlignment | undefined {
  if (typeof value !== "string" || !VERTICAL_ALIGNMENTS.has(value as VerticalCellAlignment)) {
    throw new TypeError(
      "Cell vertical alignment must be top, middle, bottom, justify, or distributed.",
    );
  }
  return value === DEFAULT_CELL_VERTICAL_ALIGNMENT ? undefined : (value as VerticalCellAlignment);
}

function normalizeTextDirection(value: unknown): CellTextDirection | undefined {
  if (typeof value !== "string" || !TEXT_DIRECTIONS.has(value as CellTextDirection)) {
    throw new TypeError("Cell text direction must be context, ltr, or rtl.");
  }
  return value === DEFAULT_CELL_TEXT_DIRECTION ? undefined : (value as CellTextDirection);
}

function normalizeIndent(value: unknown): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_CELL_INDENT ||
    value > MAX_CELL_INDENT
  ) {
    throw new RangeError(
      `Cell indent must be an integer between ${MIN_CELL_INDENT} and ${MAX_CELL_INDENT}.`,
    );
  }
  return value === DEFAULT_CELL_INDENT ? undefined : value;
}

function normalizeTextRotation(value: unknown): CellTextRotation | undefined {
  if (value === "vertical") return value;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_CELL_TEXT_ROTATION ||
    value > MAX_CELL_TEXT_ROTATION
  ) {
    throw new RangeError(
      `Cell text rotation must be an integer between ${MIN_CELL_TEXT_ROTATION} and ${MAX_CELL_TEXT_ROTATION}, or vertical.`,
    );
  }
  return value === DEFAULT_CELL_TEXT_ROTATION ? undefined : value;
}

function normalizeStyleValue<Key extends keyof CellStyle>(
  key: Key,
  value: CellStylePatch[Key],
): CellStyle[Key] | undefined {
  if (value === null || value === false) {
    return undefined;
  }
  if (key === "fontFamily") {
    return normalizeFontFamily(value) as CellStyle[Key];
  }
  if (key === "fontSize") {
    return normalizeFontSize(value) as CellStyle[Key];
  }
  if (key === "underline") {
    return normalizeUnderline(value) as CellStyle[Key];
  }
  if (
    key === "bold" ||
    key === "italic" ||
    key === "strikethrough" ||
    key === "shrinkToFit" ||
    key === "wrapText"
  ) {
    if (value !== true) {
      throw new TypeError(`Cell ${key} must be true, false, or null.`);
    }
    return true as CellStyle[Key];
  }
  if (key === "textColor" || key === "fillColor") {
    return normalizeColor(
      value,
      key === "textColor" ? "Cell text color" : "Cell fill color",
    ) as CellStyle[Key];
  }
  if (key === "numberFormat") {
    return normalizeCellNumberFormat(value as CellNumberFormat) as CellStyle[Key];
  }
  if (
    key === "borderTop" ||
    key === "borderRight" ||
    key === "borderBottom" ||
    key === "borderLeft" ||
    key === "borderDiagonalUp" ||
    key === "borderDiagonalDown"
  ) {
    return normalizeCellBorder(value as CellBorder) as CellStyle[Key];
  }
  if (key === "horizontalAlign") {
    return normalizeHorizontalAlignment(value) as CellStyle[Key];
  }
  if (key === "verticalAlign") {
    return normalizeVerticalAlignment(value) as CellStyle[Key];
  }
  if (key === "indent") {
    return normalizeIndent(value) as CellStyle[Key];
  }
  if (key === "textDirection") {
    return normalizeTextDirection(value) as CellStyle[Key];
  }
  if (key === "fontScript") {
    return normalizeFontScript(value) as CellStyle[Key];
  }
  return normalizeTextRotation(value) as CellStyle[Key];
}

export function normalizeCellStyle(style: CellStyle | null | undefined): CellStyle | undefined {
  if (!style) {
    return undefined;
  }
  const normalized: CellStyle = {};
  for (const key of CELL_STYLE_KEYS) {
    if (!(key in style)) {
      continue;
    }
    const value = normalizeStyleValue(key, style[key]);
    if (value !== undefined) {
      Object.assign(normalized, { [key]: value });
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeCellStylePatch(patch: CellStylePatch): CellStylePatch {
  const normalized: CellStylePatch = {};
  for (const key of CELL_STYLE_KEYS) {
    if (!(key in patch)) {
      continue;
    }
    const value = normalizeStyleValue(key, patch[key]);
    Object.assign(normalized, { [key]: value ?? null });
  }
  return normalized;
}

export function mergeCellStyle(
  style: CellStyle | undefined,
  patch: CellStylePatch,
): CellStyle | undefined {
  const normalizedPatch = normalizeCellStylePatch(patch);
  const merged: CellStyle = { ...style };
  for (const key of CELL_STYLE_KEYS) {
    if (!(key in normalizedPatch)) {
      continue;
    }
    const value = normalizedPatch[key];
    if (value === null || value === false || value === undefined) {
      delete merged[key];
    } else {
      Object.assign(merged, { [key]: value });
    }
  }
  return normalizeCellStyle(merged);
}

export function cloneCellStyle(style: CellStyle | undefined): CellStyle | undefined {
  if (!style) {
    return undefined;
  }
  return normalizeCellStyle(style);
}

export function areCellStylesEqual(
  left: CellStyle | undefined,
  right: CellStyle | undefined,
): boolean {
  return CELL_STYLE_KEYS.every((key) => {
    const leftValue = left?.[key];
    const rightValue = right?.[key];
    if (
      key === "borderTop" ||
      key === "borderRight" ||
      key === "borderBottom" ||
      key === "borderLeft" ||
      key === "borderDiagonalUp" ||
      key === "borderDiagonalDown"
    ) {
      return (
        leftValue === rightValue ||
        (leftValue !== undefined &&
          rightValue !== undefined &&
          (leftValue as CellBorder).style === (rightValue as CellBorder).style &&
          (leftValue as CellBorder).color === (rightValue as CellBorder).color)
      );
    }
    if (key === "numberFormat") {
      return areCellNumberFormatsEqual(
        leftValue as CellNumberFormat | undefined,
        rightValue as CellNumberFormat | undefined,
      );
    }
    return Object.is(leftValue, rightValue);
  });
}
