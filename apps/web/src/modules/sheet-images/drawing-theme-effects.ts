import type { ImageAppearance } from "@sheetcraft/core/workbook";

/**
 * The theme effects which can be represented faithfully by a raster drawing
 * surface. Theme gradients describe a drawing's fill, so they deliberately do
 * not alter a photo's pixels.
 */
export type DrawingThemeEffects = Readonly<{
  shadow: "none" | "soft" | "hard";
  reflection: boolean;
  bevel: boolean;
  outlineWidth: number;
  gradient: boolean;
}>;

type WorkbookThemeWithEffects = Readonly<{
  effects?: DrawingThemeEffects;
}>;

export function getDrawingThemeEffects(
  theme: WorkbookThemeWithEffects | undefined,
): DrawingThemeEffects | undefined {
  const effects = theme?.effects;
  if (!effects) return undefined;
  return effects;
}

export function hasVisibleDrawingThemeEffects(effects: DrawingThemeEffects | undefined): boolean {
  return Boolean(
    effects &&
    (effects.shadow !== "none" || effects.reflection || effects.bevel || effects.outlineWidth > 0),
  );
}

/** Resolve each real picture separately; a flag suppresses inheritance, never its own styling. */
export function resolvePictureThemeEffects(
  appearance: ImageAppearance | undefined,
  inherited: DrawingThemeEffects | undefined,
): DrawingThemeEffects | undefined {
  const flags = appearance?.suppressThemeEffects;
  if (!inherited || !flags) return inherited;
  return {
    ...inherited,
    shadow: flags.shadow ? "none" : inherited.shadow,
    outlineWidth: flags.outline ? 0 : inherited.outlineWidth,
    reflection: flags.reflection ? false : inherited.reflection,
    bevel: flags.bevel ? false : inherited.bevel,
  };
}
