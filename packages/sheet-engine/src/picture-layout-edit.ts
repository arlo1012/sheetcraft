import { MAX_FLOATING_IMAGE_SIZE, MIN_FLOATING_IMAGE_SIZE } from "@sheetcraft/core/workbook";
import {
  normalizePictureAngle,
  resolvePictureLayout,
  type ResolvedPictureLayout,
} from "@sheetcraft/core/picture-frame";
import type { PictureGroupParentLayout } from "@sheetcraft/core/picture-group-layout";
import type { FloatingImageResizeDirection } from "./floating-image-layout.js";
import type { Point } from "./geometry.js";

export type PictureLayoutResizeOptions = {
  minSize?: number;
  maxSize?: number;
  preserveCornerRatio?: boolean;
};

function finiteDelta(delta: Point): void {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    throw new RangeError("Picture world-layout delta must be finite.");
}

/** Detached world geometry only. No asset, source, worksheet anchor or ownership is invented. */
export function movePictureLayoutBy(
  value: PictureGroupParentLayout,
  delta: Point,
): ResolvedPictureLayout | null {
  finiteDelta(delta);
  const layout = resolvePictureLayout(value.rect, value.angleDeg);
  if (layout.collapsed) return null;
  return resolvePictureLayout(
    { ...layout.rect, x: layout.rect.x + delta.x, y: layout.rect.y + delta.y },
    layout.angleDeg,
  );
}

/** Side handles affect one rotated local axis. Corners can preserve the current ratio. */
export function resizePictureLayoutBy(
  value: PictureGroupParentLayout,
  direction: FloatingImageResizeDirection,
  delta: Point,
  options: PictureLayoutResizeOptions = {},
): ResolvedPictureLayout | null {
  if (!["n", "s", "e", "w", "nw", "ne", "sw", "se"].includes(direction))
    throw new TypeError("Invalid picture world-layout resize handle.");
  finiteDelta(delta);
  const min = options.minSize ?? MIN_FLOATING_IMAGE_SIZE;
  const max = options.maxSize ?? MAX_FLOATING_IMAGE_SIZE;
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < MIN_FLOATING_IMAGE_SIZE ||
    max < min ||
    max > MAX_FLOATING_IMAGE_SIZE
  )
    throw new RangeError("Invalid picture world-layout size budget.");
  if (options.preserveCornerRatio !== undefined && typeof options.preserveCornerRatio !== "boolean")
    throw new TypeError("Invalid picture world-layout ratio policy.");
  const layout = resolvePictureLayout(value.rect, value.angleDeg);
  if (layout.collapsed) return null;
  const rect = layout.rect;
  const angle = (layout.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const local = { x: cos * delta.x + sin * delta.y, y: -sin * delta.x + cos * delta.y };
  finiteDelta(local);
  const horizontal = direction === "e" || direction === "w";
  const vertical = direction === "n" || direction === "s";
  const west = direction.includes("w"),
    north = direction.includes("n");
  if (
    (horizontal && local.x === 0) ||
    (vertical && local.y === 0) ||
    (local.x === 0 && local.y === 0)
  )
    return layout;
  const clamp = (v: number, low: number, high: number) => Math.min(Math.max(v, low), high);
  const maxWidth = Math.max(max, rect.width),
    maxHeight = Math.max(max, rect.height);
  let width = rect.width,
    height = rect.height;
  if (horizontal) width = clamp(rect.width + (west ? -local.x : local.x), min, maxWidth);
  else if (vertical) height = clamp(rect.height + (north ? -local.y : local.y), min, maxHeight);
  else if (!options.preserveCornerRatio) {
    width = clamp(rect.width + (west ? -local.x : local.x), min, maxWidth);
    height = clamp(rect.height + (north ? -local.y : local.y), min, maxHeight);
  } else {
    const sx = 1 + (west ? -local.x : local.x) / rect.width;
    const sy = 1 + (north ? -local.y : local.y) / rect.height;
    const requested = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
    const scale = clamp(
      requested,
      Math.max(min / rect.width, min / rect.height),
      Math.min(maxWidth / rect.width, maxHeight / rect.height),
    );
    width = clamp(rect.width * scale, min, maxWidth);
    height = clamp(rect.height * scale, min, maxHeight);
  }
  if (width === rect.width && height === rect.height) return layout;
  const difference = { x: (width - rect.width) / 2, y: (height - rect.height) / 2 };
  const inset = { x: west ? rect.width - width : 0, y: north ? rect.height - height : 0 };
  return resolvePictureLayout(
    {
      x: rect.x + (cos - 1) * difference.x - sin * difference.y + cos * inset.x - sin * inset.y,
      y: rect.y + sin * difference.x + (cos - 1) * difference.y + sin * inset.x + cos * inset.y,
      width,
      height,
    },
    layout.angleDeg,
  );
}

/** Rotate about the actual target layout center; its owner's inverse placement is separate. */
export function rotatePictureLayoutBy(
  value: PictureGroupParentLayout,
  angleDelta: number,
): ResolvedPictureLayout | null {
  if (!Number.isFinite(angleDelta))
    throw new RangeError("Picture world-layout rotation must be finite.");
  const layout = resolvePictureLayout(value.rect, value.angleDeg);
  if (layout.collapsed) return null;
  return resolvePictureLayout(
    layout.rect,
    normalizePictureAngle(layout.angleDeg + (angleDelta % 360)),
  );
}
