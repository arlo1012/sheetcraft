import { requireStandalonePicture } from "./picture-document-support";
import {
  isPictureGroup,
  normalizePictureGroup,
  type PictureGroup,
} from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import {
  movePictureGroupBy,
  resizePictureGroupBy,
  rotatePictureGroupBy,
  flipPictureGroup,
} from "@sheetcraft/sheet-engine/picture-group-geometry";
import {
  isFramedPictureObject,
  normalizePictureObject,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import {
  anchorPictureFrameRect,
  normalizePictureAngle,
  resolvePictureFrame,
  resolvePictureLayout,
} from "@sheetcraft/core/picture-frame";
import type { PictureGroupParentLayout } from "@sheetcraft/core/picture-group-layout";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import {
  getFloatingImageSheetRect,
  moveFloatingImageBy,
  resizeFloatingImageBy,
  reanchorFloatingImageAtSheetRect,
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

/** Replace a root's real world layout without inventing an image source for a container. */
export function replacePictureViewLayout(
  value: FloatingImage,
  world: PictureGroupParentLayout,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): FloatingImage | null {
  const image = normalizePictureObject(value);
  const resolved = resolvePictureLayout(world.rect, world.angleDeg);
  if (resolved.collapsed) return null;
  if (!isPictureGroup(image) && !isFramedPictureObject(image)) {
    // A legacy rectangle already carries its quarter-turn presentation in its
    // transform. Its layout cannot acquire an arbitrary source-free angle.
    if (resolved.angleDeg !== 0 || resolved.rect.x < 0 || resolved.rect.y < 0)
      throw new RangeError("A legacy picture requires a nonnegative, unrotated layout.");
    const next = reanchorFloatingImageAtSheetRect(image, resolved.rect, layout);
    return next ? normalizePictureObject(next) : null;
  }
  const metrics = frameContext(layout, context).metrics;
  const anchor = anchorPictureFrameRect(
    image.frame.anchor.mode,
    resolved.rect,
    metrics,
    image.frame.anchor,
  );
  const angleDeg = normalizePictureAngle(resolved.angleDeg);
  if (isPictureGroup(image)) {
    const next = normalizePictureGroup({ ...image, frame: { ...image.frame, anchor, angleDeg } });
    resolvePictureGroup(next, metrics);
    return next;
  }
  const next = normalizePictureObject({ ...image, frame: { ...image.frame, anchor, angleDeg } });
  if (isFramedPictureObject(next)) resolvePictureFrame(next.frame, metrics);
  return next;
}
export function getPictureViewRect(
  root: FloatingImage,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): Rect | null {
  if (isPictureGroup(root)) {
    const geometry = resolvePictureGroup(root, frameContext(layout, context).metrics).layout;
    return geometry.collapsed ? null : geometry.rect;
  }
  const image = requireStandalonePicture(root);
  if (!isFramedPictureObject(image)) return getFloatingImageSheetRect(image, layout);
  const geometry = resolvePictureFrame(image.frame, frameContext(layout, context).metrics);
  return geometry.collapsed ? null : geometry.rect;
}
export function movePictureViewBy(
  root: StandalonePictureObject,
  delta: Point,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): StandalonePictureObject | null;
export function movePictureViewBy(
  root: PictureGroup,
  delta: Point,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): PictureGroup | null;
export function movePictureViewBy(
  root: FloatingImage,
  delta: Point,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): FloatingImage | null;
export function movePictureViewBy(
  root: FloatingImage,
  delta: Point,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): FloatingImage | null {
  if (isPictureGroup(root))
    return movePictureGroupBy(root, delta, frameContext(layout, context).metrics);
  const image = requireStandalonePicture(root);
  return isFramedPictureObject(image)
    ? moveFramedPictureBy(image, delta, frameContext(layout, context).metrics)
    : moveFloatingImageBy(image, delta, layout);
}
export function resizePictureViewBy(
  root: StandalonePictureObject,
  direction: FloatingImageResizeDirection,
  delta: Point,
  layout: SheetViewportLayout,
  minSize: number,
  maxSize: number,
  context?: PictureFrameLayoutContext,
): StandalonePictureObject | null;
export function resizePictureViewBy(
  root: PictureGroup,
  direction: FloatingImageResizeDirection,
  delta: Point,
  layout: SheetViewportLayout,
  minSize: number,
  maxSize: number,
  context?: PictureFrameLayoutContext,
): PictureGroup | null;
export function resizePictureViewBy(
  root: FloatingImage,
  direction: FloatingImageResizeDirection,
  delta: Point,
  layout: SheetViewportLayout,
  minSize: number,
  maxSize: number,
  context?: PictureFrameLayoutContext,
): FloatingImage | null;
export function resizePictureViewBy(
  root: FloatingImage,
  direction: FloatingImageResizeDirection,
  delta: Point,
  layout: SheetViewportLayout,
  minSize: number,
  maxSize: number,
  context?: PictureFrameLayoutContext,
): FloatingImage | null {
  if (isPictureGroup(root))
    return resizePictureGroupBy(root, direction, delta, frameContext(layout, context).metrics, {
      minSize,
      maxSize,
      preserveCornerRatio: root.lockAspectRatio ?? false,
    });
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
  root: StandalonePictureObject,
  turns: -1 | 1 | 2,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): StandalonePictureObject | null;
export function rotatePictureViewBy(
  root: PictureGroup,
  turns: -1 | 1 | 2,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): PictureGroup | null;
export function rotatePictureViewBy(
  root: FloatingImage,
  turns: -1 | 1 | 2,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): FloatingImage | null;
export function rotatePictureViewBy(
  root: FloatingImage,
  turns: -1 | 1 | 2,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): FloatingImage | null {
  if (isPictureGroup(root))
    return rotatePictureGroupBy(root, turns * 90, frameContext(layout, context).metrics);
  const image = requireStandalonePicture(root);
  return isFramedPictureObject(image)
    ? rotateFramedPictureBy(image, turns * 90, frameContext(layout, context).metrics)
    : rotateFloatingImage(image, turns, layout);
}
export function flipPictureView(
  root: StandalonePictureObject,
  axis: "horizontal" | "vertical",
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): StandalonePictureObject;
export function flipPictureView(
  root: PictureGroup,
  axis: "horizontal" | "vertical",
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): PictureGroup;
export function flipPictureView(
  root: FloatingImage,
  axis: "horizontal" | "vertical",
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): FloatingImage;
export function flipPictureView(
  root: FloatingImage,
  axis: "horizontal" | "vertical",
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): FloatingImage {
  if (isPictureGroup(root))
    return flipPictureGroup(root, axis, frameContext(layout, context).metrics);
  const image = requireStandalonePicture(root);
  return isFramedPictureObject(image)
    ? flipFramedPicture(image, axis, frameContext(layout, context).metrics)
    : flipFloatingImage(image, axis);
}
