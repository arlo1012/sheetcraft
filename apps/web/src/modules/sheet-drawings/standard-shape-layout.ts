import { pictureFrameLocalToWorld, type PictureFrameRect } from "@sheetcraft/core/picture-frame";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
  type FloatingImageResizeDirection,
  type FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getStandardShapeGeometry, getStandardShapeWorldBounds } from "./shape-geometry";
import { getShapeEndPaint, standardShapeAppearance } from "./shape-line-paint";

export function standardShapeResizeRect(
  rect: PictureFrameRect,
  rotation: number,
  direction: FloatingImageResizeDirection,
  delta: Readonly<{ x: number; y: number }>,
  preserveRatio = false,
): PictureFrameRect | undefined {
  if (
    !["n", "s", "e", "w", "nw", "ne", "sw", "se"].includes(direction) ||
    ![rect.x, rect.y, rect.width, rect.height, rotation, delta.x, delta.y].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return;
  if (delta.x === 0 && delta.y === 0) return { ...rect };
  const radians = (rotation * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians);
  const dx = cos * delta.x + sin * delta.y,
    dy = -sin * delta.x + cos * delta.y;
  const horizontal = direction.includes("w") || direction.includes("e");
  const vertical = direction.includes("n") || direction.includes("s");
  let width = horizontal ? rect.width + (direction.includes("w") ? -dx : dx) : rect.width;
  let height = vertical ? rect.height + (direction.includes("n") ? -dy : dy) : rect.height;
  if (horizontal && vertical && preserveRatio) {
    const sx = width / rect.width,
      sy = height / rect.height;
    const request = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
    const scale = Math.max(
      Math.max(16 / rect.width, 16 / rect.height),
      Math.min(Math.min(16384 / rect.width, 16384 / rect.height), request),
    );
    width = rect.width * scale;
    height = rect.height * scale;
  } else {
    if (horizontal) width = Math.max(16, Math.min(16384, width));
    if (vertical) height = Math.max(16, Math.min(16384, height));
  }
  const fx = direction.includes("w") ? 1 : direction.includes("e") ? 0 : 0.5;
  const fy = direction.includes("n") ? 1 : direction.includes("s") ? 0 : 0.5;
  const fixed = pictureFrameLocalToWorld(rect, rotation, {
    x: rect.width * fx,
    y: rect.height * fy,
  });
  const vx = (fx - 0.5) * width,
    vy = (fy - 0.5) * height;
  const x = fixed.x - cos * vx + sin * vy - width / 2,
    y = fixed.y - sin * vx - cos * vy - height / 2;
  if (x < -1e-7 || y < -1e-7) return;
  return { x: Math.max(0, x), y: Math.max(0, y), width, height };
}
export function resizeStandardShapeBy(
  drawing: SheetGraphicDrawing,
  direction: FloatingImageResizeDirection,
  delta: Readonly<{ x: number; y: number }>,
  layout: SheetViewportLayout,
  preserveRatio = false,
): SheetGraphicDrawing | undefined {
  const rect = getFloatingImageSheetRect(drawing, layout);
  const next =
    rect && standardShapeResizeRect(rect, drawing.rotation, direction, delta, preserveRatio);
  return next ? (reanchorFloatingImageAtSheetRect(drawing, next, layout) ?? undefined) : undefined;
}
function intersect(left: PictureFrameRect, right: PictureFrameRect): PictureFrameRect | undefined {
  const x = Math.max(left.x, right.x),
    y = Math.max(left.y, right.y);
  const endX = Math.min(left.x + left.width, right.x + right.width),
    endY = Math.min(left.y + left.height, right.y + right.height);
  return endX > x && endY > y ? { x, y, width: endX - x, height: endY - y } : undefined;
}
/** Clip only at viewport panes, never at the unrotated body: tails and rotated corners stay visible. */
export function getStandardShapeViewportFragments(
  drawing: SheetGraphicDrawing,
  layout: SheetViewportLayout,
  selected = false,
): FloatingImageViewportFragment[] {
  const rect = getFloatingImageSheetRect(drawing, layout);
  if (!rect || !drawing.shapeGeometry) return [];
  const shape = getStandardShapeGeometry(drawing.shapeGeometry, drawing.width, drawing.height);
  const bounds = getStandardShapeWorldBounds(
    shape,
    standardShapeAppearance(drawing),
    rect,
    drawing.rotation,
  );
  if (!shape) return [];
  const points = bounds
    ? [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      ]
    : [];
  for (const paint of getShapeEndPaint(drawing, shape)) {
    points.push(
      ...[
        { x: paint.bounds.x, y: paint.bounds.y },
        { x: paint.bounds.x + paint.bounds.width, y: paint.bounds.y },
        { x: paint.bounds.x + paint.bounds.width, y: paint.bounds.y + paint.bounds.height },
        { x: paint.bounds.x, y: paint.bounds.y + paint.bounds.height },
      ].map((p) => pictureFrameLocalToWorld(rect, drawing.rotation, p)),
    );
  }
  if (selected) {
    points.push(
      ...[
        { x: 0, y: 0 },
        { x: drawing.width, y: 0 },
        { x: drawing.width, y: drawing.height },
        { x: 0, y: drawing.height },
        { x: drawing.width / 2, y: -24 },
        ...shape.handles.map((h) => h.position),
      ].map((p) => pictureFrameLocalToWorld(rect, drawing.rotation, p)),
    );
  }
  if (!points.length) return [];
  const x = Math.min(...points.map((p) => p.x)) - (selected ? 8 : 0),
    y = Math.min(...points.map((p) => p.y)) - (selected ? 8 : 0);
  const visible = {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x + (selected ? 8 : 0),
    height: Math.max(...points.map((p) => p.y)) - y + (selected ? 8 : 0),
  };
  return (["topLeft", "top", "left", "body"] as const).flatMap((paneId) => {
    const delta = getPicturePaneTranslation(paneId, layout);
    const clippedRect = intersect(
      { ...visible, x: visible.x + delta.x, y: visible.y + delta.y },
      layout.panes[paneId].clip,
    );
    return clippedRect
      ? [{ paneId, rect: { ...rect, x: rect.x + delta.x, y: rect.y + delta.y }, clippedRect }]
      : [];
  });
}
