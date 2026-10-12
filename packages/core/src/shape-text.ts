import {
  getShapeStyleAssetIds,
  normalizeShapeStyle,
  type ShapeDetailedStyle,
} from "./shape-style.js";

export type ShapeTextDirection =
  | "horizontal"
  | "vertical-rl"
  | "vertical-lr"
  | "rotate-90"
  | "rotate-270"
  | "stacked";
export type ShapeTextMargins = {
  leftPt: number;
  rightPt: number;
  topPt: number;
  bottomPt: number;
};
export type ShapeTextLayout = {
  /** Logical block axis; physical labels depend on the text direction. */
  blockAlignment: "start" | "center" | "end";
  direction: ShapeTextDirection;
  /** Column order for stacked text, independent of glyph direction. */
  lineOrder: "rtl" | "ltr";
  marginsPt: ShapeTextMargins;
  wrap: boolean;
  overflow: boolean;
  autoFit: "none" | "resize-shape";
  /** Bypasses body 3D projection only; ordinary drawing rotation still applies. */
  keepFlat: boolean;
};
export type ShapeTextLineSpacing = { kind: "normal" } | { kind: "exact"; pt: number };
export type ShapeTextParagraph = {
  alignment: "left" | "center" | "right" | "justify";
  beforePt: number;
  afterPt: number;
  lineSpacing: ShapeTextLineSpacing;
};
/** Independently owned glyph appearance; never aliases the drawing's body style. */
export type ShapeTextStyle = ShapeDetailedStyle;
/** Opt-in uniform shape/text-box formatting. Content and base font fields stay on the drawing. */
export type ShapeText = {
  layout: ShapeTextLayout;
  paragraph: ShapeTextParagraph;
  fontFamily?: string;
  underline?: true;
  strike?: true;
  style?: ShapeTextStyle;
};
export const SHAPE_TEXT_LIMITS = { lengthPt: 4096, fontFamilyLength: 256 } as const;

type DataRecord = Record<string, unknown>;
function record(value: unknown, keys: readonly string[], name: string): DataRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid shape text ${name}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError(`Shape text ${name} must be an ordinary data record.`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown or conflicting shape text ${name} field.`);
    if (!("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError(`Shape text ${name} must contain own data fields, not accessors.`);
  }
  return value as DataRecord;
}
function required(value: DataRecord, key: string): unknown {
  if (!Object.hasOwn(value, key))
    throw new TypeError(`Shape text ${key} must be an own data field.`);
  return value[key];
}
function enumeration<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new TypeError(`Invalid shape text ${name}.`);
  return value as T;
}
function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`Invalid shape text ${name}.`);
  return value;
}
function length(value: unknown, name: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > SHAPE_TEXT_LIMITS.lengthPt
  )
    throw new RangeError(`Shape text ${name} must be finite and between 0 and 4096pt.`);
  return value === 0 ? 0 : value;
}
function margins(value: unknown): ShapeTextMargins {
  const source = record(value, ["leftPt", "rightPt", "topPt", "bottomPt"], "margins");
  return {
    leftPt: length(required(source, "leftPt"), "left margin"),
    rightPt: length(required(source, "rightPt"), "right margin"),
    topPt: length(required(source, "topPt"), "top margin"),
    bottomPt: length(required(source, "bottomPt"), "bottom margin"),
  };
}
function layout(value: unknown): ShapeTextLayout {
  const source = record(
    value,
    [
      "blockAlignment",
      "direction",
      "lineOrder",
      "marginsPt",
      "wrap",
      "overflow",
      "autoFit",
      "keepFlat",
    ],
    "layout",
  );
  return {
    blockAlignment: enumeration(
      required(source, "blockAlignment"),
      ["start", "center", "end"],
      "block alignment",
    ),
    direction: enumeration(
      required(source, "direction"),
      ["horizontal", "vertical-rl", "vertical-lr", "rotate-90", "rotate-270", "stacked"],
      "direction",
    ),
    lineOrder: enumeration(required(source, "lineOrder"), ["rtl", "ltr"], "line order"),
    marginsPt: margins(required(source, "marginsPt")),
    wrap: boolean(required(source, "wrap"), "wrap"),
    overflow: boolean(required(source, "overflow"), "overflow"),
    autoFit: enumeration(required(source, "autoFit"), ["none", "resize-shape"], "AutoFit"),
    keepFlat: boolean(required(source, "keepFlat"), "keep flat"),
  };
}
function lineSpacing(value: unknown): ShapeTextLineSpacing {
  const source = record(value, ["kind", "pt"], "line spacing");
  const kind = enumeration(required(source, "kind"), ["normal", "exact"], "line spacing kind");
  if (kind === "normal") {
    record(source, ["kind"], "normal line spacing");
    return { kind };
  }
  const pt = length(required(source, "pt"), "exact line spacing");
  if (pt === 0) throw new RangeError("Exact shape text line spacing must be positive.");
  return { kind, pt };
}
function paragraph(value: unknown): ShapeTextParagraph {
  const source = record(value, ["alignment", "beforePt", "afterPt", "lineSpacing"], "paragraph");
  return {
    alignment: enumeration(
      required(source, "alignment"),
      ["left", "center", "right", "justify"],
      "paragraph alignment",
    ),
    beforePt: length(required(source, "beforePt"), "paragraph before"),
    afterPt: length(required(source, "afterPt"), "paragraph after"),
    lineSpacing: lineSpacing(required(source, "lineSpacing")),
  };
}
function fontFamily(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Shape text font family must be a string.");
  if (!value || value !== value.trim() || value.length > SHAPE_TEXT_LIMITS.fontFamilyLength)
    throw new RangeError("Shape text font family must contain 1..256 trimmed UTF-16 units.");
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x1f || (unit >= 0x7f && unit <= 0x9f))
      throw new TypeError("Shape text font family cannot contain control characters.");
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw new TypeError("Shape text font family cannot contain unpaired surrogates.");
    } else if (unit >= 0xdc00 && unit <= 0xdfff)
      throw new TypeError("Shape text font family cannot contain unpaired surrogates.");
  }
  return value;
}

/** Strict validation and canonical deep copy. Even default-valued explicit models survive. */
export function normalizeShapeText(value: unknown): ShapeText | undefined {
  if (value === undefined) return undefined;
  const source = record(
    value,
    ["layout", "paragraph", "fontFamily", "underline", "strike", "style"],
    "model",
  );
  const normalizedLayout = layout(required(source, "layout"));
  const normalizedParagraph = paragraph(required(source, "paragraph"));
  const family = Object.hasOwn(source, "fontFamily") ? fontFamily(source.fontFamily) : undefined;
  const underline = Object.hasOwn(source, "underline")
    ? boolean(source.underline, "underline")
    : false;
  const strike = Object.hasOwn(source, "strike") ? boolean(source.strike, "strike") : false;
  const style = normalizeShapeStyle(Object.hasOwn(source, "style") ? source.style : undefined);
  return {
    layout: normalizedLayout,
    paragraph: normalizedParagraph,
    ...(family !== undefined ? { fontFamily: family } : {}),
    ...(underline ? { underline: true as const } : {}),
    ...(strike ? { strike: true as const } : {}),
    ...(style ? { style } : {}),
  };
}
export function cloneShapeText(value: ShapeText | undefined): ShapeText | undefined {
  return normalizeShapeText(value);
}
export function areShapeTextsEqual(
  left: ShapeText | undefined,
  right: ShapeText | undefined,
): boolean {
  return JSON.stringify(normalizeShapeText(left)) === JSON.stringify(normalizeShapeText(right));
}
export function getShapeTextAssetIds(value: ShapeText | undefined): string[] {
  return getShapeStyleAssetIds(normalizeShapeText(value)?.style);
}
