import { requireStandalonePicture } from "./picture-document-support";
import {
  isFramedPictureObject,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import {
  getFloatingImageSheetRect,
  moveFloatingImageBy,
  resizeFloatingImageBy,
  type FloatingImageResizeDirection,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  rotateFloatingImage,
  flipFloatingImage,
} from "@sheetcraft/sheet-engine/floating-image-transform";
import {
  moveFramedPictureBy,
  resizeFramedPictureBy,
  rotateFramedPictureBy,
  flipFramedPicture,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { Point, Rect } from "@sheetcraft/sheet-engine/geometry";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";

function frameContext(layout: SheetViewportLayout, context?: PictureFrameLayoutContext) {
  if (!context || context.layout !== layout)
    throw new Error("A picture requires the current worksheet frame geometry.");
  return context;
}
export function getPictureViewRect(
  root: FloatingImage,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): Rect | null {
  const image = requireStandalonePicture(root);
  if (!isFramedPictureObject(image)) return getFloatingImageSheetRect(image, layout);
  const geometry = resolvePictureFrame(image.frame, frameContext(layout, context).metrics);
  return geometry.collapsed ? null : geometry.rect;
}
export function movePictureViewBy(
  root: FloatingImage,
  delta: Point,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): StandalonePictureObject | null {
  const image = requireStandalonePicture(root);
  return isFramedPictureObject(image)
    ? moveFramedPictureBy(image, delta, frameContext(layout, context).metrics)
    : moveFloatingImageBy(image, delta, layout);
}
export function resizePictureViewBy(
  root: FloatingImage,
  direction: FloatingImageResizeDirection,
  delta: Point,
  layout: SheetViewportLayout,
  minSize: number,
  maxSize: number,
  context?: PictureFrameLayoutContext,
): StandalonePictureObject | null {
  const image = requireStandalonePicture(root);
  return isFramedPictureObject(image)
    ? resizeFramedPictureBy(image, direction, delta, frameContext(layout, context).metrics, {
        minSize,
        maxSize,
        preserveCornerRatio: image.lockAspectRatio ?? true,
      })
    : resizeFloatingImageBy(image, direction, delta, layout, {
        minSize,
        maxSize,
        preserveAspectRatio: direction.length === 2 && (image.lockAspectRatio ?? true),
      });
}
export function rotatePictureViewBy(
  root: FloatingImage,
  turns: -1 | 1 | 2,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): StandalonePictureObject | null {
  const image = requireStandalonePicture(root);
  return isFramedPictureObject(image)
    ? rotateFramedPictureBy(image, turns * 90, frameContext(layout, context).metrics)
    : rotateFloatingImage(image, turns, layout);
}
export function flipPictureView(
  root: FloatingImage,
  axis: "horizontal" | "vertical",
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): StandalonePictureObject {
  const image = requireStandalonePicture(root);
  return isFramedPictureObject(image)
    ? flipFramedPicture(image, axis, frameContext(layout, context).metrics)
    : flipFloatingImage(image, axis);
}
