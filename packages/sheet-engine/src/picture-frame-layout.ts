import {
  DEFAULT_ROW_HEIGHT,
  MAX_FLOATING_IMAGE_SIZE,
  getDefaultColumnWidth,
  type Sheet,
} from "@sheetcraft/core/workbook";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import {
  anchorPictureFrameRect,
  clonePictureFrame,
  resolvePictureFrame,
  pictureFrameContainsPoint,
  type ResolvedPictureFrame,
} from "@sheetcraft/core/picture-frame";
import { clonePictureObject, type FramedFloatingImage } from "@sheetcraft/core/picture-object";
import type { Point, Rect, SheetGeometry } from "./geometry.js";
import type { RowVisibilityIndex } from "./visibility.js";
import type { FrozenPaneId } from "./frozen-layout.js";
import type { SheetViewportLayout } from "./viewport-layout.js";
import type { FloatingImageResizeDirection } from "./floating-image-layout.js";

/**
 * View visibility is projected separately from durable workbook locations.
 * Geometry and rows must use the same unscaled dimensions as the supplied sheet;
 * a page-projection geometry requires a separate projection, not this adapter.
 */
export function createPictureViewMetrics(
  sheet: Sheet,
  geometry: SheetGeometry,
  rows: RowVisibilityIndex,
  options: { effectiveRowHeights?: ReadonlyMap<number, number> } = {},
): PictureSheetMetrics {
  if (geometry.rowCount !== rows.rowCount)
    throw new RangeError("Picture row metrics must share the viewport's logical count.");
  if (
    geometry.rowHeight !== DEFAULT_ROW_HEIGHT ||
    geometry.columnWidth !== getDefaultColumnWidth(sheet)
  )
    throw new RangeError(
      "Picture view geometry must use the worksheet's unscaled default dimensions.",
    );
  let defaultRow = rows.getLogicalRow(0);
  while (
    defaultRow !== null &&
    (sheet.rowHeights.has(defaultRow) || options.effectiveRowHeights?.has(defaultRow))
  )
    defaultRow = rows.getNextVisibleRow(defaultRow);
  if (defaultRow !== null && rows.getVisibleRow(defaultRow)!.height !== DEFAULT_ROW_HEIGHT)
    throw new RangeError("Picture row visibility must use the worksheet's default height.");
  const base = createPictureSheetMetrics(sheet);
  const rowEnd = rows.getTotalHeight();
  const columnEnd = geometry.getTotalSize().width;
  const rowDelta = rowEnd - base.rows.visiblePrefix(rows.rowCount);
  const columnDelta = columnEnd - base.columns.visiblePrefix(geometry.columnCount);
  return {
    rows: {
      ...base.rows,
      visibleSize: (index) => {
        base.rows.nominalSize(index);
        return index < rows.rowCount
          ? (rows.getVisibleRow(index)?.height ?? 0)
          : base.rows.visibleSize(index);
      },
      visiblePrefix: (index) => {
        const fallback = base.rows.visiblePrefix(index);
        return index <= rows.rowCount ? rows.getBoundaryOffset(index)! : fallback + rowDelta;
      },
    },
    columns: {
      ...base.columns,
      visibleSize: (index) => {
        base.columns.nominalSize(index);
        return index < geometry.columnCount
          ? geometry.getColumnWidth(index)
          : base.columns.visibleSize(index);
      },
      visiblePrefix: (index) => {
        const fallback = base.columns.visiblePrefix(index);
        return index === geometry.columnCount
          ? columnEnd
          : index < geometry.columnCount
            ? geometry.getColumnOffset(index)
            : fallback + columnDelta;
      },
    },
  };
}

export type PictureFrameLayoutContext = {
  layout: SheetViewportLayout;
  metrics: PictureSheetMetrics;
};
export type FramedPictureViewportFragment = {
  paneId: FrozenPaneId;
  geometry: ResolvedPictureFrame;
  /** Bounds used only for visibility/clipping; hit testing uses the actual quadrilateral. */
  clippedBounds: Rect;
};

export function getPicturePaneTranslation(
  paneId: FrozenPaneId,
  layout: SheetViewportLayout,
): Point {
  const pane = layout.panes[paneId];
  return {
    x:
      paneId === "topLeft" || paneId === "left"
        ? 0
        : pane.clip.x - layout.frozenSize.width - layout.bodyScrollPosition.x,
    y:
      paneId === "topLeft" || paneId === "top"
        ? 0
        : pane.clip.y - layout.frozenSize.height - layout.bodyScrollPosition.y,
  };
}

export function pictureViewportPointToSheet(
  point: Point,
  paneId: FrozenPaneId,
  layout: SheetViewportLayout,
): Point {
  const delta = getPicturePaneTranslation(paneId, layout);
  return { x: point.x - delta.x, y: point.y - delta.y };
}

export function projectPictureFrameIntoPane(
  geometry: ResolvedPictureFrame,
  paneId: FrozenPaneId,
  layout: SheetViewportLayout,
): ResolvedPictureFrame {
  const delta = getPicturePaneTranslation(paneId, layout);
  const translate = <T extends Point>(point: T): T => ({
    ...point,
    x: point.x + delta.x,
    y: point.y + delta.y,
  });
  return {
    ...geometry,
    rect: translate(geometry.rect),
    sourceRect: geometry.sourceRect ? translate(geometry.sourceRect) : null,
    corners: geometry.corners.map(translate) as ResolvedPictureFrame["corners"],
    bounds: translate(geometry.bounds),
  };
}

function intersection(left: Rect, right: Rect): Rect | null {
  const x = Math.max(left.x, right.x),
    y = Math.max(left.y, right.y);
  const endX = Math.min(left.x + left.width, right.x + right.width);
  const endY = Math.min(left.y + left.height, right.y + right.height);
  return endX > x && endY > y ? { x, y, width: endX - x, height: endY - y } : null;
}

export function getFramedPictureViewportFragments(
  image: FramedFloatingImage,
  context: PictureFrameLayoutContext,
): FramedPictureViewportFragment[] {
  if (image.hidden) return [];
  const geometry = resolvePictureFrame(image.frame, context.metrics);
  if (geometry.collapsed) return [];
  return (["topLeft", "top", "left", "body"] as const).flatMap((paneId) => {
    const projected = projectPictureFrameIntoPane(geometry, paneId, context.layout);
    const clippedBounds = intersection(projected.bounds, context.layout.panes[paneId].clip);
    return clippedBounds ? [{ paneId, geometry: projected, clippedBounds }] : [];
  });
}

export function framedPictureContainsViewportPoint(
  image: FramedFloatingImage,
  point: Point,
  context: PictureFrameLayoutContext,
): boolean {
  return getFramedPictureViewportFragments(image, context).some((fragment) => {
    const clip = context.layout.panes[fragment.paneId].clip;
    return (
      point.x >= clip.x &&
      point.x < clip.x + clip.width &&
      point.y >= clip.y &&
      point.y < clip.y + clip.height &&
      pictureFrameContainsPoint(fragment.geometry, point)
    );
  });
}

/** Moves the local object frame; source ratios, rotation and durable anchor mode are unchanged. */
export function moveFramedPictureBy(
  image: FramedFloatingImage,
  delta: Point,
  metrics: PictureSheetMetrics,
): FramedFloatingImage | null {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    throw new RangeError("Picture movement must be finite.");
  const original = clonePictureObject(image);
  const geometry = resolvePictureFrame(original.frame, metrics);
  if (geometry.collapsed) return null;
  const frame = clonePictureFrame(original.frame);
  frame.anchor = anchorPictureFrameRect(
    frame.anchor.mode,
    {
      ...geometry.rect,
      x: geometry.rect.x + delta.x,
      y: geometry.rect.y + delta.y,
    },
    metrics,
    frame.anchor,
  );
  // Planning must reject an overflowing source/corner before any consumer commits.
  resolvePictureFrame(frame, metrics);
  return { ...original, frame };
}

export type FramedPictureResizeOptions = {
  minSize?: number;
  maxSize?: number;
  /** Only corner handles use a ratio. Side handles always change their own local axis. */
  preserveCornerRatio?: boolean;
};

/**
 * Resolves a sheet-space drag in rotated local axes. The opposite corner/edge
 * stays fixed. The default corner ratio uses the dominant fractional axis delta,
 * consistent with the measured desktop paths.
 */
export function resizeFramedPictureBy(
  image: FramedFloatingImage,
  direction: FloatingImageResizeDirection,
  delta: Point,
  metrics: PictureSheetMetrics,
  options: FramedPictureResizeOptions = {},
): FramedFloatingImage | null {
  if (!["n", "s", "e", "w", "nw", "ne", "sw", "se"].includes(direction))
    throw new TypeError("Invalid picture resize handle.");
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    throw new RangeError("Picture resizing must be finite.");
  const min = options.minSize ?? 1,
    max = options.maxSize ?? MAX_FLOATING_IMAGE_SIZE;
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min <= 0 ||
    max < min ||
    max > MAX_FLOATING_IMAGE_SIZE
  )
    throw new RangeError("Invalid picture resize budget.");
  if (options.preserveCornerRatio !== undefined && typeof options.preserveCornerRatio !== "boolean")
    throw new TypeError("Invalid picture corner ratio option.");
  const original = clonePictureObject(image);
  const geometry = resolvePictureFrame(original.frame, metrics);
  if (geometry.collapsed) return null;
  const rect = geometry.rect,
    angle = (geometry.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const local = { x: cos * delta.x + sin * delta.y, y: -sin * delta.x + cos * delta.y };
  if (!Number.isFinite(local.x) || !Number.isFinite(local.y))
    throw new RangeError("Picture local resize delta exceeds finite coordinates.");
  const west = direction.includes("w"),
    north = direction.includes("n");
  const horizontal = direction === "e" || direction === "w";
  const vertical = direction === "n" || direction === "s";
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  // Derived row/column growth may exceed the manual budget. Allow gradual
  // shrinking without jumping to max on the first small handle movement.
  const maxWidth = Math.max(max, rect.width),
    maxHeight = Math.max(max, rect.height);
  let width = rect.width,
    height = rect.height;
  if (horizontal) width = clamp(rect.width + (west ? -local.x : local.x), min, maxWidth);
  else if (vertical) height = clamp(rect.height + (north ? -local.y : local.y), min, maxHeight);
  else if (!(options.preserveCornerRatio ?? original.lockAspectRatio !== false)) {
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
    // Multiplication can land one ulp outside an exact size boundary (49 *
    // (1 / 49) is below 1). Preserve the ratio to floating precision while
    // keeping the dimensions within their validated edit budget.
    width = clamp(rect.width * scale, min, maxWidth);
    height = clamp(rect.height * scale, min, maxHeight);
  }
  const difference = { x: (width - rect.width) / 2, y: (height - rect.height) / 2 };
  const inset = { x: west ? rect.width - width : 0, y: north ? rect.height - height : 0 };
  const frame = clonePictureFrame(original.frame);
  frame.anchor = anchorPictureFrameRect(
    frame.anchor.mode,
    {
      x: rect.x + (cos - 1) * difference.x - sin * difference.y + cos * inset.x - sin * inset.y,
      y: rect.y + sin * difference.x + (cos - 1) * difference.y + sin * inset.x + cos * inset.y,
      width,
      height,
    },
    metrics,
    frame.anchor,
  );
  resolvePictureFrame(frame, metrics);
  return { ...original, frame };
}

export function rotateFramedPictureBy(
  image: FramedFloatingImage,
  angleDelta: number,
  metrics: PictureSheetMetrics,
): FramedFloatingImage {
  if (!Number.isFinite(angleDelta)) throw new RangeError("Picture rotation must be finite.");
  const original = clonePictureObject(image);
  const frame = clonePictureFrame({
    ...original.frame,
    angleDeg: original.frame.angleDeg + (angleDelta % 360),
  });
  resolvePictureFrame(frame, metrics);
  return { ...original, frame };
}

/** Reflect the complete picture in a sheet-space axis without introducing shear. */
export function flipFramedPicture(
  image: FramedFloatingImage,
  axis: "horizontal" | "vertical",
  metrics: PictureSheetMetrics,
): FramedFloatingImage {
  if (axis !== "horizontal" && axis !== "vertical")
    throw new TypeError("Invalid picture flip axis.");
  const original = clonePictureObject(image);
  const frame = clonePictureFrame(original.frame);
  frame.angleDeg = -frame.angleDeg;
  if (axis === "horizontal") {
    frame.flipHorizontal = !frame.flipHorizontal;
    frame.source.offsetXRatio = -frame.source.offsetXRatio;
  } else {
    frame.flipVertical = !frame.flipVertical;
    frame.source.offsetYRatio = -frame.source.offsetYRatio;
  }
  const normalized = clonePictureFrame(frame);
  resolvePictureFrame(normalized, metrics);
  return { ...original, frame: normalized };
}
