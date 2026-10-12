import { normalizeImageAppearance, type ImageAppearance } from "@sheetcraft/core/workbook";
import {
  editPictureDetailedCategory,
  getPictureOwnDetailedStyle,
} from "./picture-detailed-style-edit";
import { pictureOutlineColorPatch, pictureOutlineWidthPatch } from "./picture-outline-edit";
import { createPictureLine } from "./picture-effect-edit";

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
  // Existing ribbon presets are explicit local replacements. A stale typed choice must not
  // keep masking those actions; a patch that supplies the typed category remains authoritative.
  const detailed = { ...next.detailedStyle };
  if (Object.hasOwn(patch, "border") && !Object.hasOwn(patch.detailedStyle ?? {}, "line"))
    delete detailed.line;
  if (Object.hasOwn(patch, "shadow") && !Object.hasOwn(patch.detailedStyle ?? {}, "shadow"))
    delete detailed.shadow;
  if (Object.hasOwn(patch, "reflection") && !Object.hasOwn(patch.detailedStyle ?? {}, "reflection"))
    delete detailed.reflection;
  next.detailedStyle = Object.keys(detailed).length ? detailed : undefined;
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
  if (current?.detailedStyle?.line !== undefined && edit.field !== "shadowPreset") {
    const own = getPictureOwnDetailedStyle(current)?.line;
    if (edit.field === "lineMode") {
      if (edit.value === "inherit")
        return editPictureDetailedCategory(current, { category: "line", value: undefined });
      if (edit.value === "none")
        return editPictureDetailedCategory(current, { category: "line", value: { kind: "none" } });
      if (edit.value !== "solid") throw new TypeError("Unsupported picture line mode.");
      const line = own?.kind === "value" ? own.value : createPictureLine();
      return editPictureDetailedCategory(current, {
        category: "line",
        value: {
          kind: "value",
          value: {
            ...line,
            paint:
              line.paint.kind === "solid"
                ? line.paint
                : { kind: "solid", color: { kind: "automatic" }, opacity: line.paint.opacity },
          },
        },
      });
    }
    if (own?.kind !== "value") throw new TypeError("Choose a local line before editing it.");
    if (edit.field === "lineColor")
      return patchPictureAppearance(
        current,
        pictureOutlineColorPatch(current, { kind: "rgb", rgb: edit.value }),
      );
    if (!Number.isFinite(edit.value) || edit.value < 0 || edit.value > 15)
      throw new RangeError("A local picture line width must be 0–15 points.");
    return patchPictureAppearance(current, pictureOutlineWidthPatch(current, edit.value / 0.75));
  }
  if (current?.detailedStyle?.shadow !== undefined && edit.field === "shadowPreset") {
    if (edit.value === "inherit")
      return editPictureDetailedCategory(current, { category: "shadow", value: undefined });
    if (edit.value === "none")
      return editPictureDetailedCategory(current, { category: "shadow", value: { kind: "none" } });
    if (edit.value === "soft" || edit.value === "hard")
      return patchPictureAppearance(current, { shadow: edit.value });
    throw new TypeError("Unsupported picture shadow preset.");
  }
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
