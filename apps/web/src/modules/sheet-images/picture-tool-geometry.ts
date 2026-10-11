import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isPictureGroup } from "@sheetcraft/core";
import { requireStandalonePicture } from "./picture-document-support";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import {
  cloneFloatingImage,
  MIN_FLOATING_IMAGE_SIZE,
  MAX_FLOATING_IMAGE_SIZE,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import { resizeFramedPictureTo } from "@sheetcraft/sheet-engine";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";

/** Display-only local dimensions; never persist a derived rectangle on a picture. */
export type PictureToolGeometry = { width: number; height: number; angleDeg: number };
export type PictureSizeEdit = { axis: "width" | "height"; value: number };

export function getPictureToolGeometry(
  image: FloatingImage,
  context?: PictureFrameLayoutContext,
): PictureToolGeometry | undefined {
  if (isPictureGroup(image)) return undefined;
  if (!isFramedPictureObject(image))
    return { width: image.width, height: image.height, angleDeg: image.transform?.rotation ?? 0 };
  if (!context) return undefined;
  const resolved = resolvePictureFrame(image.frame, context.metrics);
  return resolved.collapsed
    ? undefined
    : { width: resolved.rect.width, height: resolved.rect.height, angleDeg: resolved.angleDeg };
}

export function resizePictureTo(
  image: FloatingImage,
  edit: PictureSizeEdit,
  context?: PictureFrameLayoutContext,
): FloatingImage | null {
  image = requireStandalonePicture(image);
  if (
    (edit.axis !== "width" && edit.axis !== "height") ||
    !Number.isFinite(edit.value) ||
    edit.value < MIN_FLOATING_IMAGE_SIZE ||
    edit.value > MAX_FLOATING_IMAGE_SIZE
  )
    throw new RangeError("Invalid picture size.");
  if (isFramedPictureObject(image)) {
    if (!context) throw new Error("Current worksheet frame geometry is required.");
    return resizeFramedPictureTo(image, edit, context.metrics);
  }
  const next = cloneFloatingImage(image);
  const other = edit.axis === "width" ? "height" : "width";
  next[edit.axis] = edit.value;
  if (image.lockAspectRatio !== false) next[other] = (image[other] * edit.value) / image[edit.axis];
  if (
    [next.width, next.height].some(
      (value) =>
        !Number.isFinite(value) ||
        value < MIN_FLOATING_IMAGE_SIZE ||
        value > MAX_FLOATING_IMAGE_SIZE,
    )
  )
    throw new RangeError("Invalid picture size.");
  return next;
}
