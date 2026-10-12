import { assertShapePathBudget } from "./path-budget.js";
import type { ShapePresetGeometry, ShapePresetPath } from "./types.js";

type Point = Readonly<{ x: number; y: number }>;
export type ShapePolyline = Readonly<{ points: readonly Point[]; closed: boolean }>;
function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function distance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

/** Bounded adaptive curves for input hit tests; painting retains the exact native curves. */
export function flattenShapePath(
  path: ShapePresetPath,
  tolerance = 0.25,
): readonly ShapePolyline[] {
  assertShapePathBudget(path);
  if (!Number.isFinite(tolerance) || tolerance < 0.01 || tolerance > 10)
    throw new RangeError("Invalid shape curve tolerance.");
  const result: { points: Point[]; closed: boolean }[] = [];
  let current = { points: [] as Point[], closed: false },
    pen: Point = { x: 0, y: 0 },
    count = 0;
  function append(point: Point) {
    if (++count > 4096) throw new RangeError("Shape hit geometry exceeds its point budget.");
    current.points.push(point);
    pen = point;
  }
  function curve(points: readonly Point[], depth: number): void {
    const first = points[0]!,
      last = points.at(-1)!;
    if (
      depth >= 10 ||
      points.slice(1, -1).every((point) => distance(point, first, last) <= tolerance)
    ) {
      append(last);
      return;
    }
    const left = [first],
      right = [last];
    let row = [...points];
    while (row.length > 1) {
      row = row.slice(1).map((point, index) => midpoint(row[index]!, point));
      left.push(row[0]!);
      right.unshift(row.at(-1)!);
    }
    curve(left, depth + 1);
    curve(right, depth + 1);
  }
  for (const c of path.commands) {
    if (c[0] === "M") {
      if (current.points.length) result.push(current);
      current = { points: [], closed: false };
      append({ x: c[1], y: c[2] });
    } else if (c[0] === "L") append({ x: c[1], y: c[2] });
    else if (c[0] === "Q") curve([pen, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }], 0);
    else if (c[0] === "C")
      curve([pen, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }], 0);
    else if (c[0] === "A") {
      const [, rx, ry, cx, cy, start, end] = c,
        radius = Math.max(rx, ry);
      const step =
        radius > tolerance
          ? 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius)))
          : Math.PI / 2;
      const segments = Math.min(
        1024,
        Math.max(1, Math.ceil(Math.abs(end - start) / Math.max(step, 1e-6))),
      );
      for (let index = 1; index <= segments; index++) {
        const angle = start + ((end - start) * index) / segments;
        append({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
      }
    } else if (c[0] === "Z") {
      current.closed = true;
      pen = current.points[0] ?? pen;
      if (current.points.length) result.push(current);
      current = { points: [], closed: false };
    }
  }
  if (current.points.length) result.push(current);
  return result;
}

/** Filled paths are unioned independently. Reversed hole contours within one path stay holes. */
export function isPointInShapePreset(geometry: ShapePresetGeometry, point: Point): boolean {
  if (geometry.paths.length > 16) throw new RangeError("Shape exceeds its path budget.");
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  for (const path of geometry.paths) {
    if (!path.filled) continue;
    let winding = 0;
    for (const { points } of flattenShapePath(path)) {
      for (let index = 0; index < points.length; index++) {
        const a = points[index]!,
          b = points[(index + 1) % points.length]!;
        if (distance(point, a, b) <= 0.25) return true;
        const cross = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
        if (a.y <= point.y && b.y > point.y && cross > 0) winding++;
        else if (a.y > point.y && b.y <= point.y && cross < 0) winding--;
      }
    }
    if (winding !== 0) return true;
  }
  return false;
}

/** Numeric-only SVG commands for product-owned previews; no XML or HTML comes from user data. */
export function shapePresetPathToSvg(path: ShapePresetPath): string {
  assertShapePathBudget(path);
  const number = (value: number) => String(Number(value.toPrecision(12)));
  const parts: string[] = [];
  for (const c of path.commands) {
    if (c[0] === "A") {
      const [, rx, ry, cx, cy, start, end] = c,
        sweep = end - start;
      const segments = Math.max(1, Math.ceil(Math.abs(sweep) / Math.PI));
      for (let index = 1; index <= segments; index++) {
        const angle = start + (sweep * index) / segments;
        parts.push(
          `A${number(rx)} ${number(ry)} 0 0 ${sweep >= 0 ? 1 : 0} ${number(cx + rx * Math.cos(angle))} ${number(cy + ry * Math.sin(angle))}`,
        );
      }
    } else
      parts.push(
        c[0] +
          c
            .slice(1)
            .map((value) => number(value as number))
            .join(" "),
      );
  }
  return parts.join("");
}
