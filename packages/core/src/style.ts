export const MIN_CELL_FONT_SIZE = 8;
export const MAX_CELL_FONT_SIZE = 72;
export const DEFAULT_CELL_FONT_SIZE = 13;
export const DEFAULT_CELL_FONT_FAMILY = "Inter";
export const DEFAULT_CELL_TEXT_COLOR = "#20242c";
export const DEFAULT_CELL_FILL_COLOR = "#ffffff";
export const MAX_CELL_STYLE_PATCH_CELLS = 100_000;
export const MIN_NUMBER_FORMAT_FRACTION_DIGITS = 0;
export const MAX_NUMBER_FORMAT_FRACTION_DIGITS = 20;

export type HorizontalCellAlignment = "left" | "center" | "right";
export type VerticalCellAlignment = "top" | "middle" | "bottom";
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

export type CellNumberFormat =
  | { kind: "number" | "percent"; fractionDigits: number }
  | { kind: "currency"; currency: string; fractionDigits: number };

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
  underline?: true;
  textColor?: string;
  fillColor?: string;
  horizontalAlign?: HorizontalCellAlignment;
  verticalAlign?: VerticalCellAlignment;
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
  "textColor",
  "fillColor",
  "horizontalAlign",
  "verticalAlign",
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
const HORIZONTAL_ALIGNMENTS = new Set<HorizontalCellAlignment>(["left", "center", "right"]);
const VERTICAL_ALIGNMENTS = new Set<VerticalCellAlignment>(["top", "middle", "bottom"]);
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
const NUMBER_FORMAT_KINDS = new Set<CellNumberFormat["kind"]>(["number", "percent", "currency"]);
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export function normalizeCellNumberFormat(format: CellNumberFormat): CellNumberFormat {
  if (!format || typeof format !== "object" || !NUMBER_FORMAT_KINDS.has(format.kind)) {
    throw new TypeError("Cell number format kind must be number, percent, or currency.");
  }
  if (
    !Number.isInteger(format.fractionDigits) ||
    format.fractionDigits < MIN_NUMBER_FORMAT_FRACTION_DIGITS ||
    format.fractionDigits > MAX_NUMBER_FORMAT_FRACTION_DIGITS
  ) {
    throw new RangeError(
      `Cell number format fraction digits must be an integer between ${MIN_NUMBER_FORMAT_FRACTION_DIGITS} and ${MAX_NUMBER_FORMAT_FRACTION_DIGITS}.`,
    );
  }
  if (format.kind !== "currency") {
    return { kind: format.kind, fractionDigits: format.fractionDigits };
  }
  if (typeof format.currency !== "string") {
    throw new TypeError("Cell currency format must contain an ISO currency code.");
  }
  const currency = format.currency.toUpperCase();
  if (!CURRENCY_CODE_PATTERN.test(currency)) {
    throw new TypeError("Cell currency format must contain a three-letter ISO currency code.");
  }
  return { kind: "currency", currency, fractionDigits: format.fractionDigits };
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
      left.kind === right.kind &&
      left.fractionDigits === right.fractionDigits &&
      (left.kind !== "currency" || (right.kind === "currency" && left.currency === right.currency)))
  );
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

function normalizeHorizontalAlignment(value: unknown): HorizontalCellAlignment {
  if (typeof value !== "string" || !HORIZONTAL_ALIGNMENTS.has(value as HorizontalCellAlignment)) {
    throw new TypeError("Cell horizontal alignment must be left, center, or right.");
  }
  return value as HorizontalCellAlignment;
}

function normalizeVerticalAlignment(value: unknown): VerticalCellAlignment | undefined {
  if (typeof value !== "string" || !VERTICAL_ALIGNMENTS.has(value as VerticalCellAlignment)) {
    throw new TypeError("Cell vertical alignment must be top, middle, or bottom.");
  }
  return value === "middle" ? undefined : (value as VerticalCellAlignment);
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
  if (key === "bold" || key === "italic" || key === "underline" || key === "wrapText") {
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
  return normalizeVerticalAlignment(value) as CellStyle[Key];
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
