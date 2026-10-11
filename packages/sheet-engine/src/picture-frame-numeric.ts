import { MAX_FLOATING_IMAGE_SIZE, MIN_FLOATING_IMAGE_SIZE } from "@sheetcraft/core/workbook";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import {
  clonePictureObject,
  isFramedPictureObject,
  type FramedFloatingImage,
} from "@sheetcraft/core/picture-object";
import { resizeFramedPictureBy, rotateFramedPictureBy } from "./picture-frame-layout.js";

/** One explicit local axis is the source of an aspect-locked numeric edit. */
export type FramedPictureNumericSizeEdit = {
  axis: "width" | "height";
  value: number;
};

function validateDimension(value: number): void {
  if (!Number.isFinite(value) || value < MIN_FLOATING_IMAGE_SIZE || value > MAX_FLOATING_IMAGE_SIZE)
    throw new RangeError(
      `Picture numeric size must be ${MIN_FLOATING_IMAGE_SIZE}–${MAX_FLOATING_IMAGE_SIZE} pixels.`,
    );
}

function proportionalDimension(value: number, scale: number): number {
  const scaled = value * scale;
  // Reciprocal multiplication can put an exact boundary a few ulps outside
  // the edit budget (49 * (1 / 49) < 1). Repair only that arithmetic rounding.
  const min = MIN_FLOATING_IMAGE_SIZE,
    max = MAX_FLOATING_IMAGE_SIZE;
  if (scaled < min && min - scaled <= Number.EPSILON * min * 4) return min;
  if (scaled > max && scaled - max <= Number.EPSILON * max * 4) return max;
  return scaled;
}

function cloneFramedImage(image: FramedFloatingImage): FramedFloatingImage {
  if (!image || typeof image !== "object" || !isFramedPictureObject(image))
    throw new TypeError("Numeric picture editing requires a framed picture.");
  return clonePictureObject(image);
}

/**
 * Sets a local crop-frame dimension while fixing the rotated local top-left.
 * A stored aspect lock (also the default when absent) scales the other local
 * dimension using the current frame, never the uncropped source dimensions.
 * Invalid edits, including a locked counterpart outside 1–10000, throw rather
 * than clamp. A collapsed frame returns null. The input is never mutated.
 */
export function resizeFramedPictureTo(
  image: FramedFloatingImage,
  edit: FramedPictureNumericSizeEdit,
  metrics: PictureSheetMetrics,
): FramedFloatingImage | null {
  if (
    !edit ||
    typeof edit !== "object" ||
    Array.isArray(edit) ||
    Object.keys(edit).some((key) => key !== "axis" && key !== "value") ||
    (edit.axis !== "width" && edit.axis !== "height")
  )
    throw new TypeError("Numeric picture size requires one explicit width or height axis.");
  validateDimension(edit.value);
  const original = cloneFramedImage(image);
  const geometry = resolvePictureFrame(original.frame, metrics);
  if (geometry.collapsed) return null;
  const rect = geometry.rect;
  const scale = edit.value / rect[edit.axis];
  const width =
    edit.axis === "width"
      ? edit.value
      : original.lockAspectRatio !== false
        ? proportionalDimension(rect.width, scale)
        : rect.width;
  const height =
    edit.axis === "height"
      ? edit.value
      : original.lockAspectRatio !== false
        ? proportionalDimension(rect.height, scale)
        : rect.height;
  validateDimension(width);
  validateDimension(height);
  if (width === rect.width && height === rect.height) return original;

  const dx = width - rect.width,
    dy = height - rect.height;
  const angle = (geometry.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  return resizeFramedPictureBy(
    original,
    "se",
    { x: cos * dx - sin * dy, y: sin * dx + cos * dy },
    metrics,
    { preserveCornerRatio: false },
  );
}

/** Sets an absolute finite angle about the unchanged layout center; collapsed frames return null. */
export function rotateFramedPictureTo(
  image: FramedFloatingImage,
  angleDeg: number,
  metrics: PictureSheetMetrics,
): FramedFloatingImage | null {
  if (!Number.isFinite(angleDeg)) throw new RangeError("Picture numeric rotation must be finite.");
  const original = cloneFramedImage(image);
  const geometry = resolvePictureFrame(original.frame, metrics);
  if (geometry.collapsed) return null;
  const remainder = angleDeg % 360;
  const normalized = remainder < 0 ? (remainder + 360) % 360 : remainder === 0 ? 0 : remainder;
  if (normalized === geometry.angleDeg) return original;
  return rotateFramedPictureBy(original, normalized - geometry.angleDeg, metrics);
}
