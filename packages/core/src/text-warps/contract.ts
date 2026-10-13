import { TEXT_WARP_PRESET_DEFAULTS, type TextWarpPresetName } from "./catalog.js";
import type { ShapeTextWarp } from "./types.js";

export function isTextWarpPresetName(value: unknown): value is TextWarpPresetName {
  return typeof value === "string" && Object.hasOwn(TEXT_WARP_PRESET_DEFAULTS, value);
}

function dataFields(value: unknown, name: string): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary own-data record.`);
  const fields = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some((key) => typeof key !== "string") ||
    Object.values(fields).some((field) => !Object.hasOwn(field, "value"))
  )
    throw new TypeError(`${name} cannot contain accessors or symbol fields.`);
  return fields;
}

/** Canonical None is absence; textPlain remains active even at its default. */
export function normalizeShapeTextWarp(
  value: ShapeTextWarp | undefined,
): ShapeTextWarp | undefined {
  if (value === undefined) return;
  const fields = dataFields(value, "text warp");
  if (Object.keys(fields).some((key) => key !== "preset" && key !== "adjustments"))
    throw new TypeError("Unknown text warp field.");
  const preset: unknown = Object.hasOwn(fields, "preset") ? fields.preset!.value : undefined;
  if (!isTextWarpPresetName(preset)) throw new TypeError("Unknown text warp preset.");
  const defaults = TEXT_WARP_PRESET_DEFAULTS[preset];
  const rawAdjustments: unknown = Object.hasOwn(fields, "adjustments")
    ? fields.adjustments!.value
    : undefined;
  const source: Record<string, PropertyDescriptor> =
    rawAdjustments === undefined ? {} : dataFields(rawAdjustments, "text warp adjustments");
  if (
    Object.keys(source).length > 2 ||
    Object.keys(source).some((key) => !Object.hasOwn(defaults, key))
  )
    throw new TypeError("Unknown or excessive text warp adjustment fields.");
  const adjustments: Record<string, number> = {};
  for (const name of Object.keys(defaults)) {
    if (!Object.hasOwn(source, name)) continue;
    const adjustment: unknown = source[name]!.value;
    if (
      typeof adjustment !== "number" ||
      !Number.isFinite(adjustment) ||
      Math.abs(adjustment) > 2_147_483_647
    )
      throw new RangeError("Text warp adjustments must be finite within their storage budget.");
    if (adjustment !== defaults[name]) adjustments[name] = adjustment === 0 ? 0 : adjustment;
  }
  return { preset, ...(Object.keys(adjustments).length ? { adjustments } : {}) };
}
