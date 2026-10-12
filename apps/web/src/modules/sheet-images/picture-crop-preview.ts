import {
  getPictureCropShapeGeometry,
  getPictureShapeSourceRect,
  getPictureCropShapeWorldBounds,
} from "./picture-crop-shape";
import { tracePictureShapePath } from "../../shared/images/picture-shape-mask";
import {
  clonePictureObject,
  isFramedPictureObject,
  type FramedFloatingImage,
} from "@sheetcraft/core/picture-object";
import {
  clonePictureGroupChild,
  isGroupedPicture,
  type GroupedPicture,
} from "@sheetcraft/core/picture-group";
import {
  pictureFrameLocalToWorld,
  resolvePictureSourceLayout,
  type PictureFrameRect,
  type PicturePoint,
  type ResolvedPictureFrame,
} from "@sheetcraft/core/picture-frame";
import {
  projectPictureFrameIntoPane,
  type FramedPictureViewportFragment,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { paintFramedPictureContent, paintGroupedPictureContent } from "./framed-picture-painter";
import { assertSourceBearingPicturePaintSupport } from "./picture-paint-effects";

export type PictureCropPreviewLeaf = FramedFloatingImage | GroupedPicture;
export type PreparedPictureCropPreview = Readonly<{
  picture: PictureCropPreviewLeaf;
  geometry: ResolvedPictureFrame;
  /** View-only leaf with its genuine metadata and unit source; never persist it. */
  ghostPicture: PictureCropPreviewLeaf;
  ghostGeometry: ResolvedPictureFrame;
}>;

const paneIds: readonly FrozenPaneId[] = ["topLeft", "top", "left", "body"];

function sameCoordinate(actual: number, expected: number): void {
  const tolerance = Number.EPSILON * 32 * Math.max(1, Math.abs(actual), Math.abs(expected));
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance)
    throw new RangeError("Crop preview requires canonical picture geometry.");
}

function sameRect(actual: PictureFrameRect, expected: PictureFrameRect): void {
  if (!actual || typeof actual !== "object")
    throw new TypeError("Crop preview requires resolved rectangles.");
  for (const key of ["x", "y", "width", "height"] as const)
    sameCoordinate(actual[key], expected[key]);
}

/** Strict preflight runs before image decoding, cache access or canvas preparation. */
export function preparePictureCropPreview(
  picture: PictureCropPreviewLeaf,
  geometry: ResolvedPictureFrame,
): PreparedPictureCropPreview {
  if (!picture || typeof picture !== "object")
    throw new TypeError("Crop preview requires a genuine source-bearing picture.");
  const normalized = isGroupedPicture(picture)
    ? clonePictureGroupChild(picture)
    : isFramedPictureObject(picture)
      ? clonePictureObject(picture)
      : null;
  if (!normalized || (!isGroupedPicture(normalized) && !isFramedPictureObject(normalized)))
    throw new TypeError("Crop preview requires a genuine source-bearing picture.");
  assertSourceBearingPicturePaintSupport(normalized);
  if (!geometry || typeof geometry !== "object")
    throw new TypeError("Crop preview requires resolved picture geometry.");
  const canonical = resolvePictureSourceLayout(
    geometry.rect,
    geometry.angleDeg,
    normalized.frame.source,
  );
  if (geometry.angleDeg !== canonical.angleDeg || geometry.collapsed !== canonical.collapsed)
    throw new RangeError("Crop preview requires canonical picture geometry.");
  sameRect(geometry.rect, canonical.rect);
  sameRect(geometry.bounds, canonical.bounds);
  if (!Array.isArray(geometry.corners) || geometry.corners.length !== 4)
    throw new TypeError("Crop preview requires four resolved corners.");
  for (let index = 0; index < 4; index++) {
    const point = geometry.corners[index]!;
    if (!point || typeof point !== "object")
      throw new TypeError("Crop preview requires finite resolved corners.");
    sameCoordinate(point.x, canonical.corners[index]!.x);
    sameCoordinate(point.y, canonical.corners[index]!.y);
  }
  if (canonical.collapsed || !canonical.sourceRect)
    throw new RangeError("A collapsed picture cannot show a crop preview.");
  if (!geometry.sourceRect) throw new TypeError("Crop preview requires resolved source geometry.");
  sameRect(geometry.sourceRect, canonical.sourceRect);

  const shape = getPictureCropShapeGeometry(
    normalized.frame.cropShape,
    canonical.rect.width,
    canonical.rect.height,
  );
  const mapped = shape ? getPictureShapeSourceRect(canonical, shape) : undefined;
  const source = mapped
    ? { ...mapped, x: canonical.rect.x + mapped.x, y: canonical.rect.y + mapped.y }
    : canonical.sourceRect;
  // sourceRect is expressed in the crop frame's unrotated axes. Its physical
  // center is C + R(offset), not the center of that unrotated rectangle.
  const center = pictureFrameLocalToWorld(canonical.rect, canonical.angleDeg, {
    x: source.x - canonical.rect.x + source.width / 2,
    y: source.y - canonical.rect.y + source.height / 2,
  });
  const fullSourceRect = {
    x: center.x - source.width / 2,
    y: center.y - source.height / 2,
    width: source.width,
    height: source.height,
  };
  const unitSource = { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 };
  const ghostPicture = isGroupedPicture(normalized)
    ? clonePictureGroupChild(normalized)
    : clonePictureObject(normalized);
  ghostPicture.frame.source = unitSource;
  delete ghostPicture.frame.cropShape;
  // Decorations belong to the retained crop frame, not the temporary full-source
  // frame. Keep pixel filters, transparency, opacity, annotations and both flips.
  if (ghostPicture.transform?.appearance) {
    const {
      border: _border,
      shadow: _shadow,
      reflection: _reflection,
      detailedStyle: _detailed,
      ...appearance
    } = ghostPicture.transform.appearance;
    ghostPicture.transform = { ...ghostPicture.transform, appearance };
  }
  // The grouped leaf keeps its real parent-local ratios and local angle. Only
  // this resolved view geometry expands to the full source; no anchor is invented.
  return {
    picture: normalized,
    geometry: canonical,
    ghostPicture,
    ghostGeometry: resolvePictureSourceLayout(fullSourceRect, canonical.angleDeg, unitSource),
  };
}

function intersection(left: PictureFrameRect, right: PictureFrameRect): PictureFrameRect | null {
  const x = Math.max(left.x, right.x),
    y = Math.max(left.y, right.y);
  const endX = Math.min(left.x + left.width, right.x + right.width),
    endY = Math.min(left.y + left.height, right.y + right.height);
  return endX > x && endY > y ? { x, y, width: endX - x, height: endY - y } : null;
}

/** Only crop-frame fragments own crop controls. Full-source ghosts own no handles. */
export function getPictureCropViewportFragments(
  preview: PreparedPictureCropPreview,
  layout: SheetViewportLayout,
): FramedPictureViewportFragment[] {
  if (preview.picture.hidden) return [];
  return paneIds.flatMap((paneId) => {
    const geometry = projectPictureFrameIntoPane(preview.geometry, paneId, layout);
    const shapeBounds = getPictureCropShapeWorldBounds(preview.picture, geometry);
    const bounds = shapeBounds
      ? {
          x: Math.min(geometry.bounds.x, shapeBounds.x),
          y: Math.min(geometry.bounds.y, shapeBounds.y),
          width:
            Math.max(geometry.bounds.x + geometry.bounds.width, shapeBounds.x + shapeBounds.width) -
            Math.min(geometry.bounds.x, shapeBounds.x),
          height:
            Math.max(
              geometry.bounds.y + geometry.bounds.height,
              shapeBounds.y + shapeBounds.height,
            ) - Math.min(geometry.bounds.y, shapeBounds.y),
        }
      : geometry.bounds;
    const clippedBounds = intersection(bounds, layout.panes[paneId].clip);
    return clippedBounds ? [{ paneId, geometry, clippedBounds }] : [];
  });
}

export function getPictureCropHandlePoint(
  geometry: ResolvedPictureFrame,
  direction: FloatingImageResizeDirection,
): PicturePoint {
  const [nw, ne, se, sw] = geometry.corners;
  const midpoint = (a: PicturePoint, b: PicturePoint): PicturePoint => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  return {
    nw,
    ne,
    se,
    sw,
    n: midpoint(nw, ne),
    e: midpoint(ne, se),
    s: midpoint(sw, se),
    w: midpoint(nw, sw),
  }[direction];
}

/**
 * Draws actual excluded source pixels through the shared content kernel. The
 * viewport-sized canvas and per-pane even-odd clip leave current crop pixels
 * entirely to the host's forest painter, including blank crop padding.
 */
export function paintPictureCropSourceGhost(
  context: CanvasRenderingContext2D,
  decoded: HTMLImageElement,
  preview: PreparedPictureCropPreview,
  layout: SheetViewportLayout,
): void {
  if (preview.picture.hidden) return;
  for (const paneId of paneIds) {
    const clip = layout.panes[paneId].clip;
    if (clip.width <= 0 || clip.height <= 0) continue;
    const source = projectPictureFrameIntoPane(preview.ghostGeometry, paneId, layout);
    if (!intersection(source.bounds, clip)) continue;
    const frame = projectPictureFrameIntoPane(preview.geometry, paneId, layout);
    context.save();
    try {
      context.beginPath();
      context.rect(clip.x, clip.y, clip.width, clip.height);
      context.clip();
      const shape = getPictureCropShapeGeometry(
        preview.picture.frame.cropShape,
        frame.rect.width,
        frame.rect.height,
      );
      if (!shape) {
        context.beginPath();
        context.rect(clip.x, clip.y, clip.width, clip.height);
        context.moveTo(frame.corners[0].x, frame.corners[0].y);
        for (const point of frame.corners.slice(1)) context.lineTo(point.x, point.y);
        context.closePath();
        context.clip("evenodd");
      }
      context.globalAlpha *= 0.35;
      if (isGroupedPicture(preview.ghostPicture))
        paintGroupedPictureContent(context, decoded, preview.ghostPicture, source);
      else paintFramedPictureContent(context, decoded, preview.ghostPicture, source);
      if (shape) {
        // This dedicated overlay contains ghosts only. Erasing each nonzero fill
        // independently preserves same-path holes and the union of separate paths.
        context.globalAlpha = 1;
        context.globalCompositeOperation = "destination-out";
        const rect = frame.rect;
        context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
        context.rotate((frame.angleDeg * Math.PI) / 180);
        context.translate(-rect.width / 2, -rect.height / 2);
        for (const path of shape.paths)
          if (path.filled) {
            context.beginPath();
            tracePictureShapePath(context, path);
            context.fill("nonzero");
          }
      }
    } finally {
      context.restore();
    }
  }
}

/** Pixel budgets depend only on the viewport, never the expanded source extent. */
export function getPictureCropCanvasSize(
  viewport: { width: number; height: number },
  devicePixelRatio: number,
  scale = 1,
): { width: number; height: number; scaleX: number; scaleY: number } {
  for (const value of [viewport.width, viewport.height])
    if (!Number.isFinite(value) || value < 0)
      throw new RangeError("Crop preview viewport dimensions must be finite and non-negative.");
  if (
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0 ||
    !Number.isFinite(scale) ||
    scale <= 0
  )
    throw new RangeError("Crop preview pixel density must be finite and positive.");
  const density = Math.min(
    devicePixelRatio * scale,
    2,
    8192 / Math.max(1, viewport.width),
    8192 / Math.max(1, viewport.height),
    Math.sqrt(16_777_216 / Math.max(1, viewport.width) / Math.max(1, viewport.height)),
  );
  const width = Math.max(1, Math.floor(viewport.width * density));
  const height = Math.max(1, Math.floor(viewport.height * density));
  return {
    width,
    height,
    scaleX: viewport.width > 0 ? width / viewport.width : 1,
    scaleY: viewport.height > 0 ? height / viewport.height : 1,
  };
}
