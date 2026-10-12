import {
  type PictureMaterialId,
  type PictureLightingId,
  normalizeDetailedPictureStyle,
  type PictureDetailedStyle,
} from "@sheetcraft/core/picture-detailed-style";
import { PICTURE_MATERIAL_LABELS, PICTURE_LIGHTING_LABELS } from "./picture-effect-options";
import { createPictureFormat3d, createPictureRotation3d } from "./picture-effect-edit";
import type { PictureFormatLabelKey } from "./picture-format-pane-model";
import type { PicturePresetGalleryGroup } from "./picture-preset-gallery-model";
function sample(patch: Partial<ReturnType<typeof createPictureFormat3d>>): PictureDetailedStyle {
  return normalizeDetailedPictureStyle({
    format3d: { kind: "value", value: { ...createPictureFormat3d(), depthPt: 4, ...patch } },
    rotation3d: {
      kind: "value",
      value: { ...createPictureRotation3d(), projection: "parallel", xDeg: 30, yDeg: 335, zDeg: 0 },
    },
  })!;
}
function materials(
  labelKey: PictureFormatLabelKey,
  ids: readonly PictureMaterialId[],
): PicturePresetGalleryGroup {
  return {
    labelKey,
    items: ids.map((id) => ({
      id,
      labelKey: PICTURE_MATERIAL_LABELS[id],
      previewStyle: sample({ material: id }),
    })),
  };
}
function lighting(
  labelKey: PictureFormatLabelKey,
  ids: readonly PictureLightingId[],
): PicturePresetGalleryGroup {
  return {
    labelKey,
    items: ids.map((id) => ({
      id,
      labelKey: PICTURE_LIGHTING_LABELS[id],
      previewStyle: sample({ lighting: id }),
    })),
  };
}
export const PICTURE_MATERIAL_GALLERY: readonly PicturePresetGalleryGroup[] = [
  materials("materialStandard", ["matte", "warm-matte", "plastic", "metal"]),
  materials("materialSpecial", ["dark-edge", "soft-edge", "flat", "wire-frame"]),
  materials("materialTranslucent", ["powder", "translucent-powder", "clear"]),
];
/** Category layout is observed; individual lighting names and numeric values are this product's public/own presets. */
export const PICTURE_LIGHTING_GALLERY: readonly PicturePresetGalleryGroup[] = [
  lighting("lightingNeutral", ["three-point", "balanced", "soft", "harsh", "flood", "contrasting"]),
  lighting("lightingWarm", ["morning", "sunrise", "sunset"]),
  lighting("lightingCool", ["chilly", "freezing"]),
  lighting("lightingSpecial", ["flat", "two-point", "glow", "bright-room"]),
];
