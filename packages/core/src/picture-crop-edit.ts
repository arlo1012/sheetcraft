import {
  normalizePictureSourceFrame,
  pictureFrameLocalToWorld,
  resolvePictureSourceLayout,
  type PictureFrameRect,
  type PictureSourceFrame,
  type ResolvedPictureLayout,
} from "./picture-frame.js";
import { MAX_FLOATING_IMAGE_SIZE, MIN_FLOATING_IMAGE_SIZE } from "./workbook.js";

export type PictureCropEditField =
  | "source-width"
  | "source-height"
  | "source-offset-x"
  | "source-offset-y"
  | "crop-width"
  | "crop-height"
  | "crop-left"
  | "crop-top";
export type PictureCropEdit = { field: PictureCropEditField; value: number };
export type ResolvedPictureCrop = {
  layout: ResolvedPictureLayout;
  source: PictureSourceFrame;
};

type CropGeometry = ResolvedPictureCrop & {
  sourceWidth: number;
  sourceHeight: number;
  offsetX: number;
  offsetY: number;
};

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new RangeError(`${name} must be finite.`);
  return value === 0 ? 0 : value;
}
function dimension(value: number): number {
  if (value < MIN_FLOATING_IMAGE_SIZE || value > MAX_FLOATING_IMAGE_SIZE)
    throw new RangeError(
      `Edited picture dimensions must be ${MIN_FLOATING_IMAGE_SIZE}–${MAX_FLOATING_IMAGE_SIZE} pixels.`,
    );
  return value;
}
function scaled(value: number, extent: number, name: string): number {
  const result = finite(value * extent, name);
  if (value !== 0 && result === 0) throw new RangeError(`${name} underflows.`);
  return result;
}
function ratio(value: number, extent: number, name: string): number {
  const result = finite(value / extent, name);
  if (value !== 0 && result === 0) throw new RangeError(`${name} underflows.`);
  return result;
}
function geometry(
  layoutValue: Pick<ResolvedPictureLayout, "rect" | "angleDeg">,
  sourceValue: PictureSourceFrame,
): CropGeometry {
  const source = normalizePictureSourceFrame(sourceValue);
  const { sourceRect, ...layout } = resolvePictureSourceLayout(
    layoutValue.rect,
    layoutValue.angleDeg,
    source,
  );
  if (layout.collapsed || !sourceRect)
    throw new RangeError("A collapsed picture must be expanded before crop editing.");
  if (
    layout.rect.width / 2 === 0 ||
    layout.rect.height / 2 === 0 ||
    sourceRect.width / 2 === 0 ||
    sourceRect.height / 2 === 0
  )
    throw new RangeError("Picture crop/source center geometry underflows.");
  const offsetX = scaled(source.offsetXRatio, layout.rect.width, "Source x offset");
  const offsetY = scaled(source.offsetYRatio, layout.rect.height, "Source y offset");
  // The public source resolver checks the unrotated extent. Also check the actual
  // rotated source footprint before accepting an edit, including signed padding.
  const centerX = layout.rect.width / 2 + offsetX;
  const centerY = layout.rect.height / 2 + offsetY;
  const corners = [-sourceRect.width / 2, sourceRect.width / 2].flatMap((x) =>
    [-sourceRect.height / 2, sourceRect.height / 2].map((y) =>
      pictureFrameLocalToWorld(layout.rect, layout.angleDeg, {
        x: centerX + x,
        y: centerY + y,
      }),
    ),
  );
  if (
    [corners[1]!, corners[2]!].some(
      (point) => point.x === corners[0]!.x && point.y === corners[0]!.y,
    )
  )
    throw new RangeError("Picture source extent cannot be represented in world coordinates.");
  return {
    layout,
    source,
    sourceWidth: sourceRect.width,
    sourceHeight: sourceRect.height,
    offsetX,
    offsetY,
  };
}
function result(
  rect: PictureFrameRect,
  angleDeg: number,
  source: PictureSourceFrame,
): ResolvedPictureCrop {
  const next = geometry({ rect, angleDeg }, source);
  return { layout: next.layout, source: next.source };
}
function readEdit(edit: PictureCropEdit): PictureCropEdit {
  if (!edit || typeof edit !== "object" || Array.isArray(edit))
    throw new TypeError("Invalid picture crop edit.");
  const fields: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(edit)) {
    const descriptor = Object.getOwnPropertyDescriptor(edit, key)!;
    if (typeof key !== "string" || (key !== "field" && key !== "value") || !("value" in descriptor))
      throw new TypeError("Unknown or non-data picture crop edit field.");
    fields[key] = descriptor.value;
  }
  switch (fields.field) {
    case "source-width":
    case "source-height":
    case "source-offset-x":
    case "source-offset-y":
    case "crop-width":
    case "crop-height":
    case "crop-left":
    case "crop-top":
      return { field: fields.field, value: finite(fields.value, "Picture crop edit value") };
    default:
      throw new TypeError("Unknown picture crop edit field.");
  }
}

/**
 * Edit the eight crop-panel fields in pixels, independently of aspect lock.
 * Offsets are the source center relative to the crop's local center, already in
 * visual axes; image flips belong to the picture and do not change this contract.
 * Crop left/top are absolute sheet coordinates of the unrotated layout rectangle.
 * Crop dimensions retain its rotated local NW corner and the physical source.
 * Zero-angle coupling follows the observed WPS fields; rotation is a deliberate
 * source-preserving Core invariant, not a claim of exhaustive WPS compatibility.
 * Invalid/unrepresentable edits throw without mutating either input or clamping.
 */
export function editResolvedPictureCrop(
  layoutValue: ResolvedPictureLayout,
  sourceValue: PictureSourceFrame,
  editValue: PictureCropEdit,
): ResolvedPictureCrop {
  const edit = readEdit(editValue);
  const current = geometry(layoutValue, sourceValue);
  const { layout, source, sourceWidth, sourceHeight, offsetX, offsetY } = current;
  const { rect, angleDeg } = layout;
  const value = edit.value;
  if (edit.field === "crop-width" || edit.field === "crop-height") dimension(value);
  if ((edit.field === "source-width" || edit.field === "source-height") && value <= 0)
    throw new RangeError("Edited picture source dimensions must be positive.");
  const unchanged =
    edit.field === "source-width"
      ? sourceWidth
      : edit.field === "source-height"
        ? sourceHeight
        : edit.field === "source-offset-x"
          ? offsetX
          : edit.field === "source-offset-y"
            ? offsetY
            : edit.field === "crop-width"
              ? rect.width
              : edit.field === "crop-height"
                ? rect.height
                : edit.field === "crop-left"
                  ? rect.x
                  : rect.y;
  // Do not round-trip an unchanged source through division or inverse rotation.
  if (value === unchanged) return { layout: layoutValue, source: sourceValue };
  switch (edit.field) {
    case "source-width":
      return result(rect, angleDeg, {
        ...source,
        widthRatio: ratio(value, rect.width, "Source width ratio"),
      });
    case "source-height":
      return result(rect, angleDeg, {
        ...source,
        heightRatio: ratio(value, rect.height, "Source height ratio"),
      });
    case "source-offset-x":
      return result(rect, angleDeg, {
        ...source,
        offsetXRatio: ratio(value, rect.width, "Source x offset ratio"),
      });
    case "source-offset-y":
      return result(rect, angleDeg, {
        ...source,
        offsetYRatio: ratio(value, rect.height, "Source y offset ratio"),
      });
    case "crop-width":
    case "crop-height": {
      const width = dimension(edit.field === "crop-width" ? value : rect.width);
      const height = dimension(edit.field === "crop-height" ? value : rect.height);
      const dx = (width - rect.width) / 2;
      const dy = (height - rect.height) / 2;
      const angle = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return result(
        {
          x: rect.x + (cos - 1) * dx - sin * dy,
          y: rect.y + sin * dx + (cos - 1) * dy,
          width,
          height,
        },
        angleDeg,
        {
          ...source,
          ...(edit.field === "crop-width"
            ? {
                widthRatio: ratio(sourceWidth, width, "Source width ratio"),
                offsetXRatio: ratio(offsetX - dx, width, "Source x offset ratio"),
              }
            : {
                heightRatio: ratio(sourceHeight, height, "Source height ratio"),
                offsetYRatio: ratio(offsetY - dy, height, "Source y offset ratio"),
              }),
        },
      );
    }
    case "crop-left":
    case "crop-top": {
      const x = edit.field === "crop-left" ? value : rect.x;
      const y = edit.field === "crop-top" ? value : rect.y;
      const dx = finite(rect.x - x, "Crop x displacement");
      const dy = finite(rect.y - y, "Crop y displacement");
      const angle = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const localX = cos * dx + sin * dy;
      const localY = -sin * dx + cos * dy;
      return result({ ...rect, x, y }, angleDeg, {
        ...source,
        offsetXRatio:
          localX === 0
            ? source.offsetXRatio
            : ratio(offsetX + localX, rect.width, "Source x offset ratio"),
        offsetYRatio:
          localY === 0
            ? source.offsetYRatio
            : ratio(offsetY + localY, rect.height, "Source y offset ratio"),
      });
    }
  }
}

/**
 * Expand to the current unrotated source rectangle and clear crop offsets.
 * Reset follows source layout coordinates, without rotating the offset vector;
 * unlike ordinary crop edge edits, physical source placement may change.
 */
export function resetResolvedPictureCrop(
  layoutValue: ResolvedPictureLayout,
  sourceValue: PictureSourceFrame,
): ResolvedPictureCrop {
  const { layout, source, sourceWidth, sourceHeight, offsetX, offsetY } = geometry(
    layoutValue,
    sourceValue,
  );
  const width = dimension(sourceWidth);
  const height = dimension(sourceHeight);
  if (
    source.widthRatio === 1 &&
    source.heightRatio === 1 &&
    source.offsetXRatio === 0 &&
    source.offsetYRatio === 0
  )
    return { layout: layoutValue, source: sourceValue };
  const { rect, angleDeg } = layout;
  return result(
    {
      x: rect.x + (rect.width - width) / 2 + offsetX,
      y: rect.y + (rect.height - height) / 2 + offsetY,
      width,
      height,
    },
    angleDeg,
    { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
  );
}
