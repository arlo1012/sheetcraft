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
};

export function normalizeImageAppearance(
  value: ImageAppearance | undefined,
): ImageAppearance | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid image appearance.");
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
    if (!/^#[\da-f]{6}$/i.test(value.transparentColor))
      throw new TypeError("Invalid image transparent color.");
    result.transparentColor = value.transparentColor.toUpperCase();
  }
  if (result.transparentTolerance !== undefined && !result.transparentColor)
    throw new TypeError("Transparent tolerance requires a color.");
  if (value.border !== undefined) {
    if (
      !value.border ||
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
  return Object.keys(result).length ? result : undefined;
}
