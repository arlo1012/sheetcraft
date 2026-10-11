import {
  editResolvedPictureCrop,
  type ResolvedPictureCrop,
} from "@sheetcraft/core/picture-crop-edit";
import {
  resolvePictureLayout,
  type PictureSourceFrame,
  type ResolvedPictureLayout,
} from "@sheetcraft/core/picture-frame";
import { MAX_FLOATING_IMAGE_SIZE, MIN_FLOATING_IMAGE_SIZE } from "@sheetcraft/core/workbook";
import type { FloatingImageResizeDirection } from "./floating-image-layout.js";
import type { Point } from "./geometry.js";
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

function worldDelta(value: Point): Point {
  const fields = dataRecord(value, ["x", "y"], "picture crop world delta");
  return {
    x: finite(fields.x, "Picture crop world x delta"),
    y: finite(fields.y, "Picture crop world y delta"),
  };
}

function checkedCrop(value: ResolvedPictureCrop): ResolvedPictureCrop {
  const fields = dataRecord(value, ["layout", "source"], "resolved picture crop");
  const layout = dataRecord(
    fields.layout,
    ["rect", "angleDeg", "collapsed", "corners", "bounds"],
    "resolved picture crop layout",
  );
  const rect = dataRecord(layout.rect, ["x", "y", "width", "height"], "picture crop rectangle");
  // Core owns source/layout representability checks, including the rotated source
  // footprint. Its unchanged-field path validates without rounding either input.
  editResolvedPictureCrop(
    fields.layout as ResolvedPictureLayout,
    fields.source as PictureSourceFrame,
    { field: "crop-left", value: finite(rect.x, "Picture crop left") },
  );
  return value;
}

function ratio(value: number, extent: number, name: string): number {
  const next = finite(value / extent, name);
  if (value !== 0 && next === 0) throw new RangeError(`${name} underflows.`);
  return next;
}

function checkedResult(
  layout: ResolvedPictureLayout,
  source: PictureSourceFrame,
): ResolvedPictureCrop {
  return editResolvedPictureCrop(layout, source, { field: "crop-left", value: layout.rect.x });
}

/**
 * Drag a crop handle in world coordinates, freely on both axes for corners.
 * The opposite rotated edge/corner and the physical source remain fixed.
 * Source offsets already use visual local axes, irrespective of picture flips.
 * Crop spans clamp to 1–10000 pixels; an existing larger resolved span may only
 * stay unchanged or shrink. Padding beyond the source is allowed.
 * Invalid/collapsed/unrepresentable geometry throws without changing the input.
 */
export function resizeResolvedPictureCropBy(
  value: ResolvedPictureCrop,
  direction: FloatingImageResizeDirection,
  deltaValue: Point,
): ResolvedPictureCrop {
  const delta = worldDelta(deltaValue);
  const current = checkedCrop(value);
  const layout = resizePictureLayoutBy(current.layout, direction, delta, {
    preserveCornerRatio: false,
  });
  if (!layout) throw new RangeError("A collapsed picture must be expanded before crop editing.");
  const before = current.layout.rect;
  const after = layout.rect;
  if (after.width === before.width && after.height === before.height) return value;
  const source = current.source;
  const differenceX = (after.width - before.width) / 2;
  const differenceY = (after.height - before.height) / 2;
  const insetX = direction.includes("w") ? before.width - after.width : 0;
  const insetY = direction.includes("n") ? before.height - after.height : 0;
  return checkedResult(layout, {
    ...source,
    ...(after.width === before.width
      ? {}
      : {
          widthRatio: ratio(before.width * source.widthRatio, after.width, "Source width ratio"),
          offsetXRatio: ratio(
            before.width * source.offsetXRatio - differenceX - insetX,
            after.width,
            "Source x offset ratio",
          ),
        }),
    ...(after.height === before.height
      ? {}
      : {
          heightRatio: ratio(
            before.height * source.heightRatio,
            after.height,
            "Source height ratio",
          ),
          offsetYRatio: ratio(
            before.height * source.offsetYRatio - differenceY - insetY,
            after.height,
            "Source y offset ratio",
          ),
        }),
  });
}

/**
 * Move the source under a fixed crop by a world-space drag. Only its visual local
 * offsets change, by inverse rotation, with no additional inverse for flips.
 * Source dimensions, crop layout and padding policy stay unchanged.
 */
export function moveResolvedPictureCropSourceBy(
  value: ResolvedPictureCrop,
  deltaValue: Point,
): ResolvedPictureCrop {
  const delta = worldDelta(deltaValue);
  const current = checkedCrop(value);
  if (delta.x === 0 && delta.y === 0) return value;
  const { layout, source } = current;
  const { rect } = layout;
  const radians = ((layout.angleDeg % 360) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const localX = finite(cos * delta.x + sin * delta.y, "Picture source local x delta");
  const localY = finite(-sin * delta.x + cos * delta.y, "Picture source local y delta");
  const offsetX = rect.width * source.offsetXRatio;
  const offsetY = rect.height * source.offsetYRatio;
  const nextOffsetX = offsetX + localX;
  const nextOffsetY = offsetY + localY;
  const offsetXRatio =
    nextOffsetX === offsetX
      ? source.offsetXRatio
      : ratio(nextOffsetX, rect.width, "Source x offset ratio");
  const offsetYRatio =
    nextOffsetY === offsetY
      ? source.offsetYRatio
      : ratio(nextOffsetY, rect.height, "Source y offset ratio");
  if (offsetXRatio === source.offsetXRatio && offsetYRatio === source.offsetYRatio) return value;
  return checkedResult(layout, { ...source, offsetXRatio, offsetYRatio });
}

/**
 * Fit the requested width/height ratio inside the complete source dimensions.
 * Center the crop on the source's unrotated layout center and clear visual offsets;
 * retain source dimensions and picture angle. At a nonzero angle this deliberately
 * does not preserve the source's previous rotated world-space placement.
 * The fitted crop must be 1–10000 pixels on each axis; invalid fits throw.
 */
export function fitResolvedPictureCropToRatio(
  value: ResolvedPictureCrop,
  ratioValue: number,
): ResolvedPictureCrop {
  const aspect = finite(ratioValue, "Picture crop aspect ratio");
  if (aspect <= 0) throw new RangeError("Picture crop aspect ratio must be positive.");
  const current = checkedCrop(value);
  const { rect, angleDeg } = current.layout;
  const source = current.source;
  const sourceWidth = rect.width * source.widthRatio;
  const sourceHeight = rect.height * source.heightRatio;
  const width = Math.min(sourceWidth, sourceHeight * aspect);
  const height = width / aspect;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < MIN_FLOATING_IMAGE_SIZE ||
    width > MAX_FLOATING_IMAGE_SIZE ||
    height < MIN_FLOATING_IMAGE_SIZE ||
    height > MAX_FLOATING_IMAGE_SIZE
  )
    throw new RangeError(
      `Fitted picture crop dimensions must be ${MIN_FLOATING_IMAGE_SIZE}–${MAX_FLOATING_IMAGE_SIZE} pixels.`,
    );
  if (
    source.offsetXRatio === 0 &&
    source.offsetYRatio === 0 &&
    width === rect.width &&
    height === rect.height
  )
    return value;
  const x = rect.x + rect.width / 2 + rect.width * source.offsetXRatio - width / 2;
  const y = rect.y + rect.height / 2 + rect.height * source.offsetYRatio - height / 2;
  return checkedResult(resolvePictureLayout({ x, y, width, height }, angleDeg), {
    widthRatio: ratio(sourceWidth, width, "Source width ratio"),
    heightRatio: ratio(sourceHeight, height, "Source height ratio"),
    offsetXRatio: 0,
    offsetYRatio: 0,
  });
}
