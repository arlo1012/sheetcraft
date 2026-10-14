import { readPictureDataArray } from "./picture-data-array.js";
import { normalizeCellNumberFormat, type CellNumberFormat } from "./style.js";

/** Sparse text choices; omission retains the chart's existing presentation. */
export type ChartTextFormat = {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
};
/** Explicit transparent means no fill/line, rather than inherited paint. */
export type ChartSurfaceFormat = { fill?: string; stroke?: string; strokeWidth?: number };
/** Axes have a line only; fill is not a meaningful axis-line choice. */
export type ChartAxisLineFormat = { stroke?: string; strokeWidth?: number };
export type ChartCategoryAxisFormat = {
  show?: boolean;
  reverse?: boolean;
  labelAngle?: number;
  title?: string;
  text?: ChartTextFormat;
  line?: ChartAxisLineFormat;
};
export type ChartValueAxisFormat = {
  show?: boolean;
  min?: number;
  max?: number;
  majorUnit?: number;
  minorUnit?: number;
  reverse?: boolean;
  title?: string;
  text?: ChartTextFormat;
  line?: ChartAxisLineFormat;
  numberFormat?: CellNumberFormat;
  linkedToSource?: boolean;
};
export type ChartSeriesFormat = {
  /** Stable source identity, including dormant sources; never a name or ordinal. */
  id: string;
  axis?: "primary" | "secondary";
  color?: string;
  strokeWidth?: number;
  smooth?: boolean;
  markers?: boolean;
};
export type ChartBarFormat = { gapWidth?: number; overlap?: number };
export type ChartFormatSettings = {
  title?: ChartTextFormat;
  plot?: ChartSurfaceFormat;
  categoryAxis?: ChartCategoryAxisFormat;
  valueAxis?: ChartValueAxisFormat;
  secondaryValueAxis?: ChartValueAxisFormat;
  /** Chart-wide percentage settings, applied separately to each value-axis group. */
  bar?: ChartBarFormat;
  series?: ChartSeriesFormat[];
};

/** Validate every descriptor before consuming any of the caller's fields. */
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Chart format requires an ordinary data record.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Chart format requires an ordinary data record.");
  for (const key of keys)
    if (key in value && !Object.hasOwn(value, key))
      throw new TypeError("Chart format requires own data fields.");
  const fields = Reflect.ownKeys(value).map((key) => {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in field))
      throw new TypeError("Chart format requires known own data fields, not accessors.");
    return { key, field };
  });
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const { key, field } of fields) {
    if (field.value === undefined)
      throw new TypeError("Chart format choices must be explicit data; omit reset fields.");
    result[key] = field.value as unknown;
  }
  return result;
}
function number(value: unknown, minimum: number, maximum: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)
    throw new RangeError(`Invalid chart ${name}.`);
  return Object.is(value, -0) ? 0 : value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new TypeError("Chart format flag must be a boolean.");
  return value;
}
function color(value: unknown): string {
  if (
    typeof value !== "string" ||
    (value !== "transparent" && !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value))
  )
    throw new RangeError("Chart color must be hex RGB/RGBA or transparent.");
  return value.toLowerCase();
}
function title(value: unknown): string {
  if (typeof value !== "string" || value.length > 1000)
    throw new RangeError("Chart axis title must be bounded text.");
  return value;
}
function text(value: unknown): ChartTextFormat {
  const source = record(value, ["fontFamily", "fontSize", "color", "bold", "italic"]);
  const result: ChartTextFormat = {};
  if (Object.hasOwn(source, "fontFamily")) {
    if (
      typeof source.fontFamily !== "string" ||
      !source.fontFamily.trim() ||
      source.fontFamily.length > 256
    )
      throw new RangeError("Chart font family must be bounded nonempty text.");
    result.fontFamily = source.fontFamily;
  }
  if (Object.hasOwn(source, "fontSize"))
    result.fontSize = number(source.fontSize, 1, 256, "font size");
  if (Object.hasOwn(source, "color")) result.color = color(source.color);
  if (Object.hasOwn(source, "bold")) result.bold = boolean(source.bold);
  if (Object.hasOwn(source, "italic")) result.italic = boolean(source.italic);
  return result;
}
function surface(value: unknown): ChartSurfaceFormat {
  const source = record(value, ["fill", "stroke", "strokeWidth"]);
  const result: ChartSurfaceFormat = {};
  if (Object.hasOwn(source, "fill")) result.fill = color(source.fill);
  if (Object.hasOwn(source, "stroke")) result.stroke = color(source.stroke);
  if (Object.hasOwn(source, "strokeWidth"))
    result.strokeWidth = number(source.strokeWidth, 0, 32, "line width");
  return result;
}
function axisLine(value: unknown): ChartAxisLineFormat {
  const source = record(value, ["stroke", "strokeWidth"]);
  const result: ChartAxisLineFormat = {};
  if (Object.hasOwn(source, "stroke")) result.stroke = color(source.stroke);
  if (Object.hasOwn(source, "strokeWidth"))
    result.strokeWidth = number(source.strokeWidth, 0, 32, "axis line width");
  return result;
}
function categoryAxis(value: unknown): ChartCategoryAxisFormat {
  const source = record(value, ["show", "reverse", "labelAngle", "title", "text", "line"]);
  const result: ChartCategoryAxisFormat = {};
  if (Object.hasOwn(source, "show")) result.show = boolean(source.show);
  if (Object.hasOwn(source, "reverse")) result.reverse = boolean(source.reverse);
  if (Object.hasOwn(source, "labelAngle"))
    result.labelAngle = number(source.labelAngle, -90, 90, "label angle");
  if (Object.hasOwn(source, "title")) result.title = title(source.title);
  if (Object.hasOwn(source, "text")) result.text = text(source.text);
  if (Object.hasOwn(source, "line")) result.line = axisLine(source.line);
  return result;
}
const numberFormatKeys = [
  "kind",
  "fractionDigits",
  "useGrouping",
  "negativeStyle",
  "locale",
  "currency",
  "currencySymbol",
  "code",
  "chineseUpperStyle",
] as const;
/** The shared number-format normalizer only receives detached, admitted data. */
function numberFormat(value: unknown): CellNumberFormat {
  const source = record(value, numberFormatKeys);
  let keys: readonly string[];
  switch (source.kind) {
    case "number":
    case "percent":
      keys = ["kind", "fractionDigits", "useGrouping", "negativeStyle", "locale"];
      break;
    case "currency":
    case "accounting":
      keys = ["kind", "currency", "currencySymbol", "fractionDigits", "negativeStyle", "locale"];
      break;
    case "date":
    case "time":
    case "fraction":
    case "custom":
      keys = ["kind", "code", "locale"];
      break;
    case "special":
      keys = ["kind", "code", "locale", "chineseUpperStyle"];
      break;
    case "scientific":
      keys = ["kind", "fractionDigits", "locale"];
      break;
    case "text":
      keys = ["kind"];
      break;
    default:
      throw new TypeError("Invalid chart number format kind.");
  }
  return normalizeCellNumberFormat(record(source, keys) as CellNumberFormat);
}
function valueAxis(value: unknown): ChartValueAxisFormat {
  const source = record(value, [
    "show",
    "min",
    "max",
    "majorUnit",
    "minorUnit",
    "reverse",
    "title",
    "text",
    "line",
    "numberFormat",
    "linkedToSource",
  ]);
  const result: ChartValueAxisFormat = {};
  if (Object.hasOwn(source, "show")) result.show = boolean(source.show);
  if (Object.hasOwn(source, "min"))
    result.min = number(source.min, -Number.MAX_VALUE, Number.MAX_VALUE, "axis minimum");
  if (Object.hasOwn(source, "max"))
    result.max = number(source.max, -Number.MAX_VALUE, Number.MAX_VALUE, "axis maximum");
  if (result.min !== undefined && result.max !== undefined && result.min >= result.max)
    throw new RangeError("Chart axis minimum must be less than maximum.");
  for (const key of ["majorUnit", "minorUnit"] as const)
    if (Object.hasOwn(source, key)) {
      const unit = number(source[key], 0, Number.MAX_VALUE, "axis unit");
      if (unit <= 0) throw new RangeError("Chart axis units must be positive.");
      result[key] = unit;
    }
  if (result.min !== undefined && result.max !== undefined) {
    const span = result.max - result.min;
    if (!Number.isFinite(span) || span <= 0)
      throw new RangeError("Chart axis bounds require a finite positive span.");
    for (const unit of [result.majorUnit, result.minorUnit]) {
      if (unit === undefined) continue;
      const intervals = span / unit;
      if (!Number.isFinite(intervals) || Math.ceil(intervals) + 1 > 2048)
        throw new RangeError("Chart axis interval exceeds the 2048-tick budget.");
    }
  }
  if (result.majorUnit !== undefined && result.minorUnit !== undefined) {
    const split = result.majorUnit / result.minorUnit;
    if (
      !Number.isFinite(split) ||
      split < 1 ||
      split > 100 ||
      Math.abs(split - Math.round(split)) > Number.EPSILON * 16 * Math.max(1, split)
    )
      throw new RangeError(
        "Chart minor unit must evenly divide the major unit into at most 100 parts.",
      );
  }
  if (Object.hasOwn(source, "reverse")) result.reverse = boolean(source.reverse);
  if (Object.hasOwn(source, "title")) result.title = title(source.title);
  if (Object.hasOwn(source, "text")) result.text = text(source.text);
  if (Object.hasOwn(source, "line")) result.line = axisLine(source.line);
  if (Object.hasOwn(source, "numberFormat"))
    result.numberFormat = numberFormat(source.numberFormat);
  if (Object.hasOwn(source, "linkedToSource"))
    result.linkedToSource = boolean(source.linkedToSource);
  return result;
}
function series(value: unknown): ChartSeriesFormat[] {
  const entries = readPictureDataArray(value as readonly unknown[], "chart series formats", 256);
  const ids = new Set<string>();
  return entries.map((entry) => {
    const source = record(entry, ["id", "axis", "color", "strokeWidth", "smooth", "markers"]);
    if (
      typeof source.id !== "string" ||
      !source.id.trim() ||
      source.id.length > 128 ||
      ids.has(source.id)
    )
      throw new RangeError("Chart series formats require unique bounded stable IDs.");
    ids.add(source.id);
    const result: ChartSeriesFormat = { id: source.id };
    if (Object.hasOwn(source, "axis")) {
      if (source.axis !== "primary" && source.axis !== "secondary")
        throw new RangeError("Invalid chart series value axis.");
      result.axis = source.axis;
    }
    if (Object.hasOwn(source, "color")) result.color = color(source.color);
    if (Object.hasOwn(source, "strokeWidth"))
      result.strokeWidth = number(source.strokeWidth, 0, 32, "series line width");
    if (Object.hasOwn(source, "smooth")) result.smooth = boolean(source.smooth);
    if (Object.hasOwn(source, "markers")) result.markers = boolean(source.markers);
    return result;
  });
}
/** Validate and detach sparse common-format settings without mutating source values. */
export function normalizeChartFormat(value: unknown): ChartFormatSettings {
  const source = record(value, [
    "title",
    "plot",
    "categoryAxis",
    "valueAxis",
    "secondaryValueAxis",
    "bar",
    "series",
  ]);
  const result: ChartFormatSettings = {};
  if (Object.hasOwn(source, "title")) result.title = text(source.title);
  if (Object.hasOwn(source, "plot")) result.plot = surface(source.plot);
  if (Object.hasOwn(source, "categoryAxis"))
    result.categoryAxis = categoryAxis(source.categoryAxis);
  if (Object.hasOwn(source, "valueAxis")) result.valueAxis = valueAxis(source.valueAxis);
  if (Object.hasOwn(source, "secondaryValueAxis"))
    result.secondaryValueAxis = valueAxis(source.secondaryValueAxis);
  if (Object.hasOwn(source, "bar")) {
    const layout = record(source.bar, ["gapWidth", "overlap"]);
    result.bar = {};
    if (Object.hasOwn(layout, "gapWidth"))
      result.bar.gapWidth = number(layout.gapWidth, 0, 500, "bar gap width");
    if (Object.hasOwn(layout, "overlap"))
      result.bar.overlap = number(layout.overlap, -100, 100, "bar overlap");
  }
  if (Object.hasOwn(source, "series")) result.series = series(source.series);
  return result;
}
