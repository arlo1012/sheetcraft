import { clonePictureObject, type FramedFloatingImage } from "@sheetcraft/core/picture-object";
import type { ResolvedPictureFrame } from "@sheetcraft/core/picture-frame";
import { imageAppearanceFilter, imageAppearanceSource } from "../../shared/images/imageAppearance";
import { paintImageAnnotations } from "../../shared/images/imageAnnotations";

/**
 * Draw a prepared frame using the same resolved local rectangle as selection
 * and hit testing. The caller owns frozen-pane clipping and source availability.
 * This is not yet a persisted-model or promotion entrypoint.
 */
export function paintFramedPictureContent(
  context: CanvasRenderingContext2D,
  decoded: HTMLImageElement,
  picture: FramedFloatingImage,
  geometry: ResolvedPictureFrame,
): void {
  if (picture.hidden || geometry.collapsed || !geometry.sourceRect) return;
  const normalized = clonePictureObject(picture);
  const appearance = normalized.transform?.appearance;
  // Legacy reflection shrinks the object before drawing. Its different geometry
  // must be integrated deliberately rather than silently applied to a new frame.
  if (appearance?.reflection)
    throw new Error("Framed picture reflection is not supported by this prepared painter.");
  const source = imageAppearanceSource(decoded, appearance);
  const sourceWidth = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  const sourceHeight = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  )
    throw new RangeError("Picture source dimensions must be positive and finite.");
  const { rect, sourceRect } = geometry;
  const sx = sourceRect.x - rect.x,
    sy = sourceRect.y - rect.y;
  const left = Math.max(0, sx),
    top = Math.max(0, sy);
  const right = Math.min(rect.width, sx + sourceRect.width),
    bottom = Math.min(rect.height, sy + sourceRect.height);
  const flipX = normalized.frame.flipHorizontal === true,
    flipY = normalized.frame.flipVertical === true;
  context.save();
  try {
    context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    context.rotate((geometry.angleDeg * Math.PI) / 180);
    context.translate(-rect.width / 2, -rect.height / 2);
    context.globalAlpha *= appearance?.opacity ?? 1;
    context.filter = imageAppearanceFilter(appearance);
    if (appearance?.shadow) {
      context.shadowColor = "rgb(0 0 0 / 35%)";
      context.shadowBlur = appearance.shadow === "soft" ? 8 : 1;
      context.shadowOffsetX = 3;
      context.shadowOffsetY = 3;
    }
    if (right > left && bottom > top) {
      const width = right - left,
        height = bottom - top;
      const u = (left - sx) / sourceRect.width,
        v = (top - sy) / sourceRect.height;
      const uw = width / sourceRect.width,
        vh = height / sourceRect.height;
      context.save();
      try {
        context.translate(left + (flipX ? width : 0), top + (flipY ? height : 0));
        context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        // Intersect the source in local coordinates before drawing. This keeps
        // blank padding transparent without allocating a frame-sized bitmap,
        // and permits the cropped source's shadow to extend beyond the frame.
        context.drawImage(
          source,
          (flipX ? 1 - u - uw : u) * sourceWidth,
          (flipY ? 1 - v - vh : v) * sourceHeight,
          uw * sourceWidth,
          vh * sourceHeight,
          0,
          0,
          width,
          height,
        );
      } finally {
        context.restore();
      }
    }
    context.shadowColor = "transparent";
    if (normalized.transform?.annotations?.length) {
      context.save();
      try {
        context.beginPath();
        context.rect(0, 0, rect.width, rect.height);
        context.clip();
        context.translate(
          sx + (flipX ? sourceRect.width : 0),
          sy + (flipY ? sourceRect.height : 0),
        );
        context.scale(
          ((flipX ? -1 : 1) * sourceRect.width) / sourceWidth,
          ((flipY ? -1 : 1) * sourceRect.height) / sourceHeight,
        );
        paintImageAnnotations(context, normalized.transform.annotations, sourceWidth, sourceHeight);
      } finally {
        context.restore();
      }
    }
    if (appearance?.border) {
      const width = Math.min(appearance.border.width, rect.width, rect.height);
      context.filter = "none";
      context.lineWidth = width;
      context.strokeStyle = appearance.border.color;
      context.strokeRect(width / 2, width / 2, rect.width - width, rect.height - width);
    }
  } finally {
    context.restore();
  }
}
