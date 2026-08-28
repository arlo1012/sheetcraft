export const MIN_CELL_FONT_SIZE = 8;
export const MAX_CELL_FONT_SIZE = 72;
export const DEFAULT_CELL_FONT_SIZE = 13;
export const DEFAULT_CELL_TEXT_COLOR = "#20242c";
export const DEFAULT_CELL_FILL_COLOR = "#ffffff";
export const MAX_CELL_STYLE_PATCH_CELLS = 100_000;

export type HorizontalCellAlignment = "left" | "center" | "right";

export type CellStyle = {
  fontFamily?: string;
  fontSize?: number;
  bold?: true;
  italic?: true;
  underline?: true;
  textColor?: string;
  fillColor?: string;
  horizontalAlign?: HorizontalCellAlignment;
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
] as const satisfies readonly (keyof CellStyle)[];

const CELL_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const HORIZONTAL_ALIGNMENTS = new Set<HorizontalCellAlignment>(["left", "center", "right"]);

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

function normalizeAlignment(value: unknown): HorizontalCellAlignment {
  if (typeof value !== "string" || !HORIZONTAL_ALIGNMENTS.has(value as HorizontalCellAlignment)) {
    throw new TypeError("Cell horizontal alignment must be left, center, or right.");
  }
  return value as HorizontalCellAlignment;
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
  if (key === "bold" || key === "italic" || key === "underline") {
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
  return normalizeAlignment(value) as CellStyle[Key];
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
  return style ? { ...style } : undefined;
}

export function areCellStylesEqual(
  left: CellStyle | undefined,
  right: CellStyle | undefined,
): boolean {
  return CELL_STYLE_KEYS.every((key) => Object.is(left?.[key], right?.[key]));
}
