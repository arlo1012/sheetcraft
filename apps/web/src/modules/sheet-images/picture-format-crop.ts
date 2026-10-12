import {
  anchorPictureFrameRect,
  pictureFrameFromLegacy,
  resolvePictureFrame,
  resolvePictureSourceLayout,
  type PictureSourceFrame,
  type ResolvedPictureLayout,
} from "@sheetcraft/core/picture-frame";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  isFramedPictureObject,
  normalizePictureObject,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import { isGroupedPicture, type GroupedPicture } from "@sheetcraft/core/picture-group";
import type { PictureCropEdit } from "@sheetcraft/core/picture-crop-edit";
import { normalizePictureProperties } from "@sheetcraft/core/picture-properties";
import type { PictureFormatField, PictureFormatValues } from "./picture-format-pane-model";

const POINTS_PER_PIXEL = 0.75;
/** Field names map units and intent only, never a visual component registry. */
const cropFields = {
  sourceWidthPt: "source-width",
  sourceHeightPt: "source-height",
  sourceOffsetXPt: "source-offset-x",
  sourceOffsetYPt: "source-offset-y",
  cropWidthPt: "crop-width",
  cropHeightPt: "crop-height",
  cropLeftPt: "crop-left",
  cropTopPt: "crop-top",
} as const;
export type PictureFormatCropField = keyof typeof cropFields;
export function isPictureFormatCropField(
  field: PictureFormatField,
): field is PictureFormatCropField {
  return Object.hasOwn(cropFields, field);
}
export function pictureFormatCropEdit(
  field: PictureFormatCropField,
  points: number,
): PictureCropEdit {
  return { field: cropFields[field], value: points / POINTS_PER_PIXEL };
}
export type PictureFormatCropState = {
  layout: ResolvedPictureLayout;
  source: PictureSourceFrame;
};
export function getPictureFormatCropState(
  picture: StandalonePictureObject | GroupedPicture,
  world: ResolvedPictureLayout | undefined,
  metrics: PictureSheetMetrics | undefined,
): PictureFormatCropState | undefined {
  if (isGroupedPicture(picture)) {
    if (!world || world.collapsed) return;
    resolvePictureSourceLayout(world.rect, world.angleDeg, picture.frame.source);
    return { layout: world, source: picture.frame.source };
  }
  if (!metrics) return;
  const frame = isFramedPictureObject(picture)
    ? picture.frame
    : pictureFrameFromLegacy(picture, metrics);
  const layout = resolvePictureFrame(frame, metrics);
  return layout.collapsed ? undefined : { layout, source: frame.source };
}
export function pictureFormatCropValues(
  state: PictureFormatCropState,
): Partial<PictureFormatValues> {
  const { rect } = state.layout,
    source = state.source;
  return {
    sourceWidthPt: rect.width * source.widthRatio * POINTS_PER_PIXEL,
    sourceHeightPt: rect.height * source.heightRatio * POINTS_PER_PIXEL,
    sourceOffsetXPt: rect.width * source.offsetXRatio * POINTS_PER_PIXEL,
    sourceOffsetYPt: rect.height * source.offsetYRatio * POINTS_PER_PIXEL,
    cropWidthPt: rect.width * POINTS_PER_PIXEL,
    cropHeightPt: rect.height * POINTS_PER_PIXEL,
    cropLeftPt: rect.x * POINTS_PER_PIXEL,
    cropTopPt: rect.y * POINTS_PER_PIXEL,
  };
}
/** Source changes preserve object metadata; legacy geometry is promoted only by a real edit. */
export function applyStandalonePictureCrop(
  picture: StandalonePictureObject,
  before: PictureFormatCropState,
  next: PictureFormatCropState,
  metrics: PictureSheetMetrics,
): StandalonePictureObject {
  if (next.layout === before.layout && next.source === before.source) return picture;
  const frame = isFramedPictureObject(picture)
    ? picture.frame
    : pictureFrameFromLegacy(picture, metrics);
  return normalizePictureObject({
    id: picture.id,
    assetId: picture.assetId,
    altText: picture.altText,
    ...normalizePictureProperties(picture),
    ...(picture.hidden === undefined ? {} : { hidden: picture.hidden }),
    ...(picture.groupId === undefined ? {} : { groupId: picture.groupId }),
    ...(picture.lockAspectRatio === undefined ? {} : { lockAspectRatio: picture.lockAspectRatio }),
    frame: {
      ...frame,
      anchor: anchorPictureFrameRect(frame.anchor.mode, next.layout.rect, metrics, frame.anchor),
      angleDeg: next.layout.angleDeg,
      source: next.source,
    },
    ...(picture.transform?.appearance || picture.transform?.annotations
      ? {
          transform: {
            ...(picture.transform.appearance ? { appearance: picture.transform.appearance } : {}),
            ...(picture.transform.annotations
              ? { annotations: picture.transform.annotations }
              : {}),
          },
        }
      : {}),
  }) as StandalonePictureObject;
}
