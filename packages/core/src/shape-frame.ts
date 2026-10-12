import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import {
  comparePictureAxisPoints,
  locatePictureAxisPoint,
  normalizePictureAxisPoint,
  projectPictureAxisPoint,
  type PictureAxisMetrics,
  type PictureAxisPoint,
  type PictureCellPoint,
  type PictureSheetMetrics,
} from "./picture-axis-metrics.js";
import {
  normalizePictureAngle,
  pictureFrameLocalToWorld,
  pictureFrameWorldToLocal,
  resolvePictureLayout,
} from "./picture-frame.js";
import type { PictureFrameAxisEdit } from "./picture-frame-axis-edit.js";

export const MIN_SHAPE_FRAME_SIZE = 1;
export const MAX_SHAPE_FRAME_SIZE = 16384;
export type ShapeFramePoint = { x: number; y: number };
export type ShapeFrameSize = { width: number; height: number };
export type ShapeFrameRect = ShapeFramePoint & ShapeFrameSize;
export type ShapeFrameAnchor =
  | { mode: "move-only"; origin: PictureCellPoint; size: ShapeFrameSize }
  | { mode: "fixed"; x: number; y: number; size: ShapeFrameSize }
  | { mode: "move-and-size"; start: PictureCellPoint; end: PictureCellPoint };
/** Source-free local geometry. Rotation remains on the owning drawing. */
export type ShapeFrame = { kind: "shape-frame-v1"; anchor: ShapeFrameAnchor };
export type ShapeFrameAxisEdit = PictureFrameAxisEdit;
export type ResolvedShapeFrame = {
  rect: ShapeFrameRect;
  angleDeg: number;
  collapsed: boolean;
  corners: [ShapeFramePoint, ShapeFramePoint, ShapeFramePoint, ShapeFramePoint];
  bounds: ShapeFrameRect;
};

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown ${name} field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor))
      throw new TypeError(`${name} must contain own data fields, not accessors.`);
    result[key] = descriptor.value as unknown;
  }
  return result;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new RangeError(`${name} must be finite.`);
  return value === 0 ? 0 : value;
}

export function normalizeShapeFrameSize(value: ShapeFrameSize): ShapeFrameSize {
  const size = record(value, ["width", "height"], "shape frame size");
  const width = finite(size.width, "Shape width");
  const height = finite(size.height, "Shape height");
  if (
    width < MIN_SHAPE_FRAME_SIZE ||
    width > MAX_SHAPE_FRAME_SIZE ||
    height < MIN_SHAPE_FRAME_SIZE ||
    height > MAX_SHAPE_FRAME_SIZE
  )
    throw new RangeError(
      `Shape frame size must be ${MIN_SHAPE_FRAME_SIZE}–${MAX_SHAPE_FRAME_SIZE} pixels.`,
    );
  return { width, height };
}

function normalizeCellPoint(value: unknown): PictureCellPoint {
  const point = record(value, ["column", "row"], "shape logical cell point");
  return {
    column: normalizePictureAxisPoint(point.column as PictureAxisPoint, MAX_SHEET_COLUMNS),
    row: normalizePictureAxisPoint(point.row as PictureAxisPoint, MAX_SHEET_ROWS),
  };
}

/** Actual display spans may collapse or shrink below one pixel after cell changes. */
function assertRect(value: ShapeFrameRect): ShapeFrameRect {
  const raw = record(value, ["x", "y", "width", "height"], "shape frame rectangle");
  const rect = {
    x: finite(raw.x, "Shape x"),
    y: finite(raw.y, "Shape y"),
    width: finite(raw.width, "Shape width"),
    height: finite(raw.height, "Shape height"),
  };
  if (
    rect.width < 0 ||
    rect.height < 0 ||
    rect.width > MAX_SHAPE_FRAME_SIZE ||
    rect.height > MAX_SHAPE_FRAME_SIZE
  )
    throw new RangeError(`Resolved shape spans must be 0–${MAX_SHAPE_FRAME_SIZE} pixels.`);
  const right = finite(rect.x + rect.width, "Shape right edge");
  const bottom = finite(rect.y + rect.height, "Shape bottom edge");
  if ((rect.width > 0 && right === rect.x) || (rect.height > 0 && bottom === rect.y))
    throw new RangeError("Shape extent cannot be represented at this coordinate.");
  return rect;
}

export function normalizeShapeFrameAnchor(value: ShapeFrameAnchor): ShapeFrameAnchor {
  const anchor = record(
    value,
    ["mode", "origin", "size", "x", "y", "start", "end"],
    "shape frame anchor",
  );
  if (anchor.mode === "fixed") {
    record(anchor, ["mode", "x", "y", "size"], "fixed shape anchor");
    const size = normalizeShapeFrameSize(anchor.size as ShapeFrameSize);
    const rect = assertRect({
      x: finite(anchor.x, "Shape x"),
      y: finite(anchor.y, "Shape y"),
      ...size,
    });
    return { mode: "fixed", x: rect.x, y: rect.y, size };
  }
  if (anchor.mode === "move-only") {
    record(anchor, ["mode", "origin", "size"], "moving shape anchor");
    return {
      mode: "move-only",
      origin: normalizeCellPoint(anchor.origin),
      size: normalizeShapeFrameSize(anchor.size as ShapeFrameSize),
    };
  }
  if (anchor.mode === "move-and-size") {
    record(anchor, ["mode", "start", "end"], "stretching shape anchor");
    const start = normalizeCellPoint(anchor.start);
    const end = normalizeCellPoint(anchor.end);
    if (
      comparePictureAxisPoints(start.column, end.column) >= 0 ||
      comparePictureAxisPoints(start.row, end.row) >= 0
    )
      throw new RangeError("Shape logical endpoints must have positive spans on both axes.");
    return { mode: "move-and-size", start, end };
  }
  throw new TypeError("Unknown shape anchor mode.");
}

export function normalizeShapeFrame(value: ShapeFrame): ShapeFrame {
  const frame = record(value, ["kind", "anchor"], "shape frame");
  if (frame.kind !== "shape-frame-v1") throw new TypeError("Unknown shape frame kind.");
  return {
    kind: "shape-frame-v1",
    anchor: normalizeShapeFrameAnchor(frame.anchor as ShapeFrameAnchor),
  };
}

export function cloneShapeFrame(value: ShapeFrame): ShapeFrame {
  return normalizeShapeFrame(value);
}

export function areShapeFramesEqual(left: ShapeFrame, right: ShapeFrame): boolean {
  return JSON.stringify(normalizeShapeFrame(left)) === JSON.stringify(normalizeShapeFrame(right));
}

export function resolveShapeAnchorRect(
  value: ShapeFrameAnchor,
  metrics: PictureSheetMetrics,
): ShapeFrameRect {
  const anchor = normalizeShapeFrameAnchor(value);
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

/** Reuses source-free rotation math without creating a picture or duplicating rotation. */
export function resolveShapeFrame(
  value: ShapeFrame,
  metrics: PictureSheetMetrics,
  rotation = 0,
): ResolvedShapeFrame {
  const frame = normalizeShapeFrame(value);
  return resolvePictureLayout(resolveShapeAnchorRect(frame.anchor, metrics), rotation);
}

export function shapeFrameLocalToWorld(
  rect: ShapeFrameRect,
  rotation: number,
  point: ShapeFramePoint,
): ShapeFramePoint {
  return pictureFrameLocalToWorld(assertRect(rect), rotation, point);
}

export function shapeFrameWorldToLocal(
  rect: ShapeFrameRect,
  rotation: number,
  point: ShapeFramePoint,
): ShapeFramePoint {
  return pictureFrameWorldToLocal(assertRect(rect), rotation, point);
}

/** Inverse projection preserves preferred raw markers that still resolve exactly. */
export function anchorShapeFrameRect(
  mode: ShapeFrameAnchor["mode"],
  value: ShapeFrameRect,
  metrics: PictureSheetMetrics,
  preferred?: ShapeFrameAnchor,
): ShapeFrameAnchor {
  if (mode !== "fixed" && mode !== "move-only" && mode !== "move-and-size")
    throw new TypeError("Unknown shape anchor mode.");
  const rect = assertRect(value);
  const size = normalizeShapeFrameSize({ width: rect.width, height: rect.height });
  const previous = preferred === undefined ? undefined : normalizeShapeFrameAnchor(preferred);
  if (mode === "fixed") return { mode, x: rect.x, y: rect.y, size };
  const preferredStart =
    previous?.mode === "move-only"
      ? previous.origin
      : previous?.mode === "move-and-size"
        ? previous.start
        : undefined;
  const preferredEnd = previous?.mode === "move-and-size" ? previous.end : undefined;
  const start = {
    column: locatePictureAxisPoint(rect.x, metrics.columns, preferredStart?.column),
    row: locatePictureAxisPoint(rect.y, metrics.rows, preferredStart?.row),
  };
  const anchor: ShapeFrameAnchor =
    mode === "move-only"
      ? { mode, origin: start, size }
      : {
          mode,
          start,
          end: {
            column: locatePictureAxisPoint(
              rect.x + rect.width,
              metrics.columns,
              preferredEnd?.column,
            ),
            row: locatePictureAxisPoint(rect.y + rect.height, metrics.rows, preferredEnd?.row),
          },
        };
  const normalized = normalizeShapeFrameAnchor(anchor);
  resolveShapeAnchorRect(normalized, metrics);
  return normalized;
}

/** Materializes an explicit edit in the current mode; it never silently changes anchoring. */
export function reanchorShapeFrame(
  value: ShapeFrame,
  rect: ShapeFrameRect,
  metrics: PictureSheetMetrics,
): ShapeFrame {
  const frame = normalizeShapeFrame(value);
  return normalizeShapeFrame({
    kind: "shape-frame-v1",
    anchor: anchorShapeFrameRect(frame.anchor.mode, rect, metrics, frame.anchor),
  });
}

/** Numeric local-size editing keeps the rotated local northwest corner in place. */
export function resizeShapeFrame(
  value: ShapeFrame,
  size: ShapeFrameSize,
  metrics: PictureSheetMetrics,
  rotation = 0,
): ShapeFrame {
  const frame = normalizeShapeFrame(value);
  const rect = resolveShapeAnchorRect(frame.anchor, metrics);
  const nextSize = normalizeShapeFrameSize(size);
  const angle = (normalizePictureAngle(rotation) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = (nextSize.width - rect.width) / 2;
  const dy = (nextSize.height - rect.height) / 2;
  return reanchorShapeFrame(
    frame,
    {
      x: rect.x + (cos - 1) * dx - sin * dy,
      y: rect.y + sin * dx + (cos - 1) * dy,
      ...nextSize,
    },
    metrics,
  );
}

/**
 * Pure structural policy, independent of producer observations. Only an erased
 * logical stretch is removed; hidden display collapse does not erase an object.
 */
export function transformShapeAnchorAxis(
  value: ShapeFrameAnchor,
  valueEdit: ShapeFrameAxisEdit,
  nextMetrics: PictureSheetMetrics,
): ShapeFrameAnchor | null {
  const edit = record(valueEdit, ["axis", "operation", "index", "count"], "shape axis edit");
  if (
    (edit.axis !== "row" && edit.axis !== "column") ||
    (edit.operation !== "insert" && edit.operation !== "delete")
  )
    throw new TypeError("Invalid shape axis edit.");
  const index = finite(edit.index, "Shape axis edit index");
  const count = finite(edit.count, "Shape axis edit count");
  const maximum = edit.axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(count) ||
    index < 0 ||
    count <= 0 ||
    index + count > maximum
  )
    throw new RangeError("Shape axis edit is outside the worksheet.");
  const metrics = edit.axis === "row" ? nextMetrics.rows : nextMetrics.columns;
  if (metrics.count !== maximum)
    throw new RangeError("Shape axis metrics must cover the worksheet.");
  const anchor = normalizeShapeFrameAnchor(value);
  if (anchor.mode === "fixed") {
    resolveShapeAnchorRect(anchor, nextMetrics);
    return anchor;
  }
  const field = edit.axis === "row" ? "row" : "column";
  function mapPoint(point: PictureAxisPoint, endBoundary: boolean): PictureAxisPoint {
    if (point.index === 0 && point.offset < 0) return { ...point };
    if (edit.operation === "insert") {
      if (point.index === maximum) return { ...point };
      if (point.index < index || (endBoundary && point.index === index && point.offset === 0))
        return { ...point };
      const nextIndex = point.index + count;
      return nextIndex >= maximum
        ? { index: maximum, offset: 0 }
        : { index: nextIndex, offset: point.offset };
    }
    if (point.index === maximum) return mapTail(point, maximum - count, metrics);
    if (point.index < index) return { ...point };
    if (point.index >= index + count) return { index: point.index - count, offset: point.offset };
    return { index, offset: 0 };
  }
  if (anchor.mode === "move-only") {
    anchor.origin[field] = mapPoint(anchor.origin[field], false);
  } else {
    const start = mapPoint(anchor.start[field], false);
    const end = mapPoint(anchor.end[field], true);
    if (comparePictureAxisPoints(start, end) >= 0) return null;
    anchor.start[field] = start;
    anchor.end[field] = end;
  }
  const result = normalizeShapeFrameAnchor(anchor);
  resolveShapeAnchorRect(result, nextMetrics);
  return result;
}

function mapTail(
  point: PictureAxisPoint,
  boundary: number,
  metrics: PictureAxisMetrics,
): PictureAxisPoint {
  const coordinate = finite(metrics.visiblePrefix(boundary) + point.offset, "Shape tail");
  return locatePictureAxisPoint(coordinate, metrics, { index: boundary, offset: 0 });
}

export function transformShapeFrameAxis(
  value: ShapeFrame,
  edit: ShapeFrameAxisEdit,
  nextMetrics: PictureSheetMetrics,
): ShapeFrame | null {
  const frame = normalizeShapeFrame(value);
  const anchor = transformShapeAnchorAxis(frame.anchor, edit, nextMetrics);
  return anchor === null ? null : normalizeShapeFrame({ kind: "shape-frame-v1", anchor });
}
