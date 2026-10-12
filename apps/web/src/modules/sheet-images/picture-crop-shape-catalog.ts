import {
  evaluateShapePreset,
  flattenShapePath,
  shapePresetPathToSvg,
  SHAPE_PRESET_FILLED_NAMES,
  type PictureCropShape,
  type ShapePresetName,
} from "@sheetcraft/core/shape-presets";

import {
  SHAPE_PRESET_GALLERY as PICTURE_CROP_SHAPE_GALLERY,
  type ShapeGalleryLocale as PictureCropShapeLocale,
} from "../../shared/shape-presets/shape-gallery-data";

export {
  SHAPE_PRESET_GALLERY as PICTURE_CROP_SHAPE_GALLERY,
  type ShapeGalleryLocale as PictureCropShapeLocale,
  type ShapeGalleryLabel as PictureCropShapeLabel,
  type ShapePresetGalleryChoice as PictureCropShapeChoice,
  type ShapePresetGalleryCategory as PictureCropShapeCategory,
  type ShapePresetGalleryGroup as PictureCropShapeGroup,
} from "../../shared/shape-presets/shape-gallery-data";

export type PictureCropShapeMenuLabels = Readonly<{
  trigger: string;
  applyRejected: string;
}>;

export const PICTURE_CROP_SHAPE_MENU_LABELS: Readonly<
  Record<PictureCropShapeLocale, PictureCropShapeMenuLabels>
> = {
  "en-US": {
    trigger: "Crop to Shape",
    applyRejected: "Couldn’t apply this shape. Try again.",
  },
  "zh-CN": {
    trigger: "裁剪为形状",
    applyRejected: "无法应用此形状，请重试。",
  },
};

const galleryPresets = new Set<ShapePresetName>(
  PICTURE_CROP_SHAPE_GALLERY.flatMap((group) => group.items.map((item) => item.preset)),
);
const filledPresets = new Set<ShapePresetName>(SHAPE_PRESET_FILLED_NAMES);

/** Rectangle clears only the mask; it does not reset picture size or crop. */
export function pictureCropShapeChoiceValue(preset: ShapePresetName): PictureCropShape | undefined {
  if (!galleryPresets.has(preset) || !filledPresets.has(preset))
    throw new TypeError("This preset is not a picture crop gallery choice.");
  return preset === "rect" ? undefined : { preset };
}

export type PictureCropShapePreview = Readonly<{
  viewBox: string;
  paths: readonly Readonly<{ d: string; filled: boolean; stroke: boolean }>[];
}>;
const previews = new Map<ShapePresetName, PictureCropShapePreview>();

/** Numeric SVG paths from the public geometry API, with no external image assets. */
export function pictureCropShapePreview(preset: ShapePresetName): PictureCropShapePreview {
  const cached = previews.get(preset);
  if (cached) return cached;
  const geometry = evaluateShapePreset(pictureCropShapeChoiceValue(preset), 32, 24);
  let left = 0,
    top = 0,
    right = 32,
    bottom = 24;
  for (const path of geometry.paths) {
    for (const contour of flattenShapePath(path)) {
      for (const point of contour.points) {
        left = Math.min(left, point.x);
        top = Math.min(top, point.y);
        right = Math.max(right, point.x);
        bottom = Math.max(bottom, point.y);
      }
    }
  }
  // Fit callout tails as well as filled paths; leave space for the own preview stroke.
  const preview: PictureCropShapePreview = {
    viewBox: [left - 1.5, top - 1.5, right - left + 3, bottom - top + 3]
      .map((value) => String(Number(value.toPrecision(10))))
      .join(" "),
    paths: geometry.paths.map((path) => ({
      d: shapePresetPathToSvg(path),
      filled: path.filled,
      stroke: path.stroke,
    })),
  };
  previews.set(preset, preview);
  return preview;
}
