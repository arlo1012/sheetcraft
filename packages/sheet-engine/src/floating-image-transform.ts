import {
  MAX_FLOATING_IMAGE_SIZE,
  MIN_FLOATING_IMAGE_SIZE,
  normalizeImageTransform,
  type FloatingImage,
  type ImageCrop,
  type ImageTransform,
} from "@idea10/core/workbook";
import type { SheetViewportLayout } from "./viewport-layout.js";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
} from "./floating-image-layout.js";

export type FloatingImageCropSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type FloatingImageOriginalSize = { width: number; height: number };

function fullCrop(): ImageCrop {
  return { x: 0, y: 0, width: 1, height: 1 };
}
function isQuarterTurn(rotation: number | undefined): boolean {
  return rotation === 90 || rotation === 270;
}

function normalizeSelection(selection: FloatingImageCropSelection): FloatingImageCropSelection {
  return normalizeImageTransform({ crop: selection })?.crop ?? fullCrop();
}

function inverseRotateCrop(
  selection: FloatingImageCropSelection,
  rotation: number | undefined,
): ImageCrop {
  switch (rotation) {
    case 90:
      return {
        x: selection.y,
        y: 1 - selection.x - selection.width,
        width: selection.height,
        height: selection.width,
      };
    case 180:
      return {
        x: 1 - selection.x - selection.width,
        y: 1 - selection.y - selection.height,
        width: selection.width,
        height: selection.height,
      };
    case 270:
      return {
        x: 1 - selection.y - selection.height,
        y: selection.x,
        width: selection.height,
        height: selection.width,
      };
    default:
      return selection;
  }
}

function clampCrop(crop: ImageCrop): ImageCrop {
  const x = Math.min(1, Math.max(0, crop.x));
  const y = Math.min(1, Math.max(0, crop.y));
  return {
    x,
    y,
    width: Math.max(Number.EPSILON, Math.min(1 - x, crop.width)),
    height: Math.max(Number.EPSILON, Math.min(1 - y, crop.height)),
  };
}

function normalizeOriginalSize(size: FloatingImageOriginalSize): FloatingImageOriginalSize {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new RangeError("Original image dimensions must be finite and positive.");
  }
  return { width: size.width, height: size.height };
}

function fitImageSize(width: number, height: number): FloatingImageOriginalSize {
  let scale = Math.min(1, MAX_FLOATING_IMAGE_SIZE / Math.max(width, height));
  if (Math.min(width * scale, height * scale) < MIN_FLOATING_IMAGE_SIZE) {
    scale = Math.max(scale, MIN_FLOATING_IMAGE_SIZE / Math.min(width, height));
  }
  if (Math.max(width * scale, height * scale) > MAX_FLOATING_IMAGE_SIZE) {
    scale = MAX_FLOATING_IMAGE_SIZE / Math.max(width, height);
  }
  return {
    width: Math.min(MAX_FLOATING_IMAGE_SIZE, Math.max(MIN_FLOATING_IMAGE_SIZE, width * scale)),
    height: Math.min(MAX_FLOATING_IMAGE_SIZE, Math.max(MIN_FLOATING_IMAGE_SIZE, height * scale)),
  };
}

function withTransform(
  image: FloatingImage,
  requestedTransform: ImageTransform | undefined,
): FloatingImage {
  const transform = normalizeImageTransform(requestedTransform);
  const { transform: _previousTransform, ...fields } = image;
  return { ...fields, ...(transform ? { transform } : {}) };
}

export function cropFloatingImage(
  image: FloatingImage,
  selection: FloatingImageCropSelection,
  layout: SheetViewportLayout,
): FloatingImage | null {
  const rect = getFloatingImageSheetRect(image, layout);
  if (!rect) return null;
  const displayed = normalizeSelection(selection);
  const existing = image.transform?.crop ?? fullCrop();
  const unrotated = inverseRotateCrop(displayed, image.transform?.rotation);
  const source = {
    ...unrotated,
    x: image.transform?.flipHorizontal ? 1 - unrotated.x - unrotated.width : unrotated.x,
    y: image.transform?.flipVertical ? 1 - unrotated.y - unrotated.height : unrotated.y,
  };
  const crop = clampCrop({
    x: existing.x + source.x * existing.width,
    y: existing.y + source.y * existing.height,
    width: source.width * existing.width,
    height: source.height * existing.height,
  });
  return reanchorFloatingImageAtSheetRect(
    withTransform(image, { ...image.transform, crop }),
    {
      x: rect.x + displayed.x * rect.width,
      y: rect.y + displayed.y * rect.height,
      width: rect.width * displayed.width,
      height: rect.height * displayed.height,
    },
    layout,
  );
}

export function rotateFloatingImage(
  image: FloatingImage,
  quarterTurns: -1 | 1 | 2,
  layout: SheetViewportLayout,
): FloatingImage | null {
  const rect = getFloatingImageSheetRect(image, layout);
  if (!rect) return null;
  const rotation = ((((image.transform?.rotation ?? 0) + quarterTurns * 90) % 360) + 360) % 360;
  const swapsBounds = Math.abs(quarterTurns) % 2 === 1;
  const width = swapsBounds ? rect.height : rect.width;
  const height = swapsBounds ? rect.width : rect.height;
  return reanchorFloatingImageAtSheetRect(
    withTransform(image, { ...image.transform, rotation: rotation as ImageTransform["rotation"] }),
    {
      x: rect.x + (rect.width - width) / 2,
      y: rect.y + (rect.height - height) / 2,
      width,
      height,
    },
    layout,
  );
}

export type ImageFlipAxis = "horizontal" | "vertical";

/** Mirrors the current displayed image while preserving its frame and original source. */
export function flipFloatingImage(image: FloatingImage, axis: ImageFlipAxis): FloatingImage {
  // Metadata describes source axes before rotation. A quarter-turn exchanges
  // those axes relative to the horizontal and vertical directions on screen.
  const horizontalSourceAxis = (axis === "horizontal") !== isQuarterTurn(image.transform?.rotation);
  const field = horizontalSourceAxis ? "flipHorizontal" : "flipVertical";
  return withTransform(image, { ...image.transform, [field]: !image.transform?.[field] });
}

export function restoreFloatingImage(
  image: FloatingImage,
  layout: SheetViewportLayout,
  originalSize?: FloatingImageOriginalSize,
): FloatingImage | null {
  const rect = getFloatingImageSheetRect(image, layout);
  if (!rect) return null;
  const crop = image.transform?.crop ?? fullCrop();
  const unrotatedCropWidth = isQuarterTurn(image.transform?.rotation) ? rect.height : rect.width;
  const unrotatedCropHeight = isQuarterTurn(image.transform?.rotation) ? rect.width : rect.height;
  const inferred = {
    width: unrotatedCropWidth / crop.width,
    height: unrotatedCropHeight / crop.height,
  };
  const sourceSize = originalSize ? normalizeOriginalSize(originalSize) : inferred;
  const fitted = fitImageSize(sourceSize.width, sourceSize.height);
  const width = fitted.width;
  const height = fitted.height;
  return reanchorFloatingImageAtSheetRect(
    withTransform(image, {
      appearance: image.transform?.appearance,
      annotations: image.transform?.annotations,
    }),
    {
      x: rect.x + (rect.width - width) / 2,
      y: rect.y + (rect.height - height) / 2,
      width,
      height,
    },
    layout,
  );
}
