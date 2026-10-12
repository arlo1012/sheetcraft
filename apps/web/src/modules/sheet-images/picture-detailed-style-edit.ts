import { normalizeImageAppearance, type ImageAppearance } from "@sheetcraft/core/workbook";
import {
  normalizeDetailedPictureStyle,
  type PictureDetailedStyle,
} from "@sheetcraft/core/picture-detailed-style";
import { resolvePictureDetailedPaintStyle } from "../../shared/images/picture-detailed-paint-style";

export const PICTURE_DETAILED_CATEGORIES = [
  "fill",
  "line",
  "shadow",
  "reflection",
  "glow",
  "softEdges",
  "format3d",
  "rotation3d",
] as const;
export type PictureDetailedCategory = (typeof PICTURE_DETAILED_CATEGORIES)[number];
export type PictureDetailedCategoryEdit = {
  [K in PictureDetailedCategory]: { category: K; value: PictureDetailedStyle[K] | undefined };
}[PictureDetailedCategory];

/** Reads a real local choice. Legacy local decorations are not mislabeled as inherited. */
export function getPictureOwnDetailedStyle(
  appearance: ImageAppearance | undefined,
): PictureDetailedStyle | undefined {
  const canonical = normalizeImageAppearance(appearance);
  if (!canonical) return;
  const seed = canonical.detailedStyle ?? {};
  const result = resolvePictureDetailedPaintStyle(
    { ...canonical, detailedStyle: { fill: { kind: "none" }, ...seed } },
    undefined,
  )!.style;
  if (seed.fill === undefined) delete result.fill;
  const suppression = canonical.suppressThemeEffects;
  if (suppression?.outline && result.line === undefined) result.line = { kind: "none" };
  if (suppression?.shadow && result.shadow === undefined) result.shadow = { kind: "none" };
  if (suppression?.reflection && result.reflection === undefined)
    result.reflection = { kind: "none" };
  if (suppression?.bevel && result.format3d === undefined) result.format3d = { kind: "none" };
  return normalizeDetailedPictureStyle(result);
}

/** Exactly one category changes. Inherit clears the corresponding legacy decoration and policy. */
export function editPictureDetailedCategory(
  appearance: ImageAppearance | undefined,
  edit: PictureDetailedCategoryEdit,
): ImageAppearance | undefined {
  if (!PICTURE_DETAILED_CATEGORIES.includes(edit.category))
    throw new TypeError("Unknown detailed picture category.");
  const current = normalizeImageAppearance(appearance) ?? {};
  const style = { ...current.detailedStyle };
  const flags = { ...current.suppressThemeEffects };
  if (edit.value === undefined) delete style[edit.category];
  else {
    const single = normalizeDetailedPictureStyle({ [edit.category]: edit.value });
    if (!single || single[edit.category] === undefined)
      throw new TypeError("Missing detailed picture choice.");
    Object.assign(style, single);
  }
  if (edit.category === "line") {
    delete current.border;
    if (edit.value === undefined) delete flags.outline;
    else flags.outline = true;
  } else if (edit.category === "shadow") {
    delete current.shadow;
    if (edit.value === undefined) delete flags.shadow;
  } else if (edit.category === "reflection") {
    delete current.reflection;
    if (edit.value === undefined) delete flags.reflection;
  } else if (edit.category === "format3d" && edit.value === undefined) delete flags.bevel;
  current.detailedStyle = normalizeDetailedPictureStyle(style);
  current.suppressThemeEffects = Object.keys(flags).length ? flags : undefined;
  return normalizeImageAppearance(current);
}
