import {
  normalizeDetailedPictureStyle,
  type PictureDetailedStyle,
} from "./picture-detailed-style.js";

/** Explicitly disables selected inherited theme effects; omitted flags still inherit. */
export type ImageThemeEffectSuppression = {
  shadow?: true;
  outline?: true;
  reflection?: true;
  bevel?: true;
};

/** Non-destructive picture styling shared by cell and floating images. */
export type ImageAppearance = {
  opacity?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  grayscale?: number;
  sepia?: number;
  transparentColor?: string;
  transparentTolerance?: number;
  border?: { color: string; width: number };
  shadow?: "soft" | "hard";
  reflection?: boolean;
  suppressThemeEffects?: ImageThemeEffectSuppression;
  /** V50 typed categories; absent categories retain all established legacy/theme behavior. */
  detailedStyle?: PictureDetailedStyle;
};

function normalizeDetailedStyleField(
  appearance: ImageAppearance,
): PictureDetailedStyle | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(appearance, "detailedStyle");
  if (!descriptor) {
    if ("detailedStyle" in appearance)
      throw new TypeError("Detailed picture style must be an own data field.");
    return undefined;
  }
  if (!("value" in descriptor))
    throw new TypeError("Detailed picture style must be a data field, not an accessor.");
  return normalizeDetailedPictureStyle(descriptor.value);
}

function normalizeThemeEffectSuppression(
  appearance: ImageAppearance,
): ImageThemeEffectSuppression | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(appearance, "suppressThemeEffects");
  if (!descriptor) {
    if ("suppressThemeEffects" in appearance)
      throw new TypeError("Image theme effect suppression must be an own data field.");
    return undefined;
  }
  if (!("value" in descriptor))
    throw new TypeError("Image theme effect suppression must be a data field, not an accessor.");
  const value: unknown = descriptor.value;
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid image theme effect suppression.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Image theme effect suppression must be an ordinary data record.");
  const keys = ["shadow", "outline", "reflection", "bevel"] as const;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key as (typeof keys)[number]))
      throw new TypeError("Unknown image theme effect suppression field.");
    const flag = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in flag))
      throw new TypeError("Image theme effect suppression flags must be data fields.");
    if (flag.value !== true)
      throw new TypeError("Image theme effect suppression flags must be explicitly true.");
  }
  const result: ImageThemeEffectSuppression = {};
  // A fixed order keeps transform equality independent of caller property order.
  for (const key of keys) if (Object.hasOwn(value, key)) result[key] = true;
  return Object.keys(result).length ? result : undefined;
}

export function normalizeImageAppearance(
  value: ImageAppearance | undefined,
): ImageAppearance | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid image appearance.");
  const suppressThemeEffects = normalizeThemeEffectSuppression(value);
  const detailedStyle = normalizeDetailedStyleField(value);
  const result: ImageAppearance = {};
  const bounds = {
    opacity: [0, 1, 1],
    brightness: [0, 2, 1],
    contrast: [0, 2, 1],
    saturation: [0, 2, 1],
    grayscale: [0, 1, 0],
    sepia: [0, 1, 0],
    transparentTolerance: [0, 255, 0],
  } as const;
  for (const key of Object.keys(bounds) as Array<keyof typeof bounds>) {
    const number = value[key];
    if (number === undefined) continue;
    const [min, max, initial] = bounds[key];
    if (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max)
      throw new RangeError(`Invalid image ${key}.`);
    if (number !== initial) result[key] = number;
  }
  if (value.transparentColor !== undefined) {
    if (
      typeof value.transparentColor !== "string" ||
      !/^#[\da-f]{6}$/i.test(value.transparentColor)
    )
      throw new TypeError("Invalid image transparent color.");
    result.transparentColor = value.transparentColor.toUpperCase();
  }
  if (result.transparentTolerance !== undefined && !result.transparentColor)
    throw new TypeError("Transparent tolerance requires a color.");
  if (value.border !== undefined) {
    if (
      !value.border ||
      typeof value.border.color !== "string" ||
      !/^#[\da-f]{6}$/i.test(value.border.color) ||
      !Number.isFinite(value.border.width) ||
      value.border.width < 0 ||
      value.border.width > 20
    )
      throw new TypeError("Invalid image border.");
    if (value.border.width)
      result.border = { color: value.border.color.toUpperCase(), width: value.border.width };
  }
  if (value.shadow !== undefined) {
    if (value.shadow !== "soft" && value.shadow !== "hard")
      throw new TypeError("Invalid image shadow.");
    result.shadow = value.shadow;
  }
  if (value.reflection !== undefined && typeof value.reflection !== "boolean")
    throw new TypeError("Invalid image reflection.");
  if (value.reflection) result.reflection = true;
  if (suppressThemeEffects) result.suppressThemeEffects = suppressThemeEffects;
  if (detailedStyle) result.detailedStyle = detailedStyle;
  return Object.keys(result).length ? result : undefined;
}
