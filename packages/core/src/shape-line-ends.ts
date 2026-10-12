import type { ShapePresetName } from "./shape-presets/catalog.js";
export type ShapeLineEndKind = "triangle" | "open" | "stealth" | "diamond" | "oval";
export type ShapeLineEndDimension = "small" | "medium" | "large";
export type ShapeLineEnd = {
  kind: ShapeLineEndKind;
  width?: ShapeLineEndDimension;
  length?: ShapeLineEndDimension;
};
export type ShapeLineEnds = { begin?: ShapeLineEnd; end?: ShapeLineEnd };
const kinds = new Set(["triangle", "open", "stealth", "diamond", "oval"]);
const dimensions = new Set(["small", "medium", "large"]);
const presets = new Set([
  "line",
  "lineInv",
  "bentConnector2",
  "bentConnector3",
  "bentConnector4",
  "bentConnector5",
  "curvedConnector2",
  "curvedConnector3",
  "curvedConnector4",
  "curvedConnector5",
]);
export function isShapeLinePreset(preset: ShapePresetName): boolean {
  return presets.has(preset);
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid shape line end.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Shape line ends must be plain records.");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError("Unknown shape line-end field.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (descriptor.get || descriptor.set)
      throw new TypeError("Shape line ends cannot be accessors.");
  }
  return value as Record<string, unknown>;
}
function normalizeEnd(value: unknown): ShapeLineEnd | undefined {
  if (value === undefined) return;
  const raw = record(value, ["kind", "width", "length"]);
  if (typeof raw.kind !== "string" || !kinds.has(raw.kind))
    throw new RangeError("Invalid shape line-end kind.");
  for (const key of ["width", "length"])
    if (
      raw[key] !== undefined &&
      (typeof raw[key] !== "string" || !dimensions.has(raw[key] as string))
    )
      throw new RangeError("Invalid shape line-end size.");
  return {
    kind: raw.kind as ShapeLineEndKind,
    ...(raw.width !== undefined && raw.width !== "medium"
      ? { width: raw.width as ShapeLineEndDimension }
      : {}),
    ...(raw.length !== undefined && raw.length !== "medium"
      ? { length: raw.length as ShapeLineEndDimension }
      : {}),
  };
}
export function normalizeShapeLineEnds(value: unknown): ShapeLineEnds | undefined {
  if (value === undefined) return;
  const raw = record(value, ["begin", "end"]);
  const begin = normalizeEnd(raw.begin),
    end = normalizeEnd(raw.end);
  return begin || end ? { ...(begin ? { begin } : {}), ...(end ? { end } : {}) } : undefined;
}
