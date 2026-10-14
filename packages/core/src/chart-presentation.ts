import { readPictureDataArray } from "./picture-data-array.js";

/** Sparse chart-wide choices; omission retains the chart's existing presentation. */
export type ChartPresentationSettings = {
  /** A rendering choice only; worksheet and cached values remain unchanged. */
  percentStacked?: true;
  lineMarkers?: boolean;
  /** Ordered opaque RGB colors, independent of source-series identities. */
  palette?: string[];
  background?: string;
};

const keys = ["percentStacked", "lineMarkers", "palette", "background"] as const;

function color(value: unknown): string {
  if (typeof value !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value))
    throw new RangeError("Chart presentation color must be opaque hex RGB.");
  return value.toLowerCase();
}

/** Validate all own descriptors before consuming choices; never invoke caller getters. */
export function normalizeChartPresentation(value: unknown): ChartPresentationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Chart presentation requires an ordinary data record.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Chart presentation requires an ordinary data record.");
  for (const key of keys)
    if (key in value && !Object.hasOwn(value, key))
      throw new TypeError("Chart presentation requires own data fields.");
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length > keys.length)
    throw new TypeError("Chart presentation requires known own data fields.");
  const source: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key as (typeof keys)[number]))
      throw new TypeError("Unknown chart presentation setting.");
    if (!("value" in field))
      throw new TypeError("Chart presentation requires own data fields, not accessors.");
    if (field.value === undefined)
      throw new TypeError("Chart presentation choices must be explicit; omit reset fields.");
    source[key] = field.value as unknown;
  }
  const result: ChartPresentationSettings = {};
  if (Object.hasOwn(source, "percentStacked")) {
    if (source.percentStacked !== true)
      throw new TypeError("Chart percent stacking must be true; omit it to reset.");
    result.percentStacked = true;
  }
  if (Object.hasOwn(source, "lineMarkers")) {
    if (typeof source.lineMarkers !== "boolean")
      throw new TypeError("Chart line markers must be a boolean.");
    result.lineMarkers = source.lineMarkers;
  }
  if (Object.hasOwn(source, "palette")) {
    const palette = readPictureDataArray(source.palette as readonly unknown[], "chart palette", 16);
    if (!palette.length) throw new RangeError("Chart palette requires 1–16 colors.");
    result.palette = palette.map(color);
  }
  if (Object.hasOwn(source, "background")) result.background = color(source.background);
  return result;
}
