import { pictureFrameWorldToLocal } from "@sheetcraft/core/picture-frame";
import { isPointInShapePreset } from "@sheetcraft/core/shape-presets";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import {
  createPictureProjectiveGeometry,
  hitPictureProjectiveFront,
} from "../../shared/images/picture-projective-geometry";
import { getPictureCropShapeGeometry, getPictureShapeSourceRect } from "./picture-crop-shape";
import type { PictureViewportFragment } from "./picture-viewport-fragments";

/** Undo the same front-plane projection used by the picture painter, before sampling pixels. */
function frontPoint(
  point: Point,
  width: number,
  height: number,
  appearance?: ImageAppearance,
  shapeExtendsFrame = false,
) {
  const style = appearance?.detailedStyle;
  const format = style?.format3d?.kind === "value" ? style.format3d.value : undefined;
  const rotation = style?.rotation3d?.kind === "value" ? style.rotation3d.value : undefined;
  if (!format && !rotation) return point;
  if (format?.material === "wire-frame") return null;
  const geometry = createPictureProjectiveGeometry({
    widthPx: width,
    heightPx: height,
    depthPx: ((format?.depthPt ?? 0) * 4) / 3,
    rotation: rotation
      ? { ...rotation, distanceFromGroundPx: (rotation.distanceFromGroundPt * 4) / 3 }
      : { projection: "parallel", xDeg: 0, yDeg: 0, zDeg: 0, distanceFromGroundPx: 0 },
  });
  if (!shapeExtendsFrame) return hitPictureProjectiveFront(geometry, point);
  // Crop shapes can extend beyond the rectangular front (for example a callout tail).
  // The caller tests the true shape and source bounds after this inverse projection.
  const inverse = geometry.front.inverseHomography;
  if (!inverse || geometry.front.facing !== "front") return null;
  const w = inverse[6] * point.x + inverse[7] * point.y + inverse[8];
  if (!Number.isFinite(w) || w < 1e-12) return null;
  const x = (inverse[0] * point.x + inverse[1] * point.y + inverse[2]) / w;
  const y = (inverse[3] * point.x + inverse[4] * point.y + inverse[5]) / w;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Source fractions, before color corrections and opacity. Padding, holes and effects do not pick. */
export function getPictureSourceColorPoint(
  fragment: PictureViewportFragment,
  point: Point,
): Point | null {
  if (![point.x, point.y].every(Number.isFinite)) return null;
  let u: number, v: number;
  if (fragment.kind === "legacy") {
    const { rect, image } = fragment;
    const appearance = image.transform?.appearance;
    const height =
      rect.height /
      (appearance?.reflection && appearance.detailedStyle?.reflection === undefined ? 1.25 : 1);
    const local = frontPoint(
      { x: point.x - rect.x, y: point.y - rect.y },
      rect.width,
      height,
      appearance,
    );
    if (!local || local.x < 0 || local.y < 0 || local.x >= rect.width || local.y >= height)
      return null;
    u = local.x / rect.width;
    v = local.y / height;
    const transform = image.transform;
    switch (transform?.rotation) {
      case 90:
        [u, v] = [v, 1 - u];
        break;
      case 180:
        [u, v] = [1 - u, 1 - v];
        break;
      case 270:
        [u, v] = [1 - v, u];
        break;
    }
    if (transform?.flipHorizontal) u = 1 - u;
    if (transform?.flipVertical) v = 1 - v;
    const crop = transform?.crop;
    if (crop) {
      u = crop.x + u * crop.width;
      v = crop.y + v * crop.height;
    }
  } else {
    const { geometry, image: picture } = fragment;
    if (geometry.collapsed || !geometry.sourceRect) return null;
    const { rect, sourceRect } = geometry;
    const shape = getPictureCropShapeGeometry(picture.frame.cropShape, rect.width, rect.height);
    const local = frontPoint(
      pictureFrameWorldToLocal(rect, geometry.angleDeg, point),
      rect.width,
      rect.height,
      picture.transform?.appearance,
      !!shape,
    );
    if (!local) return null;
    if (
      shape
        ? !isPointInShapePreset(shape, local)
        : local.x < 0 || local.y < 0 || local.x >= rect.width || local.y >= rect.height
    )
      return null;
    const source = shape
      ? getPictureShapeSourceRect(geometry, shape)
      : { ...sourceRect, x: sourceRect.x - rect.x, y: sourceRect.y - rect.y };
    u = (local.x - source.x) / source.width;
    v = (local.y - source.y) / source.height;
    if (u < 0 || v < 0 || u > 1 || v > 1) return null;
    if (picture.frame.flipHorizontal) u = 1 - u;
    if (picture.frame.flipVertical) v = 1 - v;
  }
  return Number.isFinite(u) && Number.isFinite(v) && u >= 0 && v >= 0 && u <= 1 && v <= 1
    ? { x: u, y: v }
    : null;
}

/** Match the bounded source raster used by imageAppearanceSource, without reading a full bitmap. */
export function readPictureSourceColor(image: HTMLImageElement, point: Point): string | null {
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const scale = Math.min(1, 4096 / image.naturalWidth, 4096 / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const x = Math.min(width - 1, Math.floor(point.x * width));
  const y = Math.min(height - 1, Math.floor(point.y * height));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Picture color sampling is unavailable.");
  context.drawImage(image, -x, -y, width, height);
  const rgba = context.getImageData(0, 0, 1, 1).data;
  if (!rgba[3]) return null;
  return `#${Array.from(rgba.slice(0, 3), (value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
