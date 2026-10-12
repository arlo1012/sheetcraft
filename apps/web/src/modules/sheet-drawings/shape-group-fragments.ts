import type { ResolvedShapeFrame } from "@sheetcraft/core/shape-frame";
import { shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { PageLayoutProjection } from "@sheetcraft/sheet-engine/page-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getShapePageProjectionBands } from "./shape-page-layout";

export type ShapeGroupFrameFragment = FloatingImageViewportFragment & {
  pageKey?: string;
  pageClip?: FloatingImageViewportFragment["rect"];
};
export type ShapeGroupPaintBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;
/** Containers project geometry only. Their leaves independently paint/hit/overflow. */
export function getShapeGroupFrameFragments(
  frame: ResolvedShapeFrame,
  viewport: SheetViewportLayout,
  metrics: PictureSheetMetrics,
  projection?: PageLayoutProjection,
): ShapeGroupFrameFragment[] {
  if (frame.collapsed) return [];
  const points = [
    ...frame.corners,
    shapeFrameLocalToWorld(frame.rect, frame.angleDeg, { x: frame.rect.width / 2, y: -24 }),
  ];
  const x = Math.min(...points.map((p) => p.x)) - 8;
  const y = Math.min(...points.map((p) => p.y)) - 8;
  const bounds = {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x + 8,
    height: Math.max(...points.map((p) => p.y)) - y + 8,
  };
  return projectBounds(frame, bounds, viewport, metrics, projection);
}

/** Paint overflow belongs to the continuous source, before any frozen/page clip.
 * Selection handles are deliberately absent from these raster fragments. */
export function getShapeGroupPaintFragments(
  frame: ResolvedShapeFrame,
  ink: ShapeGroupPaintBounds,
  viewport: SheetViewportLayout,
  metrics: PictureSheetMetrics,
  projection?: PageLayoutProjection,
): ShapeGroupFrameFragment[] {
  if (frame.collapsed) return [];
  if (
    ![ink.left, ink.top, ink.right, ink.bottom].every(Number.isFinite) ||
    Math.max(Math.abs(ink.left), Math.abs(ink.top), Math.abs(ink.right), Math.abs(ink.bottom)) >
      10_000_000 ||
    ink.right < ink.left ||
    ink.bottom < ink.top
  )
    throw new RangeError("Shape group ink bounds exceed their finite coordinate budget.");
  if (ink.right === ink.left || ink.bottom === ink.top) return [];
  const points = [
    { x: ink.left, y: ink.top },
    { x: ink.right, y: ink.top },
    { x: ink.right, y: ink.bottom },
    { x: ink.left, y: ink.bottom },
  ].map((point) => shapeFrameLocalToWorld(frame.rect, frame.angleDeg, point));
  const x = Math.min(...points.map((point) => point.x)),
    y = Math.min(...points.map((point) => point.y));
  return projectBounds(
    frame,
    {
      x,
      y,
      width: Math.max(...points.map((point) => point.x)) - x,
      height: Math.max(...points.map((point) => point.y)) - y,
    },
    viewport,
    metrics,
    projection,
  );
}

function projectBounds(
  frame: ResolvedShapeFrame,
  bounds: { x: number; y: number; width: number; height: number },
  viewport: SheetViewportLayout,
  metrics: PictureSheetMetrics,
  projection?: PageLayoutProjection,
): ShapeGroupFrameFragment[] {
  const bands = projection
    ? getShapePageProjectionBands(viewport, projection, metrics).map((b) => ({
        paneId: "body" as const,
        ...b,
      }))
    : (["topLeft", "top", "left", "body"] as const).map((paneId) => ({
        paneId,
        clip: viewport.panes[paneId].clip,
        translation: getPicturePaneTranslation(paneId, viewport),
        pageKey: undefined,
      }));
  return bands.flatMap((b) => {
    const moved = { ...bounds, x: bounds.x + b.translation.x, y: bounds.y + b.translation.y };
    const left = Math.max(b.clip.x, moved.x),
      top = Math.max(b.clip.y, moved.y);
    const width = Math.min(b.clip.x + b.clip.width, moved.x + moved.width) - left;
    const height = Math.min(b.clip.y + b.clip.height, moved.y + moved.height) - top;
    return width > 0 && height > 0
      ? [
          {
            paneId: b.paneId,
            rect: {
              ...frame.rect,
              x: frame.rect.x + b.translation.x,
              y: frame.rect.y + b.translation.y,
            },
            clippedRect: { x: left, y: top, width, height },
            ...(projection ? { pageKey: b.pageKey, pageClip: b.clip } : {}),
          },
        ]
      : [];
  });
}
