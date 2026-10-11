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
  resolvePictureSourceLayout,
  type PictureFrameRect,
  type ResolvedPictureFrame,
} from "@sheetcraft/core/picture-frame";
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
  if (!isFramedPictureObject(picture))
    throw new TypeError("Prepared framed painting requires a standalone framed picture.");
  const normalized = clonePictureObject(picture);
  paintSourceBearingPictureContent(context, decoded, normalized, geometry);
}

/** Paint an actual owned leaf without inventing a standalone anchor or container source. */
export function paintGroupedPictureContent(
  context: CanvasRenderingContext2D,
  decoded: HTMLImageElement,
  picture: GroupedPicture,
  geometry: ResolvedPictureFrame,
): void {
  if (!isGroupedPicture(picture))
    throw new TypeError("Prepared grouped painting requires a source-bearing owned picture.");
  const normalized = clonePictureGroupChild(picture);
  paintSourceBearingPictureContent(context, decoded, normalized, geometry);
}

function finite(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new RangeError(`${name} must be finite.`);
  return value;
}

function sameCoordinate(actual: number, expected: number): void {
  finite(actual, "Resolved picture coordinate");
  // Pane translation and canonical center projection can differ by a few ulps.
  const tolerance = Number.EPSILON * 32 * Math.max(1, Math.abs(actual), Math.abs(expected));
  if (Math.abs(actual - expected) > tolerance)
    throw new RangeError("Resolved picture geometry must match its canonical frame and source.");
}

function sameRect(actual: PictureFrameRect, expected: PictureFrameRect): void {
  if (!actual || typeof actual !== "object")
    throw new TypeError("Resolved picture geometry requires rectangles.");
  for (const key of ["x", "y", "width", "height"] as const)
    sameCoordinate(actual[key], expected[key]);
  finite(actual.x + actual.width, "Resolved picture right edge");
  finite(actual.y + actual.height, "Resolved picture bottom edge");
  if (
    actual.width < 0 ||
    actual.height < 0 ||
    (actual.width > 0 && actual.x + actual.width === actual.x) ||
    (actual.height > 0 && actual.y + actual.height === actual.y)
  )
    throw new RangeError("Resolved picture rectangle must have representable dimensions.");
}

/** Validate prepared geometry against real source ratios, without a fabricated anchor. */
function validateContentGeometry(
  picture: FramedFloatingImage | GroupedPicture,
  geometry: ResolvedPictureFrame,
): void {
  if (!geometry || typeof geometry !== "object" || typeof geometry.collapsed !== "boolean")
    throw new TypeError("Prepared painting requires resolved picture geometry.");
  const canonical = resolvePictureSourceLayout(
    geometry.rect,
    geometry.angleDeg,
    picture.frame.source,
  );
  if (geometry.angleDeg !== canonical.angleDeg)
    throw new RangeError("Resolved picture angle must be canonical.");
  sameRect(geometry.rect, canonical.rect);
  sameRect(geometry.bounds, canonical.bounds);
  if (!Array.isArray(geometry.corners) || geometry.corners.length !== 4)
    throw new TypeError("Resolved picture geometry requires four corners.");
  for (let index = 0; index < canonical.corners.length; index++) {
    const actual = geometry.corners[index]!;
    if (!actual || typeof actual !== "object")
      throw new TypeError("Resolved picture geometry requires finite corners.");
    sameCoordinate(actual.x, canonical.corners[index]!.x);
    sameCoordinate(actual.y, canonical.corners[index]!.y);
  }
  if (geometry.sourceRect !== null) {
    if (!canonical.sourceRect)
      throw new RangeError("A collapsed picture cannot have resolved source geometry.");
    sameRect(geometry.sourceRect, canonical.sourceRect);
    if (geometry.sourceRect.width <= 0 || geometry.sourceRect.height <= 0)
      throw new RangeError("Picture source dimensions must be positive and finite.");
    finite(geometry.sourceRect.x - geometry.rect.x, "Picture local source x");
    finite(geometry.sourceRect.y - geometry.rect.y, "Picture local source y");
  }
}

/** Both wrappers enter the identical content kernel with their genuine canonical leaf. */
function paintSourceBearingPictureContent(
  context: CanvasRenderingContext2D,
  decoded: HTMLImageElement,
  normalized: FramedFloatingImage | GroupedPicture,
  geometry: ResolvedPictureFrame,
): void {
  validateContentGeometry(normalized, geometry);
  if (normalized.hidden || geometry.collapsed || !geometry.sourceRect) return;
  const appearance = normalized.transform?.appearance;
  // Legacy reflection shrinks the object before drawing. Its different geometry
  // must be integrated deliberately rather than silently applied to a new frame.
  if (appearance?.reflection)
    throw new Error("Framed picture reflection is not supported by this prepared painter.");
  // Transparent-color preparation may allocate a canvas. Reject unavailable
  // decoded dimensions and invalid derived clipping before requesting it.
  validateSourceDimensions(decoded.naturalWidth, decoded.naturalHeight);
  const { rect, sourceRect } = geometry;
  const sx = finite(sourceRect.x - rect.x, "Picture local source x"),
    sy = finite(sourceRect.y - rect.y, "Picture local source y");
  const left = Math.max(0, sx),
    top = Math.max(0, sy);
  const right = Math.min(rect.width, finite(sx + sourceRect.width, "Picture local source right")),
    bottom = Math.min(rect.height, finite(sy + sourceRect.height, "Picture local source bottom"));
  const flipX = normalized.frame.flipHorizontal === true,
    flipY = normalized.frame.flipVertical === true;
  const crop =
    right > left && bottom > top
      ? {
          width: finite(right - left, "Picture draw width"),
          height: finite(bottom - top, "Picture draw height"),
          u: finite((left - sx) / sourceRect.width, "Picture source crop x"),
          v: finite((top - sy) / sourceRect.height, "Picture source crop y"),
          uw: finite((right - left) / sourceRect.width, "Picture source crop width"),
          vh: finite((bottom - top) / sourceRect.height, "Picture source crop height"),
        }
      : null;
  const pixelCrop = (width: number, height: number) =>
    crop
      ? {
          x: finite((flipX ? 1 - crop.u - crop.uw : crop.u) * width, "Picture pixel crop x"),
          y: finite((flipY ? 1 - crop.v - crop.vh : crop.v) * height, "Picture pixel crop y"),
          width: finite(crop.uw * width, "Picture pixel crop width"),
          height: finite(crop.vh * height, "Picture pixel crop height"),
        }
      : null;
  const validateAnnotationScale = (width: number, height: number): void => {
    if (normalized.transform?.annotations?.length) {
      finite(sourceRect.width / width, "Picture annotation horizontal scale");
      finite(sourceRect.height / height, "Picture annotation vertical scale");
    }
  };
  pixelCrop(decoded.naturalWidth, decoded.naturalHeight);
  validateAnnotationScale(decoded.naturalWidth, decoded.naturalHeight);
  const source = imageAppearanceSource(decoded, appearance);
  const sourceWidth = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  const sourceHeight = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
  validateSourceDimensions(sourceWidth, sourceHeight);
  const pixels = pixelCrop(sourceWidth, sourceHeight);
  validateAnnotationScale(sourceWidth, sourceHeight);
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
    if (crop && pixels) {
      context.save();
      try {
        context.translate(left + (flipX ? crop.width : 0), top + (flipY ? crop.height : 0));
        context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        // Intersect the source in local coordinates before drawing. This keeps
        // blank padding transparent without allocating a frame-sized bitmap,
        // and permits the cropped source's shadow to extend beyond the frame.
        context.drawImage(
          source,
          pixels.x,
          pixels.y,
          pixels.width,
          pixels.height,
          0,
          0,
          crop.width,
          crop.height,
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

function validateSourceDimensions(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new RangeError("Picture source dimensions must be positive and finite.");
}
