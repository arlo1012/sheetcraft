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
