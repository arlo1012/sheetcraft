import type { ResolvedPictureCrop } from "@sheetcraft/core/picture-crop-edit";
import {
  evaluateShapePreset,
  getShapePresetFillBounds,
  isPointInShapePreset,
  type PictureCropShape,
  type ShapePresetGeometry,
} from "@sheetcraft/core/shape-presets";
import {
  normalizePictureSourceFrame,
  resolvePictureSourceLayout,
  pictureFrameLocalToWorld,
  pictureFrameWorldToLocal,
  pictureFrameContainsPoint,
  type ResolvedPictureFrame,
  type PictureFrameRect,
} from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import type { GroupedPicture } from "@sheetcraft/core/picture-group";

const cache = new Map<string, ShapePresetGeometry>();
function freezeGeometry(geometry: ShapePresetGeometry): ShapePresetGeometry {
  for (const path of geometry.paths) {
    for (const command of path.commands) Object.freeze(command);
    Object.freeze(path.commands);
    Object.freeze(path);
  }
  for (const handle of geometry.handles) {
    Object.freeze(handle.position);
    for (const field of handle.fields) Object.freeze(field);
    Object.freeze(handle.fields);
    Object.freeze(handle);
  }
  Object.freeze(geometry.paths);
  Object.freeze(geometry.handles);
  Object.freeze(geometry.adjustments);
  return Object.freeze(geometry);
}
/** Geometry-only LRU: no source bytes, assets, workbook identities or mutable nodes are retained. */
export function getPictureCropShapeGeometry(
  shape: PictureCropShape | undefined,
  width: number,
  height: number,
): ShapePresetGeometry | undefined {
  if (!shape) return;
  const key = JSON.stringify([shape, width, height]);
  let result = cache.get(key);
  if (result) {
    cache.delete(key);
    cache.set(key, result);
    return result;
  }
  result = evaluateShapePreset(shape, width, height);
  if (!getShapePresetFillBounds(result))
    throw new RangeError("Picture shape has no visible fill extent.");
  result = freezeGeometry(result);
  cache.set(key, result);
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
  return result;
}
/** The source's durable ratios stay unchanged; its visual mapping spans the filled shape bounds. */
export function getPictureShapeSourceRect(
  geometry: ResolvedPictureFrame,
  shape: ShapePresetGeometry,
): PictureFrameRect {
  const bounds = getShapePresetFillBounds(shape),
    source = geometry.sourceRect,
    frame = geometry.rect;
  if (!bounds || !source || geometry.collapsed)
    throw new RangeError("Picture shape source geometry is unavailable.");
  return {
    x: bounds.left + ((source.x - frame.x) / frame.width) * bounds.width,
    y: bounds.top + ((source.y - frame.y) / frame.height) * bounds.height,
    width: (source.width / frame.width) * bounds.width,
    height: (source.height / frame.height) * bounds.height,
  };
}
export function getPictureCropShapeWorldBounds(
  picture: FramedFloatingImage | GroupedPicture,
  geometry: ResolvedPictureFrame,
): PictureFrameRect | undefined {
  if (geometry.collapsed) return;
  const shape = getPictureCropShapeGeometry(
    picture.frame.cropShape,
    geometry.rect.width,
    geometry.rect.height,
  );
  if (!shape) return;
  const bounds = getShapePresetFillBounds(shape)!;
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top + bounds.height },
    { x: bounds.left, y: bounds.top + bounds.height },
  ].map((p) => pictureFrameLocalToWorld(geometry.rect, geometry.angleDeg, p));
  const x = Math.min(...corners.map((p) => p.x)),
    y = Math.min(...corners.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...corners.map((p) => p.x)) - x,
    height: Math.max(...corners.map((p) => p.y)) - y,
  };
}
export function pictureCropShapeContainsPoint(
  picture: FramedFloatingImage | GroupedPicture,
  geometry: ResolvedPictureFrame,
  point: Readonly<{ x: number; y: number }>,
): boolean {
  if (geometry.collapsed) return false;
  const shape = getPictureCropShapeGeometry(
    picture.frame.cropShape,
    geometry.rect.width,
    geometry.rect.height,
  );
  return shape
    ? isPointInShapePreset(shape, pictureFrameWorldToLocal(geometry.rect, geometry.angleDeg, point))
    : pictureFrameContainsPoint(geometry, point);
}

/** Convert a visual world drag into the durable source ratios of the filled mapping. */
export function moveShapePictureSource(
  crop: ResolvedPictureCrop,
  shape: PictureCropShape,
  delta: Readonly<{ x: number; y: number }>,
): ResolvedPictureCrop {
  if (![delta.x, delta.y].every(Number.isFinite))
    throw new RangeError("Picture source delta must be finite.");
  const bounds = getShapePresetFillBounds(
    getPictureCropShapeGeometry(shape, crop.layout.rect.width, crop.layout.rect.height)!,
  )!;
  const angle = (crop.layout.angleDeg * Math.PI) / 180;
  const localX = Math.cos(angle) * delta.x + Math.sin(angle) * delta.y;
  const localY = -Math.sin(angle) * delta.x + Math.cos(angle) * delta.y;
  return {
    layout: crop.layout,
    source: normalizePictureSourceFrame({
      ...crop.source,
      offsetXRatio: crop.source.offsetXRatio + localX / bounds.width,
      offsetYRatio: crop.source.offsetYRatio + localY / bounds.height,
    }),
  };
}
/** A crop-handle edit retains the actual mapped source world center and dimensions. */
export function retainShapePictureSource(
  before: ResolvedPictureCrop,
  after: ResolvedPictureCrop,
  shape: PictureCropShape,
): ResolvedPictureCrop {
  const beforeGeometry = getPictureCropShapeGeometry(
    shape,
    before.layout.rect.width,
    before.layout.rect.height,
  )!;
  const source = getPictureShapeSourceRect(
    resolvePictureSourceLayout(before.layout.rect, before.layout.angleDeg, before.source),
    beforeGeometry,
  );
  const center = pictureFrameLocalToWorld(before.layout.rect, before.layout.angleDeg, {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2,
  });
  const local = pictureFrameWorldToLocal(after.layout.rect, after.layout.angleDeg, center);
  const bounds = getShapePresetFillBounds(
    getPictureCropShapeGeometry(shape, after.layout.rect.width, after.layout.rect.height)!,
  )!;
  return {
    layout: after.layout,
    source: normalizePictureSourceFrame({
      widthRatio: source.width / bounds.width,
      heightRatio: source.height / bounds.height,
      offsetXRatio: (local.x - bounds.left - bounds.width / 2) / bounds.width,
      offsetYRatio: (local.y - bounds.top - bounds.height / 2) / bounds.height,
    }),
  };
}
