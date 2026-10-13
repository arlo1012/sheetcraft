import { isShapeFreePathClosed } from "@sheetcraft/core/shape-free-path";
import { isShapeLinePreset, type ShapeLineEnd } from "@sheetcraft/core/shape-line-ends";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ReadyShapeConnectorRoute } from "@sheetcraft/core/shape-connector-route";
import {
  flattenShapePath,
  FREE_SHAPE_PATH_WORK_BUDGET,
  type EvaluatedShapePresetGeometry,
  type ShapePathCommand,
} from "@sheetcraft/core/shape-presets";
import { type PictureFrameRect } from "@sheetcraft/core/picture-frame";
import {
  standardShapeContainsLocalPoint,
  standardShapeWorldToLocal,
  standardShapeFlipPoint,
} from "./shape-geometry";
type Point = Readonly<{ x: number; y: number }>;
export type ShapeEndPaint = Readonly<{
  d: string;
  /** Bounded numeric marker source for raster paint; no SVG parsing. */
  commands: readonly ShapePathCommand[];
  filled: boolean;
  bounds: PictureFrameRect;
  contains: (point: Point) => boolean;
}>;
export function standardShapeAppearance(drawing: SheetGraphicDrawing): SheetGraphicDrawing {
  return (drawing.shapeGeometry && isShapeLinePreset(drawing.shapeGeometry.preset)) ||
    (drawing.shapePath && !isShapeFreePathClosed(drawing.shapePath))
    ? { ...drawing, fill: "transparent" }
    : drawing;
}
function distance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    s = dx * dx + dy * dy,
    t = s ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / s)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function polygonContains(points: readonly Point[], p: Point): boolean {
  let winding = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!,
      cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
    if (a.y <= p.y && b.y > p.y && cross > 0) winding++;
    else if (a.y > p.y && b.y <= p.y && cross < 0) winding--;
  }
  return winding !== 0;
}
/** Cubic circular arcs have <= 2*r*theta^6/55296 radial error for theta<=pi/2.
 * Rotation preserves that bound; the ellipse affine scales it by its largest radius. */
function ovalCommands(
  center: Point,
  ux: number,
  uy: number,
  rx: number,
  ry: number,
): readonly ShapePathCommand[] {
  const radius = Math.max(rx, ry);
  const count = Math.max(
    4,
    Math.ceil((2 * Math.PI) / Math.min(Math.PI / 2, ((0.01 * 55296) / (2 * radius)) ** (1 / 6))),
  );
  if (count > 62) throw new RangeError("Shape oval endpoint exceeds its 0.01px curve budget.");
  const point = (angle: number): Point => ({
    x: center.x + ux * rx * Math.cos(angle) - uy * ry * Math.sin(angle),
    y: center.y + uy * rx * Math.cos(angle) + ux * ry * Math.sin(angle),
  });
  const tangent = (angle: number): Point => ({
    x: -ux * rx * Math.sin(angle) - uy * ry * Math.cos(angle),
    y: -uy * rx * Math.sin(angle) + ux * ry * Math.cos(angle),
  });
  const first = point(0),
    commands: ShapePathCommand[] = [["M", first.x, first.y]];
  for (let index = 0; index < count; index++) {
    const a = (index * 2 * Math.PI) / count,
      b = ((index + 1) * 2 * Math.PI) / count,
      k = (4 / 3) * Math.tan((b - a) / 4);
    const start = point(a),
      end = point(b),
      ta = tangent(a),
      tb = tangent(b);
    commands.push([
      "C",
      start.x + k * ta.x,
      start.y + k * ta.y,
      end.x - k * tb.x,
      end.y - k * tb.y,
      end.x,
      end.y,
    ]);
  }
  commands.push(["Z"]);
  return Object.freeze(commands.map((command) => Object.freeze(command)));
}
function marker(
  end: ShapeLineEnd,
  tip: Point,
  previous: Point,
  strokeWidth: number,
): ShapeEndPaint | undefined {
  const length = Math.hypot(tip.x - previous.x, tip.y - previous.y);
  if (length < 1e-8) return;
  const ux = (tip.x - previous.x) / length,
    uy = (tip.y - previous.y) / length;
  return directionMarker(end, tip, ux, uy, strokeWidth);
}
/** A resolved tangent needs no artificial previous point or minimum path length. */
function directionMarker(
  end: ShapeLineEnd,
  tip: Point,
  ux: number,
  uy: number,
  strokeWidth: number,
): ShapeEndPaint {
  const nx = -uy,
    ny = ux;
  const factors = { small: 2, medium: 3, large: 5 };
  const w = Math.max(2, strokeWidth) * factors[end.width ?? "medium"],
    l = Math.max(2, strokeWidth) * factors[end.length ?? "medium"];
  const project = (along: number, across: number): Point => ({
    x: tip.x + ux * along + nx * across,
    y: tip.y + uy * along + ny * across,
  });
  const half = strokeWidth / 2;
  if (end.kind === "oval") {
    const center = project(-l / 2, 0),
      a = project(0, 0),
      b = project(-l, 0),
      rotation = (Math.atan2(uy, ux) * 180) / Math.PI;
    const rx = Math.hypot((ux * l) / 2, (nx * w) / 2),
      ry = Math.hypot((uy * l) / 2, (ny * w) / 2);
    return {
      d: `M${a.x} ${a.y} A${l / 2} ${w / 2} ${rotation} 1 0 ${b.x} ${b.y} A${l / 2} ${w / 2} ${rotation} 1 0 ${a.x} ${a.y} Z`,
      filled: true,
      commands: ovalCommands(center, ux, uy, l / 2, w / 2),
      bounds: {
        x: center.x - rx - half,
        y: center.y - ry - half,
        width: 2 * (rx + half),
        height: 2 * (ry + half),
      },
      contains: (p) => {
        const dx = p.x - center.x,
          dy = p.y - center.y;
        return (
          ((dx * ux + dy * uy) / (l / 2 + half)) ** 2 +
            ((dx * nx + dy * ny) / (w / 2 + half)) ** 2 <=
          1
        );
      },
    };
  }
  const coords =
    end.kind === "diamond"
      ? [
          [0, 0],
          [-l / 2, w / 2],
          [-l, 0],
          [-l / 2, -w / 2],
        ]
      : end.kind === "stealth"
        ? [
            [0, 0],
            [-l, w / 2],
            [-l * 0.65, 0],
            [-l, -w / 2],
          ]
        : end.kind === "open"
          ? [
              [-l, w / 2],
              [0, 0],
              [-l, -w / 2],
            ]
          : [
              [0, 0],
              [-l, w / 2],
              [-l, -w / 2],
            ];
  const points = coords.map(([a, b]) => project(a!, b!)),
    filled = end.kind !== "open";
  const x = Math.min(...points.map((p) => p.x)) - half,
    y = Math.min(...points.map((p) => p.y)) - half;
  return {
    d: points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") + (filled ? " Z" : ""),
    filled,
    commands: Object.freeze([
      ...points.map(
        (point, index) => Object.freeze([index ? "L" : "M", point.x, point.y]) as ShapePathCommand,
      ),
      ...(filled ? [Object.freeze(["Z"] as const)] : []),
    ]),
    bounds: {
      x,
      y,
      width: Math.max(...points.map((p) => p.x)) - x + half,
      height: Math.max(...points.map((p) => p.y)) - y + half,
    },
    contains: (p) => {
      if (filled && polygonContains(points, p)) return true;
      for (let i = 1; i < points.length; i++)
        if (distance(p, points[i - 1]!, points[i]!) <= half) return true;
      return filled && distance(p, points.at(-1)!, points[0]!) <= half;
    },
  };
}
function assertReadyRoute(
  drawing: SheetGraphicDrawing,
  geometry: EvaluatedShapePresetGeometry | undefined,
  route: ReadyShapeConnectorRoute,
  rect?: PictureFrameRect,
): void {
  if (
    geometry !== route.geometry ||
    drawing.width !== route.geometry.width ||
    drawing.height !== route.geometry.height ||
    route.paintLayout.rect.width !== route.geometry.width ||
    route.paintLayout.rect.height !== route.geometry.height ||
    (rect && (rect.width !== route.geometry.width || rect.height !== route.geometry.height)) ||
    drawing.rotation !== route.paintLayout.angleDeg ||
    drawing.shapeFlipX ||
    drawing.shapeFlipY ||
    route.shapeFlipX ||
    route.shapeFlipY
  )
    throw new TypeError(
      "Resolved connector marker paint requires its exact neutral paint frame and geometry.",
    );
}
function routeLocalDirection(route: ReadyShapeConnectorRoute, direction: Point): Point {
  const turn = ((route.paintLayout.angleDeg % 360) + 360) % 360;
  // Exact cardinal bases avoid introducing an extra component into zero-axis routes.
  const radians = (turn * Math.PI) / 180;
  const cos =
    turn === 0 ? 1 : turn === 180 ? -1 : turn === 90 || turn === 270 ? 0 : Math.cos(radians);
  const sin =
    turn === 90 ? 1 : turn === 270 ? -1 : turn === 0 || turn === 180 ? 0 : Math.sin(radians);
  const x = direction.x * cos + direction.y * sin,
    y = -direction.x * sin + direction.y * cos,
    length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length === 0)
    throw new RangeError("Resolved connector marker paint requires a finite nonzero tangent.");
  return { x: x / length, y: y / length };
}
/** Endpoint paint is product-owned, bounded numeric geometry, never user SVG. */
export function getShapeEndPaint(
  drawing: SheetGraphicDrawing,
  geometry: EvaluatedShapePresetGeometry | undefined,
  route?: ReadyShapeConnectorRoute,
): readonly ShapeEndPaint[] {
  // Validate even invisible/undecorated routes: a missing or stale bundle cannot
  // quietly resume the static preset path when appearance changes later.
  if (route) assertReadyRoute(drawing, geometry, route);
  if (
    !geometry ||
    !(
      (drawing.shapeGeometry && isShapeLinePreset(drawing.shapeGeometry.preset)) ||
      (drawing.shapePath && !isShapeFreePathClosed(drawing.shapePath))
    ) ||
    !drawing.shapeLineEnds ||
    drawing.strokeWidth <= 0 ||
    drawing.stroke === "transparent"
  )
    return [];
  if (route) {
    const result: ShapeEndPaint[] = [];
    if (drawing.shapeLineEnds.begin) {
      const direction = routeLocalDirection(route, route.beginTangent);
      result.push(
        directionMarker(
          drawing.shapeLineEnds.begin,
          route.localEndpoints[0],
          -direction.x,
          -direction.y,
          drawing.strokeWidth,
        ),
      );
    }
    if (drawing.shapeLineEnds.end) {
      const direction = routeLocalDirection(route, route.endTangent);
      result.push(
        directionMarker(
          drawing.shapeLineEnds.end,
          route.localEndpoints[1],
          direction.x,
          direction.y,
          drawing.strokeWidth,
        ),
      );
    }
    return result;
  }
  const lines = geometry.paths
    .filter((p) => p.stroke)
    .flatMap((p) =>
      flattenShapePath(p, 0.05, drawing.shapePath ? FREE_SHAPE_PATH_WORK_BUDGET : undefined),
    )
    .filter((p) => p.points.length >= 2);
  const first = lines[0]?.points,
    last = lines.at(-1)?.points;
  const result: ShapeEndPaint[] = [];
  if (first && drawing.shapeLineEnds.begin) {
    const tip = first[0]!;
    const previous = first.find((point) => Math.hypot(point.x - tip.x, point.y - tip.y) > 1e-8);
    const paint =
      previous && marker(drawing.shapeLineEnds.begin, tip, previous, drawing.strokeWidth);
    if (paint) result.push(paint);
  }
  if (last && drawing.shapeLineEnds.end) {
    const tip = last.at(-1)!;
    const previous = [...last]
      .reverse()
      .find((point) => Math.hypot(point.x - tip.x, point.y - tip.y) > 1e-8);
    const paint = previous && marker(drawing.shapeLineEnds.end, tip, previous, drawing.strokeWidth);
    if (paint) result.push(paint);
  }
  return result;
}
export function shapeDrawingContainsWorldPoint(
  drawing: SheetGraphicDrawing,
  geometry: EvaluatedShapePresetGeometry | undefined,
  rect: PictureFrameRect,
  point: Point,
  route?: ReadyShapeConnectorRoute,
): boolean {
  if (route) assertReadyRoute(drawing, geometry, route, rect);
  const local = standardShapeFlipPoint(
    drawing,
    standardShapeWorldToLocal(rect, drawing.rotation, point),
  );
  return (
    standardShapeContainsLocalPoint(geometry, standardShapeAppearance(drawing), local) ||
    getShapeEndPaint(drawing, geometry, route).some((p) => p.contains(local))
  );
}
