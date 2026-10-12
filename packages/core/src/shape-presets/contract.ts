import { SHAPE_PRESET_DEFAULTS, type ShapePresetName } from "./catalog.js";
import type { PictureCropShape } from "./types.js";

export function isShapePresetName(value: unknown): value is ShapePresetName {
  return typeof value === "string" && Object.hasOwn(SHAPE_PRESET_DEFAULTS, value);
}
function dataRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some((key) => typeof key !== "string") ||
    Object.values(descriptors).some((entry) => entry.get || entry.set)
  )
    throw new TypeError(`${name} cannot contain accessors or symbol fields.`);
  return value as Record<string, unknown>;
}
/** Default rectangular geometry has no extra persisted field. */
export function normalizePictureCropShape(
  value: PictureCropShape | undefined,
): PictureCropShape | undefined {
  if (value === undefined) return;
  const shape = dataRecord(value, "picture crop shape");
  if (Object.keys(shape).some((key) => key !== "preset" && key !== "adjustments"))
    throw new TypeError("Unknown picture crop shape field.");
  if (!isShapePresetName(shape.preset)) throw new TypeError("Unknown picture crop preset.");
  const defaults = SHAPE_PRESET_DEFAULTS[shape.preset];
  const source =
    shape.adjustments === undefined ? {} : dataRecord(shape.adjustments, "shape adjustments");
  if (
    Object.keys(source).length > 16 ||
    Object.keys(source).some((key) => !Object.hasOwn(defaults, key))
  )
    throw new TypeError("Unknown or excessive preset adjustment fields.");
  const adjustments: Record<string, number> = {};
  for (const name of Object.keys(defaults)) {
    const adjustment = source[name];
    if (adjustment === undefined) continue;
    if (
      typeof adjustment !== "number" ||
      !Number.isFinite(adjustment) ||
      Math.abs(adjustment) > 2_147_483_647
    )
      throw new RangeError("Preset adjustments must be finite within their coordinate budget.");
    if (adjustment !== defaults[name]) adjustments[name] = adjustment === 0 ? 0 : adjustment;
  }
  if (shape.preset === "rect") return;
  return { preset: shape.preset, ...(Object.keys(adjustments).length ? { adjustments } : {}) };
}
