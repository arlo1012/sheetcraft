import { readPictureDataArray } from "./picture-data-array.js";

export const scatterStyles = ["marker", "smoothMarker", "smooth", "lineMarker", "line"] as const;
export const pieFamilies = ["pie", "threeD", "pieOfPie", "barOfPie", "doughnut"] as const;
export type PieFamily = (typeof pieFamilies)[number];
export type PieStyle = Exclude<PieFamily, "pie" | "doughnut">;
export type PieLabel = "percent" | "categoryPercent";
export type ScatterStyle = (typeof scatterStyles)[number];
export function isScatterStyle(value: unknown): value is ScatterStyle {
  return scatterStyles.includes(value as ScatterStyle);
}
export function rotateChartPalette(palette: readonly string[], accent: number): string[] {
  const start = accent % palette.length;
  return [...palette.slice(start), ...palette.slice(0, start)];
}

/** Sparse chart-wide choices; omission retains the chart's existing presentation. */
export type ChartPresentationSettings = {
  /** A rendering choice only; worksheet and cached values remain unchanged. */
  animated?: true;
  percentStacked?: true;
  lineMarkers?: boolean;
  scatterStyle?: ScatterStyle;
  bubbleShading?: true;
  pieStyle?: PieStyle;
  pieLabels?: PieLabel;
  pieExploded?: true;
  /** Start the series palette at this accent in the current workbook theme. */
  themeAccent?: number;
  /** Ordered opaque RGB colors, independent of source-series identities. */
  palette?: string[];
  background?: string;
};

const keys = [
  "animated",
  "percentStacked",
  "lineMarkers",
  "scatterStyle",
  "bubbleShading",
  "pieStyle",
  "pieLabels",
  "pieExploded",
  "themeAccent",
  "palette",
  "background",
] as const;

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
  if (Object.hasOwn(source, "animated")) {
    if (source.animated !== true) throw new TypeError("Omit animated to disable chart motion.");
    result.animated = true;
  }
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
  if (Object.hasOwn(source, "bubbleShading")) {
    if (source.bubbleShading !== true)
      throw new RangeError("Omit bubble shading for flat bubbles.");
    result.bubbleShading = true;
  }
  if (Object.hasOwn(source, "pieStyle")) {
    if (
      source.pieStyle !== "threeD" &&
      source.pieStyle !== "pieOfPie" &&
      source.pieStyle !== "barOfPie"
    )
      throw new RangeError("Unknown pie chart subtype.");
    result.pieStyle = source.pieStyle;
  }
  if (Object.hasOwn(source, "pieLabels")) {
    if (source.pieLabels !== "percent" && source.pieLabels !== "categoryPercent")
      throw new RangeError("Unknown pie chart labels.");
    result.pieLabels = source.pieLabels;
  }
  if (Object.hasOwn(source, "pieExploded")) {
    if (source.pieExploded !== true) throw new RangeError("Omit pie explosion for joined sectors.");
    result.pieExploded = true;
  }
  if (Object.hasOwn(source, "scatterStyle")) {
    if (!isScatterStyle(source.scatterStyle)) throw new RangeError("Unknown XY scatter style.");
    result.scatterStyle = source.scatterStyle;
  }
  if (Object.hasOwn(source, "themeAccent")) {
    const accent = source.themeAccent;
    if (
      typeof accent !== "number" ||
      !Number.isInteger(accent) ||
      accent < 0 ||
      accent > 5 ||
      Object.hasOwn(source, "palette")
    )
      throw new RangeError("Invalid chart theme accent.");
    result.themeAccent = accent;
  }
  if (Object.hasOwn(source, "palette")) {
    const palette = readPictureDataArray(source.palette as readonly unknown[], "chart palette", 16);
    if (!palette.length) throw new RangeError("Chart palette requires 1–16 colors.");
    result.palette = palette.map(color);
  }
  if (Object.hasOwn(source, "background")) result.background = color(source.background);
  return result;
}

/** Product-owned default palette, shared by Web rendering and native export. */
export const DEFAULT_CHART_PALETTE: readonly string[] = Object.freeze([
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#db2777",
]);

/**
 * Match the renderer's name cache without inventing stable source identities.
 * Undefined alone means automatic paint; callers provide valid nonempty paints.
 * This equals ECharts' truthy-paint check within the admitted product color domain.
 */
export function resolveChartSeriesColors<T>(
  entries: readonly { name: string; color?: T }[],
  palette: readonly T[],
): Array<T | undefined> {
  const names = new Map<string, T>();
  let next = 0;
  return entries.map(({ name, color }) => {
    if (color !== undefined) return color;
    if (name && names.has(name)) return names.get(name);
    const selected = palette[next++ % palette.length];
    if (name && selected !== undefined) names.set(name, selected);
    return selected;
  });
}
