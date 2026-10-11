import {
  editResolvedPictureCrop,
  type ResolvedPictureCrop,
} from "@sheetcraft/core/picture-crop-edit";
import {
  resolvePictureLayout,
  type PictureFrameRect,
  type PictureSourceFrame,
  type ResolvedPictureLayout,
} from "@sheetcraft/core/picture-frame";
import { MAX_FLOATING_IMAGE_SIZE, MIN_FLOATING_IMAGE_SIZE } from "@sheetcraft/core/workbook";
import { resizePictureLayoutBy } from "./picture-layout-edit.js";

function dataRecord(
  value: unknown,
  keys: readonly string[],
  name: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in descriptor))
      throw new TypeError(`Unknown or non-data ${name} field.`);
    fields[key] = descriptor.value;
  }
  return fields;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new RangeError(`${name} must be finite.`);
  return value;
}

function positive(value: unknown, name: string): number {
  const result = finite(value, name);
  if (result <= 0) throw new RangeError(`${name} must be positive.`);
  return result;
}

function dimension(value: unknown): number {
  const result = finite(value, "Picture size");
  if (result < MIN_FLOATING_IMAGE_SIZE || result > MAX_FLOATING_IMAGE_SIZE)
    throw new RangeError(
      `Picture dimensions must be ${MIN_FLOATING_IMAGE_SIZE}–${MAX_FLOATING_IMAGE_SIZE} pixels.`,
    );
  return result;
}

function rect(value: unknown, name: string): PictureFrameRect {
  const fields = dataRecord(value, ["x", "y", "width", "height"], name);
  return {
    x: finite(fields.x, `${name} x`),
    y: finite(fields.y, `${name} y`),
    width: finite(fields.width, `${name} width`),
    height: finite(fields.height, `${name} height`),
  };
}

function checkedCrop(value: ResolvedPictureCrop): ResolvedPictureCrop {
  const fields = dataRecord(value, ["layout", "source"], "resolved picture crop");
  const layout = dataRecord(
    fields.layout,
    ["rect", "angleDeg", "collapsed", "corners", "bounds"],
    "resolved picture layout",
  );
  const rectangle = rect(layout.rect, "Picture crop rectangle");
  const angleDeg = finite(layout.angleDeg, "Picture angle");
  if (typeof layout.collapsed !== "boolean")
    throw new TypeError("Picture layout collapsed must be a boolean.");
  const bounds = rect(layout.bounds, "Picture layout bounds");
  if (bounds.width < 0 || bounds.height < 0)
    throw new RangeError("Picture layout bounds must have nonnegative spans.");
  if (!Array.isArray(layout.corners)) throw new TypeError("Invalid picture layout corners.");
  const lengthDescriptor = Object.getOwnPropertyDescriptor(layout.corners, "length");
  if (
    Reflect.ownKeys(layout.corners).some(
      (key) => typeof key !== "string" || !["0", "1", "2", "3", "length"].includes(key),
    ) ||
    !lengthDescriptor ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.value !== 4
  )
    throw new TypeError("Invalid picture layout corners.");
  for (const index of ["0", "1", "2", "3"]) {
    const entry = Object.getOwnPropertyDescriptor(layout.corners, index);
    if (!entry || !("value" in entry))
      throw new TypeError("Picture layout corners must contain own data points.");
    const point = dataRecord(entry.value, ["x", "y"], "picture layout corner");
    finite(point.x, "Picture corner x");
    finite(point.y, "Picture corner y");
  }
  const source = dataRecord(
    fields.source,
    ["widthRatio", "heightRatio", "offsetXRatio", "offsetYRatio"],
    "picture source frame",
  );
  const checkedSource: PictureSourceFrame = {
    widthRatio: positive(source.widthRatio, "Source width ratio"),
    heightRatio: positive(source.heightRatio, "Source height ratio"),
    offsetXRatio: finite(source.offsetXRatio, "Source x offset ratio"),
    offsetYRatio: finite(source.offsetYRatio, "Source y offset ratio"),
  };
  // Only own data reaches Core. Its unchanged-field path verifies source center,
  // unrotated extents and the rotated source footprint without rounding ratios.
  const checkedLayout = resolvePictureLayout(rectangle, angleDeg);
  return editResolvedPictureCrop(checkedLayout, checkedSource, {
    field: "crop-left",
    value: rectangle.x,
  });
}

function checkedResult(
  layout: ResolvedPictureLayout,
  source: PictureSourceFrame,
): ResolvedPictureCrop {
  const sourceData = dataRecord(
    source,
    ["widthRatio", "heightRatio", "offsetXRatio", "offsetYRatio"],
    "picture source frame",
  ) as PictureSourceFrame;
  editResolvedPictureCrop(layout, sourceData, { field: "crop-left", value: layout.rect.x });
  return { layout, source };
}

/**
 * Scale the local crop frame, source dimensions and source offsets together.
 * Normalized source ratios and angle stay exact; the rotated local NW stays fixed.
 * Callers choose aspect-lock coupling and percentage denominators explicitly.
 * Both resulting frame axes must be 1–10000 pixels, with no budget clamping.
 * Invalid/unrepresentable geometry throws atomically; exact no-ops retain input.
 */
export function scaleResolvedPictureCropBy(
  value: ResolvedPictureCrop,
  factorValue: { widthFactor: number; heightFactor: number },
): ResolvedPictureCrop {
  const factors = dataRecord(factorValue, ["widthFactor", "heightFactor"], "picture scale factors");
  const widthFactor = positive(factors.widthFactor, "Picture width factor");
  const heightFactor = positive(factors.heightFactor, "Picture height factor");
  const current = checkedCrop(value);
  const { rect, angleDeg } = current.layout;
  const width = dimension(rect.width * widthFactor);
  const height = dimension(rect.height * heightFactor);
  if (width === rect.width && height === rect.height) return value;

  const dx = width - rect.width;
  const dy = height - rect.height;
  const angle = ((angleDeg % 360) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const resized = resizePictureLayoutBy(
    current.layout,
    "se",
    { x: cos * dx - sin * dy, y: sin * dx + cos * dy },
    { preserveCornerRatio: false },
  );
  if (!resized) throw new RangeError("A collapsed picture must be expanded before scaling.");
  // R^-1 R can change a target by a few ulps, including an unaffected local axis.
  // Keep the prevalidated dimensions, correcting only that projection round-off.
  const correctionX = (width - resized.rect.width) / 2;
  const correctionY = (height - resized.rect.height) / 2;
  const layout =
    correctionX === 0 && correctionY === 0
      ? resized
      : resolvePictureLayout(
          {
            x: resized.rect.x + (cos - 1) * correctionX - sin * correctionY,
            y: resized.rect.y + sin * correctionX + (cos - 1) * correctionY,
            width,
            height,
          },
          angleDeg,
        );
  return checkedResult(layout, value.source);
}

/**
 * Restore the real current source's natural pixel size, clear crop and rotation,
 * and retain the unrotated layout x/y. Picture appearance and flips are owned by
 * the caller, outside this geometry-only API. Natural axes must be 1–10000 pixels.
 */
export function resetResolvedPictureToOriginalSize(
  value: ResolvedPictureCrop,
  sizeValue: { width: number; height: number },
): ResolvedPictureCrop {
  const size = dataRecord(sizeValue, ["width", "height"], "picture original size");
  const width = dimension(size.width);
  const height = dimension(size.height);
  const current = checkedCrop(value);
  const { rect, angleDeg } = current.layout;
  const source = current.source;
  if (
    rect.width === width &&
    rect.height === height &&
    angleDeg === 0 &&
    source.widthRatio === 1 &&
    source.heightRatio === 1 &&
    source.offsetXRatio === 0 &&
    source.offsetYRatio === 0
  )
    return value;
  return checkedResult(resolvePictureLayout({ x: rect.x, y: rect.y, width, height }, 0), {
    widthRatio: 1,
    heightRatio: 1,
    offsetXRatio: 0,
    offsetYRatio: 0,
  });
}
