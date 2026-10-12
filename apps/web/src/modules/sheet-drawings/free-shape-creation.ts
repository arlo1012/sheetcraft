import {
  normalizeShapeFreePath,
  type ShapeFreePathCommand,
  type ShapeFreePathTool,
} from "@sheetcraft/core/shape-free-path";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { reanchorFloatingImageAtSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
export const MAX_FREE_SHAPE_POINTS = 2046;
type Point = Readonly<{ x: number; y: number }>;
/** Product-owned uniform Catmull–Rom interpolation; not a claim about a desktop spline implementation. */
function curveCommands(points: readonly Point[], closed: boolean): ShapeFreePathCommand[] {
  const first = points[0]!;
  const commands: ShapeFreePathCommand[] = [["M", first.x, first.y]];
  const n = points.length,
    segments = closed ? n : n - 1;
  const at = (index: number) =>
    points[closed ? ((index % n) + n) % n : Math.max(0, Math.min(n - 1, index))]!;
  for (let i = 0; i < segments; i++) {
    const previous = at(i - 1),
      a = at(i),
      b = at(i + 1),
      next = at(i + 2);
    commands.push([
      "C",
      a.x + (b.x - previous.x) / 6,
      a.y + (b.y - previous.y) / 6,
      b.x - (next.x - a.x) / 6,
      b.y - (next.y - a.y) / 6,
      b.x,
      b.y,
    ]);
  }
  if (closed) commands.push(["Z"]);
  return commands;
}
/** Completion creates one detached bounded path. Partial/short/oversized strokes create no object. */
export function createFreeShapeDrawingFromPoints(options: {
  base: SheetGraphicDrawing;
  tool: ShapeFreePathTool;
  points: readonly Point[];
  layout: SheetViewportLayout;
  closed?: boolean;
}): SheetGraphicDrawing | undefined {
  const { base, tool, layout, closed = false } = options;
  if (
    base.kind !== "shape" ||
    !["curve", "freeform", "scribble"].includes(tool) ||
    options.points.length > MAX_FREE_SHAPE_POINTS
  )
    return;
  const total = layout.getTotalSize();
  if (![total.width, total.height].every(Number.isFinite)) return;
  const points: Point[] = [];
  for (const point of options.points) {
    if (
      ![point.x, point.y].every(Number.isFinite) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > Math.min(total.width, 10_000_000) ||
      point.y > Math.min(total.height, 10_000_000)
    )
      return;
    const last = points.at(-1);
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1e-7) points.push({ ...point });
  }
  const first = points[0];
  if (
    !first ||
    points.length < 2 ||
    !points.some((p) => Math.hypot(p.x - first.x, p.y - first.y) >= 1)
  )
    return;
  if (
    closed &&
    points.length > 2 &&
    Math.hypot(points.at(-1)!.x - first.x, points.at(-1)!.y - first.y) <= 1e-7
  )
    points.pop();
  if (closed && points.length < 3) return;
  const commands: ShapeFreePathCommand[] =
    tool === "curve"
      ? curveCommands(points, closed)
      : points.map((p, index) => [index === 0 ? "M" : "L", p.x, p.y] as const);
  if (closed && tool !== "curve") commands.push(["Z"]);
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const command of commands)
    for (let i = 1; i < command.length; i += 2) {
      const x = command[i] as number,
        y = command[i + 1] as number;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  if (right - left < 1) {
    const center = (left + right) / 2;
    left = center - 0.5;
    right = center + 0.5;
  }
  if (bottom - top < 1) {
    const center = (top + bottom) / 2;
    top = center - 0.5;
    bottom = center + 0.5;
  }
  const width = right - left,
    height = bottom - top;
  if (
    ![left, top, width, height].every(Number.isFinite) ||
    left < 0 ||
    top < 0 ||
    right > total.width ||
    bottom > total.height ||
    width > 16384 ||
    height > 16384
  )
    return;
  const localCommands = commands.map(
    (command) =>
      command.map((value, index) =>
        index === 0 ? value : (value as number) - (index % 2 === 1 ? left : top),
      ) as unknown as ShapeFreePathCommand,
  );
  try {
    const pointTypes: Record<string, "smooth"> = {};
    if (tool === "curve") {
      for (let i = closed ? 0 : 1; i < (closed ? points.length : points.length - 1); i++)
        pointTypes[String(i)] = "smooth";
    }
    const path = normalizeShapeFreePath({
      tool,
      viewBox: { width, height },
      commands: localCommands,
      ...(Object.keys(pointTypes).length ? { pointTypes } : {}),
    });
    const drawing = {
      ...base,
      kind: "shape" as const,
      width,
      height,
      rotation: 0,
      text: "",
      fill: "transparent",
      shapePath: path,
    };
    delete drawing.shapeGeometry;
    delete drawing.shapeLineEnds;
    delete drawing.shapeFlipX;
    delete drawing.shapeFlipY;
    delete drawing.textDirection;
    return (
      reanchorFloatingImageAtSheetRect(drawing, { x: left, y: top, width, height }, layout) ??
      undefined
    );
  } catch {
    return;
  }
}
