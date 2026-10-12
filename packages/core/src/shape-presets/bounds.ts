import { assertShapePathBudget } from "./path-budget.js";
import type { ShapePresetGeometry } from "./types.js";

export type ShapePresetBounds = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

/** Exact curve extrema of the union's filled paths, including out-of-frame callout tails. */
export function getShapePresetFillBounds(
  geometry: ShapePresetGeometry,
): ShapePresetBounds | undefined {
  if (geometry.paths.length > 16) throw new RangeError("Shape exceeds its path budget.");
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  const include = (x: number, y: number) => {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  };
  for (const path of geometry.paths) {
    assertShapePathBudget(path);
    if (!path.filled) continue;
    let x = 0,
      y = 0,
      startX = 0,
      startY = 0;
    for (const c of path.commands) {
      if (c[0] === "M" || c[0] === "L") {
        x = c[1];
        y = c[2];
        include(x, y);
        if (c[0] === "M") {
          startX = x;
          startY = y;
        }
      } else if (c[0] === "Q") {
        const fromX = x,
          fromY = y;
        const at = (t: number) => {
          const s = 1 - t;
          include(
            s * s * fromX + 2 * s * t * c[1] + t * t * c[3],
            s * s * fromY + 2 * s * t * c[2] + t * t * c[4],
          );
        };
        for (const [p0, p1, p2] of [
          [fromX, c[1], c[3]],
          [fromY, c[2], c[4]],
        ]) {
          const denominator = p0! - 2 * p1! + p2!;
          if (denominator !== 0) {
            const t = (p0! - p1!) / denominator;
            if (t > 0 && t < 1) at(t);
          }
        }
        x = c[3];
        y = c[4];
        include(x, y);
      } else if (c[0] === "C") {
        const fromX = x,
          fromY = y;
        const at = (t: number) => {
          const s = 1 - t;
          include(
            s ** 3 * fromX + 3 * s * s * t * c[1] + 3 * s * t * t * c[3] + t ** 3 * c[5],
            s ** 3 * fromY + 3 * s * s * t * c[2] + 3 * s * t * t * c[4] + t ** 3 * c[6],
          );
        };
        for (const [p0, p1, p2, p3] of [
          [fromX, c[1], c[3], c[5]],
          [fromY, c[2], c[4], c[6]],
        ]) {
          const a = -p0! + 3 * p1! - 3 * p2! + p3!,
            b = 2 * (p0! - 2 * p1! + p2!),
            d = p1! - p0!;
          const roots =
            a === 0
              ? b === 0
                ? []
                : [-d / b]
              : b * b - 4 * a * d < 0
                ? []
                : [
                    (-b + Math.sqrt(b * b - 4 * a * d)) / (2 * a),
                    (-b - Math.sqrt(b * b - 4 * a * d)) / (2 * a),
                  ];
          for (const t of roots) if (t > 0 && t < 1) at(t);
        }
        x = c[5];
        y = c[6];
        include(x, y);
      } else if (c[0] === "A") {
        const [, rx, ry, cx, cy, start, end] = c;
        const at = (angle: number) => include(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
        at(start);
        at(end);
        const first = Math.ceil(Math.min(start, end) / (Math.PI / 2));
        const last = Math.floor(Math.max(start, end) / (Math.PI / 2));
        for (let index = first; index <= last; index++) at((index * Math.PI) / 2);
        x = cx + rx * Math.cos(end);
        y = cy + ry * Math.sin(end);
      } else {
        x = startX;
        y = startY;
      }
    }
  }
  return Number.isFinite(left) && right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : undefined;
}
