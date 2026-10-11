import {
  pictureFrameLocalToWorld,
  type ResolvedPictureFrame,
  type PictureFrameRect,
} from "@sheetcraft/core/picture-frame";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import type { DrawingThemeEffects } from "./picture-inherited-effects";
import { planPictureDetailedPaint, type PicturePaintResources } from "./picture-detailed-render";

/** Paint-only world bounds. Never substitute these for layout, selection, anchors or hit tests. */
export function getPictureDetailedWorldBounds(
  geometry: ResolvedPictureFrame,
  appearance: ImageAppearance | undefined,
  inherited: DrawingThemeEffects | undefined,
  resources: PicturePaintResources | undefined,
  density: number,
): PictureFrameRect | undefined {
  if (geometry.collapsed) return;
  const plan = planPictureDetailedPaint({
    width: geometry.rect.width,
    height: geometry.rect.height,
    density,
    appearance,
    inherited,
    resources,
    angleDeg: geometry.angleDeg,
  });
  if (!plan) return;
  const b = plan.logicalBounds;
  const points = [
    { x: b.left, y: b.top },
    { x: b.right, y: b.top },
    { x: b.right, y: b.bottom },
    { x: b.left, y: b.bottom },
  ].map((point) => pictureFrameLocalToWorld(geometry.rect, geometry.angleDeg, point));
  const x = Math.min(...points.map((point) => point.x)),
    y = Math.min(...points.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...points.map((point) => point.x)) - x,
    height: Math.max(...points.map((point) => point.y)) - y,
  };
}
