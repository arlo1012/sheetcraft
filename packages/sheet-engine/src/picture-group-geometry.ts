import { MAX_FLOATING_IMAGE_SIZE, MIN_FLOATING_IMAGE_SIZE } from "@sheetcraft/core/workbook";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  anchorPictureFrameRect,
  normalizePictureAngle,
  pictureFrameContainsPoint,
  type PictureFrameRect,
  type ResolvedPictureLayout,
} from "@sheetcraft/core/picture-frame";
import type {
  PictureGroup,
  PictureGroupChild,
  PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import type { Point, Rect } from "./geometry.js";
import type { FrozenPaneId } from "./frozen-layout.js";
import type { FloatingImageResizeDirection } from "./floating-image-layout.js";
import {
  getPicturePaneTranslation,
  type PictureFrameLayoutContext,
} from "./picture-frame-layout.js";
import type { SheetViewportLayout } from "./viewport-layout.js";

export type PictureGroupResizeOptions = {
  minSize?: number;
  maxSize?: number;
  /** Side handles always edit their own local axis. Group corners default to unlocked. */
  preserveCornerRatio?: boolean;
};
export type PictureGroupNumericSizeEdit = { axis: "width" | "height"; value: number };
export type PictureGroupViewportFragment = {
  paneId: FrozenPaneId;
  path: PictureGroupPath;
  /** Source-free root layout; this is temporary viewport geometry, never a durable frame. */
  geometry: ResolvedPictureLayout;
  clippedBounds: Rect;
};

/** Project only a source-free container layout, preserving its orthogonal corners. */
export function projectPictureGroupLayoutIntoPane(
  layout: ResolvedPictureLayout,
  paneId: FrozenPaneId,
  viewport: SheetViewportLayout,
): ResolvedPictureLayout {
  const delta = getPicturePaneTranslation(paneId, viewport);
  const translate = <T extends Point>(point: T): T => ({
    ...point,
    x: point.x + delta.x,
    y: point.y + delta.y,
  });
  return {
    rect: translate(layout.rect),
    angleDeg: layout.angleDeg,
    collapsed: layout.collapsed,
    corners: layout.corners.map(translate) as ResolvedPictureLayout["corners"],
    bounds: translate(layout.bounds),
  };
}

/** Root frame fragments only. Descendant paint/hit uses the canonical resolved ownership tree. */
export function getPictureGroupViewportFragments(
  group: PictureGroup,
  context: PictureFrameLayoutContext,
): PictureGroupViewportFragment[] {
  const resolved = resolvePictureGroup(group, context.metrics);
  if (!resolved.visible) return [];
  return (["topLeft", "top", "left", "body"] as const).flatMap((paneId) => {
    const geometry = projectPictureGroupLayoutIntoPane(resolved.layout, paneId, context.layout);
    const clip = context.layout.panes[paneId].clip;
    const x = Math.max(geometry.bounds.x, clip.x),
      y = Math.max(geometry.bounds.y, clip.y);
    const right = Math.min(geometry.bounds.x + geometry.bounds.width, clip.x + clip.width),
      bottom = Math.min(geometry.bounds.y + geometry.bounds.height, clip.y + clip.height);
    return right > x && bottom > y
      ? [
          {
            paneId,
            path: resolved.path,
            geometry,
            clippedBounds: { x, y, width: right - x, height: bottom - y },
          },
        ]
      : [];
  });
}

/** Hit the root frame polygon inside its pane clip, not its axis-aligned bounding box. */
export function pictureGroupContainsViewportPoint(
  group: PictureGroup,
  point: Point,
  context: PictureFrameLayoutContext,
): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError("Picture group hit coordinates must be finite.");
  return getPictureGroupViewportFragments(group, context).some(({ paneId, geometry }) => {
    const clip = context.layout.panes[paneId].clip;
    return (
      point.x >= clip.x &&
      point.x < clip.x + clip.width &&
      point.y >= clip.y &&
      point.y < clip.y + clip.height &&
      pictureFrameContainsPoint(geometry, point)
    );
  });
}

function finiteDelta(delta: Point, action: string): void {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    throw new RangeError(`Picture group ${action} must be finite.`);
}

/** Change just the root anchor, then reject the complete plan if any descendant cannot resolve. */
function withRect(
  original: PictureGroup,
  rect: PictureFrameRect,
  metrics: PictureSheetMetrics,
): PictureGroup {
  const frame = original.frame;
  const next: PictureGroup = {
    ...original,
    frame: {
      ...frame,
      anchor: anchorPictureFrameRect(frame.anchor.mode, rect, metrics, frame.anchor),
    },
  };
  resolvePictureGroup(next, metrics);
  return next;
}

/** Translate the sheet-anchored root; normalized child rectangles and relative angles stay intact. */
export function movePictureGroupBy(
  group: PictureGroup,
  delta: Point,
  metrics: PictureSheetMetrics,
): PictureGroup | null {
  finiteDelta(delta, "movement");
  const { node: original, layout } = resolvePictureGroup(group, metrics);
  if (layout.collapsed) return null;
  const x = layout.rect.x + delta.x,
    y = layout.rect.y + delta.y;
  if (x === layout.rect.x && y === layout.rect.y) return original;
  return withRect(original, { ...layout.rect, x, y }, metrics);
}

/**
 * Resize along rotated local axes, fixing the opposite edge/corner. Unequal
 * root scaling reaches each child's unrotated layout before its local rotation.
 * The complete hidden subtree is validated before a detached plan is returned.
 */
export function resizePictureGroupBy(
  group: PictureGroup,
  direction: FloatingImageResizeDirection,
  delta: Point,
  metrics: PictureSheetMetrics,
  options: PictureGroupResizeOptions = {},
): PictureGroup | null {
  if (!["n", "s", "e", "w", "nw", "ne", "sw", "se"].includes(direction))
    throw new TypeError("Invalid picture group resize handle.");
  finiteDelta(delta, "resizing");
  const min = options.minSize ?? MIN_FLOATING_IMAGE_SIZE,
    max = options.maxSize ?? MAX_FLOATING_IMAGE_SIZE;
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < MIN_FLOATING_IMAGE_SIZE ||
    max < min ||
    max > MAX_FLOATING_IMAGE_SIZE
  )
    throw new RangeError("Invalid picture group resize budget.");
  if (options.preserveCornerRatio !== undefined && typeof options.preserveCornerRatio !== "boolean")
    throw new TypeError("Invalid picture group corner ratio option.");
  const { node: original, layout } = resolvePictureGroup(group, metrics);
  if (layout.collapsed) return null;
  const rect = layout.rect,
    angle = (layout.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const local = { x: cos * delta.x + sin * delta.y, y: -sin * delta.x + cos * delta.y };
  finiteDelta(local, "local resize delta");
  const west = direction.includes("w"),
    north = direction.includes("n");
  const horizontal = direction === "e" || direction === "w",
    vertical = direction === "n" || direction === "s";
  // Do not normalize a logical anchor for a zero or purely orthogonal side drag.
  if (
    (horizontal && local.x === 0) ||
    (vertical && local.y === 0) ||
    (local.x === 0 && local.y === 0)
  )
    return original;
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  const maxWidth = Math.max(max, rect.width),
    maxHeight = Math.max(max, rect.height);
  let width = rect.width,
    height = rect.height;
  if (horizontal) width = clamp(rect.width + (west ? -local.x : local.x), min, maxWidth);
  else if (vertical) height = clamp(rect.height + (north ? -local.y : local.y), min, maxHeight);
  else if (!(options.preserveCornerRatio ?? original.lockAspectRatio === true)) {
    width = clamp(rect.width + (west ? -local.x : local.x), min, maxWidth);
    height = clamp(rect.height + (north ? -local.y : local.y), min, maxHeight);
  } else {
    const sx = 1 + (west ? -local.x : local.x) / rect.width,
      sy = 1 + (north ? -local.y : local.y) / rect.height;
    const requested = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
    const scale = clamp(
      requested,
      Math.max(min / rect.width, min / rect.height),
      Math.min(maxWidth / rect.width, maxHeight / rect.height),
    );
    // Match the framed planner's boundary rounding repair, without changing the ratio policy.
    width = clamp(rect.width * scale, min, maxWidth);
    height = clamp(rect.height * scale, min, maxHeight);
  }
  if (width === rect.width && height === rect.height) return original;
  const difference = { x: (width - rect.width) / 2, y: (height - rect.height) / 2 };
  const inset = { x: west ? rect.width - width : 0, y: north ? rect.height - height : 0 };
  return withRect(
    original,
    {
      x: rect.x + (cos - 1) * difference.x - sin * difference.y + cos * inset.x - sin * inset.y,
      y: rect.y + sin * difference.x + (cos - 1) * difference.y + sin * inset.x + cos * inset.y,
      width,
      height,
    },
    metrics,
  );
}

function validateDimension(value: number): void {
  if (!Number.isFinite(value) || value < MIN_FLOATING_IMAGE_SIZE || value > MAX_FLOATING_IMAGE_SIZE)
    throw new RangeError(
      `Picture group numeric size must be ${MIN_FLOATING_IMAGE_SIZE}–${MAX_FLOATING_IMAGE_SIZE} pixels.`,
    );
}
function proportionalDimension(value: number, scale: number): number {
  const scaled = value * scale;
  const min = MIN_FLOATING_IMAGE_SIZE,
    max = MAX_FLOATING_IMAGE_SIZE;
  // Same bounded reciprocal-multiplication repair as standalone numeric size edits.
  if (scaled < min && min - scaled <= Number.EPSILON * min * 4) return min;
  if (scaled > max && scaled - max <= Number.EPSILON * max * 4) return max;
  return scaled;
}

/** Set one local dimension with the rotated local NW fixed; group lock defaults to false. */
export function resizePictureGroupTo(
  group: PictureGroup,
  edit: PictureGroupNumericSizeEdit,
  metrics: PictureSheetMetrics,
): PictureGroup | null {
  if (
    !edit ||
    typeof edit !== "object" ||
    Array.isArray(edit) ||
    Object.keys(edit).some((key) => key !== "axis" && key !== "value") ||
    (edit.axis !== "width" && edit.axis !== "height")
  )
    throw new TypeError("Numeric picture group size requires one explicit width or height axis.");
  validateDimension(edit.value);
  const { node: original, layout } = resolvePictureGroup(group, metrics);
  if (layout.collapsed) return null;
  const rect = layout.rect,
    scale = edit.value / rect[edit.axis];
  const width =
    edit.axis === "width"
      ? edit.value
      : original.lockAspectRatio === true
        ? proportionalDimension(rect.width, scale)
        : rect.width;
  const height =
    edit.axis === "height"
      ? edit.value
      : original.lockAspectRatio === true
        ? proportionalDimension(rect.height, scale)
        : rect.height;
  validateDimension(width);
  validateDimension(height);
  if (width === rect.width && height === rect.height) return original;
  const difference = { x: (width - rect.width) / 2, y: (height - rect.height) / 2 };
  const angle = (layout.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  return withRect(
    original,
    {
      x: rect.x + (cos - 1) * difference.x - sin * difference.y,
      y: rect.y + sin * difference.x + (cos - 1) * difference.y,
      width,
      height,
    },
    metrics,
  );
}

/** Rotate about the unchanged root layout center, never a descendant union center. */
export function rotatePictureGroupBy(
  group: PictureGroup,
  angleDelta: number,
  metrics: PictureSheetMetrics,
): PictureGroup | null {
  if (!Number.isFinite(angleDelta)) throw new RangeError("Picture group rotation must be finite.");
  const { node: original, layout } = resolvePictureGroup(group, metrics);
  if (layout.collapsed) return null;
  const angleDeg = normalizePictureAngle(layout.angleDeg + (angleDelta % 360));
  if (angleDeg === layout.angleDeg) return original;
  const next = { ...original, frame: { ...original.frame, angleDeg } };
  resolvePictureGroup(next, metrics);
  return next;
}

export function rotatePictureGroupTo(
  group: PictureGroup,
  angleDeg: number,
  metrics: PictureSheetMetrics,
): PictureGroup | null {
  const normalized = normalizePictureAngle(angleDeg);
  const { node: original, layout } = resolvePictureGroup(group, metrics);
  if (layout.collapsed) return null;
  if (normalized === layout.angleDeg) return original;
  const next = { ...original, frame: { ...original.frame, angleDeg: normalized } };
  resolvePictureGroup(next, metrics);
  return next;
}

/** Mirror an orthogonal ownership tree about its unchanged world layout center. */
export function flipPictureGroup(
  group: PictureGroup,
  axis: "horizontal" | "vertical",
  metrics: PictureSheetMetrics,
): PictureGroup {
  if (axis !== "horizontal" && axis !== "vertical")
    throw new TypeError("Invalid picture group flip axis.");
  // Resolution returns a detached canonical tree and validates hidden content.
  const { node: next } = resolvePictureGroup(group, metrics);
  next.frame.angleDeg = normalizePictureAngle(-next.frame.angleDeg);
  function reflect(child: PictureGroupChild): void {
    const rect = child.frame.rect;
    child.frame.rect = {
      ...rect,
      ...(axis === "horizontal"
        ? { xRatio: 1 - rect.xRatio - rect.widthRatio }
        : { yRatio: 1 - rect.yRatio - rect.heightRatio }),
    };
    child.frame.angleDeg = normalizePictureAngle(-child.frame.angleDeg);
    if (child.kind === "grouped-group-v1") {
      for (const member of child.members) reflect(member);
    } else if (axis === "horizontal") {
      child.frame.flipHorizontal = !child.frame.flipHorizontal;
      child.frame.source.offsetXRatio = -child.frame.source.offsetXRatio;
    } else {
      child.frame.flipVertical = !child.frame.flipVertical;
      child.frame.source.offsetYRatio = -child.frame.source.offsetYRatio;
    }
  }
  for (const member of next.members) reflect(member);
  resolvePictureGroup(next, metrics);
  return next;
}
