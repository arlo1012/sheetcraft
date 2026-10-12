import { isShapeLinePreset } from "@sheetcraft/core/shape-line-ends";
import { pictureFrameLocalToWorld, type PictureFrameRect } from "@sheetcraft/core/picture-frame";
import {
  flattenShapePath,
  type EvaluatedShapePresetGeometry,
} from "@sheetcraft/core/shape-presets";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getStandardShapeGeometry,
  STANDARD_SHAPE_GEOMETRY_LIMITS,
  standardShapeFlipPoint,
} from "./shape-geometry";

export type ShapeEndpointPoint = Readonly<{ x: number; y: number }>;
type LineDrawing = Pick<SheetGraphicDrawing, "kind" | "width" | "height" | "shapeGeometry">;
const endpointError = 0.5;
const numericalTolerance = 1e-8;
const endpointCache = new WeakMap<
  EvaluatedShapePresetGeometry,
  readonly [ShapeEndpointPoint, ShapeEndpointPoint]
>();

/** Actual unflipped path tips, in the drawing's local frame, with no legacy fallback. */
export function getShapeLineLocalEndpoints(
  drawing: LineDrawing,
): readonly [ShapeEndpointPoint, ShapeEndpointPoint] | undefined {
  if (
    drawing.kind !== "shape" ||
    !drawing.shapeGeometry ||
    !isShapeLinePreset(drawing.shapeGeometry.preset)
  )
    return;
  const geometry = getStandardShapeGeometry(drawing.shapeGeometry, drawing.width, drawing.height);
  if (!geometry) return;
  const cached = endpointCache.get(geometry);
  if (cached) return cached;
  try {
    let first: ShapeEndpointPoint | undefined,
      last: ShapeEndpointPoint | undefined,
      points = 0;
    for (const path of geometry.paths) {
      if (!path.stroke) continue;
      for (const line of flattenShapePath(path, STANDARD_SHAPE_GEOMETRY_LIMITS.hitTolerance)) {
        points += line.points.length;
        if (points > STANDARD_SHAPE_GEOMETRY_LIMITS.points) return;
        if (line.closed || line.points.length < 2) continue;
        first ??= line.points[0];
        last = line.points.at(-1);
      }
    }
    if (first && last && [first.x, first.y, last.x, last.y].every(Number.isFinite)) {
      const endpoints = Object.freeze([
        Object.freeze({ ...first }),
        Object.freeze({ ...last }),
      ] as const);
      endpointCache.set(geometry, endpoints);
      return endpoints;
    }
  } catch {
    return;
  }
}

function pointWithinSheet(point: ShapeEndpointPoint, layout: SheetViewportLayout): boolean {
  const total = layout.getTotalSize();
  return (
    [point.x, point.y, total.width, total.height].every(Number.isFinite) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= Math.min(total.width, STANDARD_SHAPE_GEOMETRY_LIMITS.coordinate) &&
    point.y <= Math.min(total.height, STANDARD_SHAPE_GEOMETRY_LIMITS.coordinate)
  );
}
function rectWithinSheet(rect: PictureFrameRect, layout: SheetViewportLayout): boolean {
  return (
    [rect.width, rect.height].every(
      (extent) =>
        Number.isFinite(extent) && extent >= 1 && extent <= STANDARD_SHAPE_GEOMETRY_LIMITS.extent,
    ) &&
    pointWithinSheet(rect, layout) &&
    pointWithinSheet({ x: rect.x + rect.width, y: rect.y + rect.height }, layout)
  );
}
function distance(a: ShapeEndpointPoint, b: ShapeEndpointPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function worldEndpoints(
  drawing: SheetGraphicDrawing,
  rect: PictureFrameRect,
  endpoints: readonly [ShapeEndpointPoint, ShapeEndpointPoint],
): readonly [ShapeEndpointPoint, ShapeEndpointPoint] {
  const world = (point: ShapeEndpointPoint) =>
    pictureFrameLocalToWorld(rect, drawing.rotation, standardShapeFlipPoint(drawing, point));
  return [world(endpoints[0]), world(endpoints[1])];
}
/** All supported line presets have opposite corner tips; lineInv has reversed Y parity. */
function canonicalCornerSigns(
  drawing: LineDrawing,
  endpoints: readonly [ShapeEndpointPoint, ShapeEndpointPoint],
): ShapeEndpointPoint | undefined {
  const [first, last] = endpoints;
  const dx = last.x - first.x,
    dy = last.y - first.y;
  if (
    Math.abs(first.x + last.x - drawing.width) > numericalTolerance ||
    Math.abs(first.y + last.y - drawing.height) > numericalTolerance ||
    Math.abs(Math.abs(dx) - drawing.width) > numericalTolerance ||
    Math.abs(Math.abs(dy) - drawing.height) > numericalTolerance
  )
    return;
  return { x: dx < 0 ? -1 : 1, y: dy < 0 ? -1 : 1 };
}
function snappedVector(vector: ShapeEndpointPoint): ShapeEndpointPoint {
  const length = Math.hypot(vector.x, vector.y);
  const octant = ((Math.round(Math.atan2(vector.y, vector.x) / (Math.PI / 4)) % 8) + 8) % 8;
  const diagonal = length / Math.SQRT2;
  switch (octant) {
    case 0:
      return { x: length, y: 0 };
    case 1:
      return { x: diagonal, y: diagonal };
    case 2:
      return { x: 0, y: length };
    case 3:
      return { x: -diagonal, y: diagonal };
    case 4:
      return { x: -length, y: 0 };
    case 5:
      return { x: -diagonal, y: -diagonal };
    case 6:
      return { x: 0, y: -length };
    default:
      return { x: diagonal, y: -diagonal };
  }
}

/**
 * Moves one standard line/connector tip in continuous sheet coordinates. The
 * opposite tip is pinned and rotation, preset, adjustments and end identity
 * survive crossings. Shift snaps the world-space vector to the nearest 45°.
 *
 * Persisted axes are at least 1px: symmetric thin-axis expansion can displace
 * each tip by at most 0.5px Euclidean distance. Unrepresentable moves, invalid
 * geometry and out-of-sheet frames return undefined rather than clamp/fallback.
 * A zero-motion request returns the original drawing without reanchoring drift.
 */
export function moveStandardShapeEndpoint(
  drawing: SheetGraphicDrawing,
  index: 0 | 1,
  target: ShapeEndpointPoint,
  layout: SheetViewportLayout,
  shiftKey = false,
): SheetGraphicDrawing | undefined {
  if (
    (index !== 0 && index !== 1) ||
    !Number.isFinite(drawing.rotation) ||
    drawing.rotation < -360 ||
    drawing.rotation > 360 ||
    ![drawing.offsetX, drawing.offsetY].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1_000_000,
    ) ||
    !pointWithinSheet(target, layout)
  )
    return;
  const endpoints = getShapeLineLocalEndpoints(drawing);
  const rect = getFloatingImageSheetRect(drawing, layout);
  if (!endpoints || !rect || !rectWithinSheet(rect, layout)) return;
  const signs = canonicalCornerSigns(drawing, endpoints);
  if (!signs) return;
  const current = worldEndpoints(drawing, rect, endpoints);
  if (!current.every((point) => pointWithinSheet(point, layout))) return;
  if (distance(target, current[index]) <= numericalTolerance) return drawing;

  const fixed = current[index === 0 ? 1 : 0];
  const request = { x: target.x - fixed.x, y: target.y - fixed.y };
  if (request.x === 0 && request.y === 0) return;
  const vector = shiftKey ? snappedVector(request) : request;
  const moved = { x: fixed.x + vector.x, y: fixed.y + vector.y };
  if (!pointWithinSheet(moved, layout)) return;
  const start = index === 0 ? moved : fixed,
    end = index === 0 ? fixed : moved;
  const radians = (drawing.rotation * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians);
  const worldDx = end.x - start.x,
    worldDy = end.y - start.y;
  const dx = cos * worldDx + sin * worldDy,
    dy = -sin * worldDx + cos * worldDy;
  const extent = STANDARD_SHAPE_GEOMETRY_LIMITS.extent;
  if (
    ![dx, dy].every(
      (value) => Number.isFinite(value) && Math.abs(value) <= extent + numericalTolerance,
    )
  )
    return;
  // Inverse rotation can overshoot an exact maximum by a few floating-point ulps.
  const width = Math.min(extent, Math.max(1, Math.abs(dx))),
    height = Math.min(extent, Math.max(1, Math.abs(dy)));
  if (
    Math.hypot(Math.max(0, width - Math.abs(dx)) / 2, Math.max(0, height - Math.abs(dy)) / 2) >
    endpointError
  )
    return;
  const nextRect = {
    x: (start.x + end.x) / 2 - width / 2,
    y: (start.y + end.y) / 2 - height / 2,
    width,
    height,
  };
  if (!rectWithinSheet(nextRect, layout)) return;

  const next = { ...drawing, width, height };
  delete next.shapeFlipX;
  delete next.shapeFlipY;
  // The degenerate axis has no requested direction; preserve its original parity.
  const flipX =
    Math.abs(dx) <= numericalTolerance ? drawing.shapeFlipX : (dx < 0 ? -1 : 1) !== signs.x;
  const flipY =
    Math.abs(dy) <= numericalTolerance ? drawing.shapeFlipY : (dy < 0 ? -1 : 1) !== signs.y;
  if (flipX) next.shapeFlipX = true;
  if (flipY) next.shapeFlipY = true;
  const nextEndpoints = getShapeLineLocalEndpoints(next);
  if (!nextEndpoints || !canonicalCornerSigns(next, nextEndpoints)) return;
  const anchored = reanchorFloatingImageAtSheetRect(next, nextRect, layout);
  if (
    !anchored ||
    ![anchored.offsetX, anchored.offsetY].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1_000_000,
    )
  )
    return;
  const resolved = getFloatingImageSheetRect(anchored, layout);
  if (!resolved || !rectWithinSheet(resolved, layout)) return;
  const actual = worldEndpoints(anchored, resolved, nextEndpoints);
  if (
    !actual.every((point) => pointWithinSheet(point, layout)) ||
    distance(actual[0], start) > endpointError + numericalTolerance ||
    distance(actual[1], end) > endpointError + numericalTolerance
  )
    return;
  return anchored;
}
