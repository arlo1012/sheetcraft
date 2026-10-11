import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import {
  MIN_FLOATING_IMAGE_SIZE,
  MAX_FLOATING_IMAGE_SIZE,
  type LegacyFloatingImage,
} from "./workbook.js";
import { normalizeImageTransform } from "./image-transform.js";
import {
  comparePictureAxisPoints,
  locatePictureAxisPoint,
  normalizePictureAxisPoint,
  projectLegacyPictureAxisOrigin,
  projectPictureAxisPoint,
  type PictureCellPoint,
  type PictureSheetMetrics,
} from "./picture-axis-metrics.js";

export type PicturePoint = { x: number; y: number };
export type PictureFrameSize = { width: number; height: number };
export type PictureFrameRect = PicturePoint & PictureFrameSize;
export type PictureFrameAnchor =
  | { mode: "move-only"; origin: PictureCellPoint; size: PictureFrameSize }
  | { mode: "fixed"; x: number; y: number; size: PictureFrameSize }
  | { mode: "move-and-size"; start: PictureCellPoint; end: PictureCellPoint };
/** Source center is expressed in unrotated crop-frame units; signed padding is valid. */
export type PictureSourceFrame = {
  widthRatio: number;
  heightRatio: number;
  offsetXRatio: number;
  offsetYRatio: number;
};
/** One canonical local frame; persistence and view adapters consume it explicitly. */
export type PictureFrame = {
  kind: "object-frame-v1";
  anchor: PictureFrameAnchor;
  source: PictureSourceFrame;
  angleDeg: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
};
export type ResolvedPictureFrame = {
  rect: PictureFrameRect;
  angleDeg: number;
  collapsed: boolean;
  /** Null on a collapsed move-size frame: consumers must not divide by zero. */
  sourceRect: PictureFrameRect | null;
  corners: [PicturePoint, PicturePoint, PicturePoint, PicturePoint];
  bounds: PictureFrameRect;
};
function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new TypeError(`Unknown ${name} field.`);
  return value as Record<string, unknown>;
}
function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new RangeError(`${name} must be finite.`);
  return value === 0 ? 0 : value;
}
function normalizeSize(value: unknown): PictureFrameSize {
  const v = record(value, ["width", "height"], "picture frame size");
  const width = finite(v.width, "Picture width");
  const height = finite(v.height, "Picture height");
  if (
    width < MIN_FLOATING_IMAGE_SIZE ||
    width > MAX_FLOATING_IMAGE_SIZE ||
    height < MIN_FLOATING_IMAGE_SIZE ||
    height > MAX_FLOATING_IMAGE_SIZE
  )
    throw new RangeError(
      `Picture frame size must be ${MIN_FLOATING_IMAGE_SIZE}–${MAX_FLOATING_IMAGE_SIZE} pixels.`,
    );
  return { width, height };
}
function normalizeCellPoint(value: unknown): PictureCellPoint {
  const point = record(value, ["column", "row"], "picture cell point");
  return {
    column: normalizePictureAxisPoint(
      point.column as PictureCellPoint["column"],
      MAX_SHEET_COLUMNS,
    ),
    row: normalizePictureAxisPoint(point.row as PictureCellPoint["row"], MAX_SHEET_ROWS),
  };
}
export function normalizePictureFrame(frame: PictureFrame): PictureFrame {
  const v = record(
    frame,
    ["kind", "anchor", "source", "angleDeg", "flipHorizontal", "flipVertical"],
    "picture frame",
  );
  if (v.kind !== "object-frame-v1") throw new TypeError("Unknown picture frame kind.");
  const a = record(
    v.anchor,
    ["mode", "origin", "size", "x", "y", "start", "end"],
    "picture frame anchor",
  );
  let anchor: PictureFrameAnchor;
  if (a.mode === "fixed") {
    record(a, ["mode", "x", "y", "size"], "fixed picture anchor");
    anchor = {
      mode: "fixed",
      x: finite(a.x, "Picture x"),
      y: finite(a.y, "Picture y"),
      size: normalizeSize(a.size),
    };
  } else if (a.mode === "move-only") {
    record(a, ["mode", "origin", "size"], "moving picture anchor");
    anchor = {
      mode: "move-only",
      origin: normalizeCellPoint(a.origin),
      size: normalizeSize(a.size),
    };
  } else if (a.mode === "move-and-size") {
    record(a, ["mode", "start", "end"], "stretching picture anchor");
    const start = normalizeCellPoint(a.start);
    const end = normalizeCellPoint(a.end);
    if (
      comparePictureAxisPoints(start.column, end.column) >= 0 ||
      comparePictureAxisPoints(start.row, end.row) >= 0
    )
      throw new RangeError("Picture logical endpoints must have positive spans on both axes.");
    anchor = { mode: "move-and-size", start, end };
  } else throw new TypeError("Unknown picture anchor mode.");
  const s = record(
    v.source,
    ["widthRatio", "heightRatio", "offsetXRatio", "offsetYRatio"],
    "picture source frame",
  );
  const source = {
    widthRatio: finite(s.widthRatio, "Source width ratio"),
    heightRatio: finite(s.heightRatio, "Source height ratio"),
    offsetXRatio: finite(s.offsetXRatio, "Source x offset ratio"),
    offsetYRatio: finite(s.offsetYRatio, "Source y offset ratio"),
  };
  if (source.widthRatio <= 0 || source.heightRatio <= 0)
    throw new RangeError("Picture source ratios must be positive.");
  const angle = finite(v.angleDeg, "Picture angle");
  const remainder = angle % 360;
  const angleDeg = remainder < 0 ? (remainder + 360) % 360 : remainder === 0 ? 0 : remainder;
  for (const key of ["flipHorizontal", "flipVertical"] as const)
    if (v[key] !== undefined && typeof v[key] !== "boolean") throw new TypeError(`Invalid ${key}.`);
  return {
    kind: "object-frame-v1",
    anchor,
    source,
    angleDeg,
    ...(v.flipHorizontal ? { flipHorizontal: true } : {}),
    ...(v.flipVertical ? { flipVertical: true } : {}),
  };
}
export function clonePictureFrame(frame: PictureFrame): PictureFrame {
  return normalizePictureFrame(frame);
}
export function arePictureFramesEqual(left: PictureFrame, right: PictureFrame): boolean {
  return (
    JSON.stringify(normalizePictureFrame(left)) === JSON.stringify(normalizePictureFrame(right))
  );
}
function assertRect(rect: PictureFrameRect): PictureFrameRect {
  for (const key of ["x", "y", "width", "height"] as const) finite(rect[key], `Picture ${key}`);
  if (rect.width < 0 || rect.height < 0) throw new RangeError("Negative picture frame span.");
  const right = finite(rect.x + rect.width, "Picture right edge");
  const bottom = finite(rect.y + rect.height, "Picture bottom edge");
  if ((rect.width > 0 && right === rect.x) || (rect.height > 0 && bottom === rect.y))
    throw new RangeError("Picture extent cannot be represented at this coordinate.");
  return rect;
}
function resolveRect(frame: PictureFrame, metrics: PictureSheetMetrics): PictureFrameRect {
  const anchor = frame.anchor;
  if (anchor.mode === "fixed") return assertRect({ x: anchor.x, y: anchor.y, ...anchor.size });
  const start = anchor.mode === "move-only" ? anchor.origin : anchor.start;
  const x = projectPictureAxisPoint(start.column, metrics.columns);
  const y = projectPictureAxisPoint(start.row, metrics.rows);
  return assertRect({
    x,
    y,
    ...(anchor.mode === "move-only"
      ? anchor.size
      : {
          width: projectPictureAxisPoint(anchor.end.column, metrics.columns) - x,
          height: projectPictureAxisPoint(anchor.end.row, metrics.rows) - y,
        }),
  });
}
/** Local points are measured from the unrotated crop-frame top-left, not its AABB. */
export function pictureFrameLocalToWorld(
  rect: PictureFrameRect,
  angleDeg: number,
  point: PicturePoint,
): PicturePoint {
  assertRect(rect);
  const angle = ((finite(angleDeg, "Picture angle") % 360) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = finite(point.x, "Local x") - rect.width / 2;
  const dy = finite(point.y, "Local y") - rect.height / 2;
  return {
    x: finite(rect.x + rect.width / 2 + cos * dx - sin * dy, "Projected x"),
    y: finite(rect.y + rect.height / 2 + sin * dx + cos * dy, "Projected y"),
  };
}
export function pictureFrameWorldToLocal(
  rect: PictureFrameRect,
  angleDeg: number,
  point: PicturePoint,
): PicturePoint {
  assertRect(rect);
  const angle = ((finite(angleDeg, "Picture angle") % 360) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = finite(point.x, "World x") - rect.x - rect.width / 2;
  const dy = finite(point.y, "World y") - rect.y - rect.height / 2;
  return {
    x: finite(rect.width / 2 + cos * dx + sin * dy, "Local x"),
    y: finite(rect.height / 2 - sin * dx + cos * dy, "Local y"),
  };
}
export function resolvePictureFrame(
  frame: PictureFrame,
  metrics: PictureSheetMetrics,
): ResolvedPictureFrame {
  const normalized = normalizePictureFrame(frame);
  const rect = resolveRect(normalized, metrics);
  const collapsed = rect.width === 0 || rect.height === 0;
  const width = rect.width * normalized.source.widthRatio;
  const height = rect.height * normalized.source.heightRatio;
  if (!collapsed && (width <= 0 || height <= 0))
    throw new RangeError("Picture source dimensions underflow.");
  const sourceRect = collapsed
    ? null
    : assertRect({
        x: rect.x + rect.width / 2 + rect.width * normalized.source.offsetXRatio - width / 2,
        y: rect.y + rect.height / 2 + rect.height * normalized.source.offsetYRatio - height / 2,
        width,
        height,
      });
  const corners = [
    { x: 0, y: 0 },
    { x: rect.width, y: 0 },
    { x: rect.width, y: rect.height },
    { x: 0, y: rect.height },
  ].map((point) =>
    pictureFrameLocalToWorld(rect, normalized.angleDeg, point),
  ) as ResolvedPictureFrame["corners"];
  const x = Math.min(...corners.map((point) => point.x));
  const y = Math.min(...corners.map((point) => point.y));
  const bounds = assertRect({
    x,
    y,
    width: Math.max(...corners.map((point) => point.x)) - x,
    height: Math.max(...corners.map((point) => point.y)) - y,
  });
  return { rect, angleDeg: normalized.angleDeg, collapsed, sourceRect, corners, bounds };
}
/** Hit the returned projected polygon so floating-coordinate rounding is shared with rendering. */
export function pictureFrameContainsPoint(
  resolved: ResolvedPictureFrame,
  point: PicturePoint,
): boolean {
  if (resolved.collapsed) return false;
  finite(point.x, "Hit x");
  finite(point.y, "Hit y");
  const bounds = resolved.bounds;
  if (
    point.x < bounds.x ||
    point.y < bounds.y ||
    point.x > bounds.x + bounds.width ||
    point.y > bounds.y + bounds.height
  )
    return false;
  if (bounds.width === 0 || bounds.height === 0) return false;
  const origin = resolved.corners[0];
  const corners = resolved.corners.map((corner) => ({
    x: (corner.x - origin.x) / bounds.width,
    y: (corner.y - origin.y) / bounds.height,
  }));
  // Positive per-axis scaling preserves orientation and prevents finite large
  // endpoint rectangles from overflowing the area/cross-product arithmetic.
  const hit = {
    x: (point.x - origin.x) / bounds.width,
    y: (point.y - origin.y) / bounds.height,
  };
  let area = 0;
  for (let index = 0; index < corners.length; index++) {
    const a = corners[index]!;
    const b = corners[(index + 1) % corners.length]!;
    area += a.x * b.y - a.y * b.x;
  }
  if (!Number.isFinite(area) || area === 0) return false;
  for (let index = 0; index < corners.length; index++) {
    const a = corners[index]!;
    const b = corners[(index + 1) % corners.length]!;
    const first = (b.x - a.x) * (hit.y - a.y);
    const second = (b.y - a.y) * (hit.x - a.x);
    const cross = first - second;
    const epsilon = Number.EPSILON * 16 * Math.max(1, Math.abs(first), Math.abs(second));
    if (area > 0 ? cross < -epsilon : cross > epsilon) return false;
  }
  return true;
}
export function anchorPictureFrameRect(
  mode: PictureFrameAnchor["mode"],
  rect: PictureFrameRect,
  metrics: PictureSheetMetrics,
  preferred?: PictureFrameAnchor,
): PictureFrameAnchor {
  assertRect(rect);
  if (rect.width <= 0 || rect.height <= 0)
    throw new RangeError("A picture anchor requires positive local dimensions.");
  // A durable stretching frame may grow beyond the manual edit budget through
  // row/column changes. Reanchoring it must not discard that resolved geometry.
  const size =
    mode === "move-and-size"
      ? { width: rect.width, height: rect.height }
      : normalizeSize({ width: rect.width, height: rect.height });
  if (mode === "fixed") return { mode, x: rect.x, y: rect.y, size };
  const preferredStart =
    preferred?.mode === "move-only"
      ? preferred.origin
      : preferred?.mode === "move-and-size"
        ? preferred.start
        : undefined;
  const preferredEnd = preferred?.mode === "move-and-size" ? preferred.end : undefined;
  const start = {
    column: locatePictureAxisPoint(rect.x, metrics.columns, preferredStart?.column),
    row: locatePictureAxisPoint(rect.y, metrics.rows, preferredStart?.row),
  };
  if (mode === "move-only") return { mode, origin: start, size };
  if (mode !== "move-and-size") throw new TypeError("Unknown picture anchor mode.");
  return {
    mode,
    start,
    end: {
      column: locatePictureAxisPoint(rect.x + rect.width, metrics.columns, preferredEnd?.column),
      row: locatePictureAxisPoint(rect.y + rect.height, metrics.rows, preferredEnd?.row),
    },
  };
}
/** Geometry-only explicit adapter; it never mutates or promotes a persisted legacy object. */
export function pictureFrameFromLegacy(
  image: LegacyFloatingImage,
  metrics: PictureSheetMetrics,
): PictureFrame {
  const transform = normalizeImageTransform(image.transform);
  const crop = transform?.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const quarter = transform?.rotation ?? 0;
  const rotated = quarter === 90 || quarter === 270;
  const size = normalizeSize({
    width: rotated ? image.height : image.width,
    height: rotated ? image.width : image.height,
  });
  const oldX = projectLegacyPictureAxisOrigin(image.anchor.column, image.offsetX, metrics.columns);
  const oldY = projectLegacyPictureAxisOrigin(image.anchor.row, image.offsetY, metrics.rows);
  return normalizePictureFrame({
    kind: "object-frame-v1",
    anchor: anchorPictureFrameRect(
      "move-only",
      {
        x: oldX + (image.width - size.width) / 2,
        y: oldY + (image.height - size.height) / 2,
        ...size,
      },
      metrics,
    ),
    angleDeg: quarter,
    source: {
      widthRatio: 1 / crop.width,
      heightRatio: 1 / crop.height,
      offsetXRatio: ((0.5 - crop.x) / crop.width - 0.5) * (transform?.flipHorizontal ? -1 : 1),
      offsetYRatio: ((0.5 - crop.y) / crop.height - 0.5) * (transform?.flipVertical ? -1 : 1),
    },
    ...(transform?.flipHorizontal ? { flipHorizontal: true } : {}),
    ...(transform?.flipVertical ? { flipVertical: true } : {}),
  });
}
/** Changes crop edges in local axes while preserving the source's world-space placement. */
export function resizePictureCropFrame(
  frame: PictureFrame,
  size: PictureFrameSize,
  metrics: PictureSheetMetrics,
  inset: PicturePoint = { x: 0, y: 0 },
): PictureFrame {
  const normalized = normalizePictureFrame(frame);
  const resolved = resolvePictureFrame(normalized, metrics);
  if (resolved.collapsed || !resolved.sourceRect)
    throw new RangeError("A collapsed picture must be expanded before crop editing.");
  const nextSize = normalizeSize(size);
  const dx = finite(inset.x, "Crop inset x");
  const dy = finite(inset.y, "Crop inset y");
  const difference = {
    x: (nextSize.width - resolved.rect.width) / 2,
    y: (nextSize.height - resolved.rect.height) / 2,
  };
  const angle = (normalized.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rect = {
    x: resolved.rect.x + (cos - 1) * difference.x - sin * difference.y + cos * dx - sin * dy,
    y: resolved.rect.y + sin * difference.x + (cos - 1) * difference.y + sin * dx + cos * dy,
    ...nextSize,
  };
  return normalizePictureFrame({
    ...normalized,
    anchor: anchorPictureFrameRect(normalized.anchor.mode, rect, metrics, normalized.anchor),
    source: {
      widthRatio: resolved.sourceRect.width / nextSize.width,
      heightRatio: resolved.sourceRect.height / nextSize.height,
      offsetXRatio:
        (resolved.rect.width * normalized.source.offsetXRatio - difference.x - dx) / nextSize.width,
      offsetYRatio:
        (resolved.rect.height * normalized.source.offsetYRatio - difference.y - dy) /
        nextSize.height,
    },
  });
}
