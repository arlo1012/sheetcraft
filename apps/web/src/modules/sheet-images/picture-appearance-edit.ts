import { normalizeImageAppearance, type ImageAppearance } from "@sheetcraft/core/workbook";

/** Picture Reset is an explicit clear, including the application's inherited effects. */
export function resetPictureAppearance(): ImageAppearance {
  return { suppressThemeEffects: { shadow: true, outline: true, reflection: true, bevel: true } };
}

/** Own-style patches preserve unrelated sparse inheritance choices. */
export function patchPictureAppearance(
  current: ImageAppearance | undefined,
  patch: Partial<ImageAppearance>,
): ImageAppearance | undefined {
  const next = { ...current, ...patch };
  if (patch.suppressThemeEffects)
    next.suppressThemeEffects = { ...current?.suppressThemeEffects, ...patch.suppressThemeEffects };
  const suppression = { ...next.suppressThemeEffects };
  if (Object.hasOwn(patch, "border") && (!patch.border || patch.border.width === 0)) {
    delete next.border;
    suppression.outline = true;
  }
  if (Object.hasOwn(patch, "shadow") && patch.shadow === undefined) suppression.shadow = true;
  if (Object.hasOwn(patch, "reflection") && patch.reflection !== true)
    suppression.reflection = true;
  next.suppressThemeEffects = suppression;
  return normalizeImageAppearance(next);
}

export type PictureOwnAppearanceEdit =
  | { field: "lineMode"; value: "inherit" | "none" | "solid" }
  | { field: "lineColor"; value: string }
  | { field: "lineWidthPt"; value: number }
  | { field: "shadowPreset"; value: "inherit" | "none" | "soft" | "hard" };

/** These edits describe only already-rendered own borders/shadow presets. */
export function editPictureOwnAppearance(
  current: ImageAppearance | undefined,
  edit: PictureOwnAppearanceEdit,
): ImageAppearance | undefined {
  const next = { ...current },
    suppression = { ...current?.suppressThemeEffects };
  if (edit.field === "lineMode") {
    if (edit.value === "inherit") {
      delete next.border;
      delete suppression.outline;
    } else if (edit.value === "none") {
      delete next.border;
      suppression.outline = true;
    } else if (edit.value === "solid") {
      if (!next.border) {
        next.border = { color: "#000000", width: 1 };
        suppression.outline = true; // An explicit local line replaces, rather than copies, a theme line.
      }
    } else throw new TypeError("Unsupported picture line mode.");
  } else if (edit.field === "lineColor") {
    if (!next.border) throw new TypeError("Choose a local line before editing its color.");
    next.border = { ...next.border, color: edit.value };
  } else if (edit.field === "lineWidthPt") {
    if (!next.border || !Number.isFinite(edit.value) || edit.value < 0 || edit.value > 15)
      throw new RangeError("A local picture line width must be 0–15 points.");
    if (edit.value === 0) {
      delete next.border;
      suppression.outline = true;
    } else next.border = { ...next.border, width: edit.value / 0.75 };
  } else if (edit.field === "shadowPreset") {
    if (edit.value === "inherit") {
      delete next.shadow;
      delete suppression.shadow;
    } else if (edit.value === "none") {
      delete next.shadow;
      suppression.shadow = true;
    } else if (edit.value === "soft" || edit.value === "hard") next.shadow = edit.value;
    else throw new TypeError("Unsupported picture shadow preset.");
  } else throw new TypeError("Unsupported picture appearance edit.");
  next.suppressThemeEffects = suppression;
  return normalizeImageAppearance(next);
}
