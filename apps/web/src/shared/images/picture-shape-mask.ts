import {
  flattenShapePath,
  getShapePresetFillBounds,
  type ShapePolyline,
  type ShapePresetGeometry,
  type ShapePathCommand,
  type ShapePresetPath,
} from "@sheetcraft/core/shape-presets";
import type { PictureLine } from "@sheetcraft/core/picture-detailed-style";
import {
  getPictureLineCompoundBands,
  getPictureLineDashIntervals,
  getPictureLineDashPattern,
  type PictureEffectBounds,
} from "./picture-effect-geometry";
import type { PictureAlphaMask, PictureRgbaSurface } from "./picture-effect-raster";

export const PICTURE_SHAPE_MASK_LIMITS = Object.freeze({
  paths: 16,
  commands: 1024,
  points: 16_384,
  intervals: 8192,
  side: 4096,
  pixels: 4_000_000,
});
export type PreparedPictureShapeGeometry = Readonly<{
  geometry: ShapePresetGeometry;
  fillBounds: PictureEffectBounds;
  strokeBounds: PictureEffectBounds | undefined;
  strokePolylines: readonly ShapePolyline[];
  pointCount: number;
  commandCount: number;
}>;
const preparedShapes = new WeakSet<object>();
function assertPrepared(shape: PreparedPictureShapeGeometry): void {
  if (!shape || !preparedShapes.has(shape))
    throw new TypeError("Picture shape must pass numeric preflight before painting.");
}
function box(bounds: {
  left: number;
  top: number;
  width: number;
  height: number;
}): PictureEffectBounds {
  const snap = (coordinate: number) =>
    Math.abs(coordinate - Math.round(coordinate)) <=
    Number.EPSILON * Math.max(1, Math.abs(coordinate)) * 16
      ? Math.round(coordinate) || 0
      : coordinate;
  return {
    left: snap(bounds.left),
    top: snap(bounds.top),
    right: snap(bounds.left + bounds.width),
    bottom: snap(bounds.top + bounds.height),
  };
}
/** Strict numeric-only geometry boundary. Detached paths cannot change during a paint callback. */
export function preparePictureShapeGeometry(
  geometry: ShapePresetGeometry,
  frame: Readonly<{ width: number; height: number }>,
): PreparedPictureShapeGeometry {
  if (
    !geometry ||
    geometry.width !== frame.width ||
    geometry.height !== frame.height ||
    !Number.isFinite(frame.width) ||
    !Number.isFinite(frame.height) ||
    frame.width <= 0 ||
    frame.height <= 0
  )
    throw new RangeError("Picture shape geometry must match the actual local frame.");
  if (
    !Array.isArray(geometry.paths) ||
    geometry.paths.length < 1 ||
    geometry.paths.length > PICTURE_SHAPE_MASK_LIMITS.paths
  )
    throw new RangeError("Picture shape exceeds its nonempty path budget.");
  let commandCount = 0;
  for (const path of geometry.paths) {
    if (
      typeof path.filled !== "boolean" ||
      typeof path.stroke !== "boolean" ||
      !Array.isArray(path.commands)
    )
      throw new TypeError("Picture shape requires typed numeric fill/stroke paths.");
    commandCount += path.commands.length;
  }
  if (commandCount > PICTURE_SHAPE_MASK_LIMITS.commands)
    throw new RangeError("Picture shape exceeds its aggregate command budget.");
  // Core validates every command, coordinate, radius and finite arc sweep.
  const bounds = getShapePresetFillBounds(geometry);
  if (!bounds) throw new RangeError("Picture shape has no nonempty filled extent.");
  const paths: ShapePresetPath[] = geometry.paths.map((path) =>
    Object.freeze({
      filled: path.filled,
      stroke: path.stroke,
      commands: Object.freeze(
        path.commands.map(
          (command: ShapePathCommand) => Object.freeze([...command]) as typeof command,
        ),
      ),
    }),
  );
  const detached: ShapePresetGeometry = Object.freeze({
    width: geometry.width,
    height: geometry.height,
    paths: Object.freeze(paths),
    handles: Object.freeze([]),
    adjustments: Object.freeze({}),
  });
  const strokePaths = paths.filter((path) => path.stroke);
  const strokeBounds = getShapePresetFillBounds({
    ...detached,
    paths: strokePaths.map((path) => ({ ...path, filled: true })),
  });
  const strokePolylines = strokePaths.flatMap((path) => flattenShapePath(path, 0.01));
  const pointCount = strokePolylines.reduce((sum, path) => sum + path.points.length, 0);
  if (pointCount > PICTURE_SHAPE_MASK_LIMITS.points)
    throw new RangeError("Picture shape exceeds its flattened outline point budget.");
  const prepared = Object.freeze({
    geometry: detached,
    fillBounds: Object.freeze(box(bounds)),
    strokeBounds: strokeBounds ? Object.freeze(box(strokeBounds)) : undefined,
    strokePolylines: Object.freeze(
      strokePolylines.map((polyline) =>
        Object.freeze({
          closed: polyline.closed,
          points: Object.freeze(polyline.points.map((point) => Object.freeze({ ...point }))),
        }),
      ),
    ),
    pointCount,
    commandCount,
  });
  preparedShapes.add(prepared);
  return prepared;
}

/** Exact native curves. Filled open paths close implicitly; stroke paths close ONLY at Z. */
export function tracePictureShapePath(
  context: CanvasRenderingContext2D,
  path: ShapePresetPath,
): void {
  // Validate hand-built paths as well as prepared paths; no XML, strings or eval enter Canvas.
  getShapePresetFillBounds({ width: 1, height: 1, paths: [path], handles: [], adjustments: {} });
  for (const command of path.commands) {
    switch (command[0]) {
      case "M":
        context.moveTo(command[1], command[2]);
        break;
      case "L":
        context.lineTo(command[1], command[2]);
        break;
      case "Q":
        context.quadraticCurveTo(command[1], command[2], command[3], command[4]);
        break;
      case "C":
        context.bezierCurveTo(
          command[1],
          command[2],
          command[3],
          command[4],
          command[5],
          command[6],
        );
        break;
      case "A":
        context.ellipse(
          command[3],
          command[4],
          command[1],
          command[2],
          0,
          command[5],
          command[6],
          command[6] < command[5],
        );
        break;
      case "Z":
        context.closePath();
        break;
    }
  }
}
/** Each filled path has its own nonzero winding, then source-over unions the alpha.
 * Combining all commands into one nonzero clip would cancel unrelated reversed paths. */
export function paintPictureShapeFillMask(
  context: CanvasRenderingContext2D,
  shape: PreparedPictureShapeGeometry,
): void {
  assertPrepared(shape);
  context.save();
  try {
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "#ffffff";
    for (const path of shape.geometry.paths)
      if (path.filled) {
        context.beginPath();
        tracePictureShapePath(context, path);
        context.fill("nonzero");
      }
  } finally {
    context.restore();
  }
}
export type PictureShapeAlphaMaskOptions = Readonly<{
  shape: PreparedPictureShapeGeometry;
  density: number;
  boundsRaster: PictureEffectBounds;
  canvasFactory?: () => HTMLCanvasElement;
}>;
export function createPictureShapeAlphaMask(
  options: PictureShapeAlphaMaskOptions,
): PictureAlphaMask {
  assertPrepared(options.shape);
  const bounds = options.boundsRaster,
    width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  if (
    !Number.isFinite(options.density) ||
    options.density <= 0 ||
    options.density > 64 ||
    ![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isSafeInteger) ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    width * height > 4_000_000
  )
    throw new RangeError("Picture shape alpha exceeds the finite raster budget.");
  // Verify the union/outline budget before the factory or any Canvas allocation.
  if (options.shape.commandCount > 1024 || options.shape.pointCount > 16_384)
    throw new RangeError("Picture shape mask exceeds its path budget.");
  const canvas = options.canvasFactory ? options.canvasFactory() : document.createElement("canvas");
  try {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Picture shape alpha processing is unavailable.");
    context.translate(-bounds.left, -bounds.top);
    context.scale(options.density, options.density);
    paintPictureShapeFillMask(context, options.shape);
    const pixels = context.getImageData(0, 0, width, height).data;
    if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4)
      throw new TypeError("Picture shape Canvas must return exact-length RGBA pixels.");
    const data = new Float32Array(width * height);
    for (let index = 0; index < data.length; index++) data[index] = pixels[index * 4 + 3]! / 255;
    return { width, height, data };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
/** Mask a composed source/backplate group ONCE, retaining straight RGB until alpha becomes zero. */
export function applyPictureShapeAlphaMask(
  surface: PictureRgbaSurface,
  mask: PictureAlphaMask,
): void {
  if (
    surface.width !== mask.width ||
    surface.height !== mask.height ||
    !(surface.data instanceof Uint8ClampedArray) ||
    surface.data.length !== surface.width * surface.height * 4 ||
    !(mask.data instanceof Float32Array) ||
    mask.data.length !== surface.width * surface.height
  )
    throw new TypeError("Picture shape alpha must exactly match its owned RGBA surface.");
  for (let index = 0; index < mask.data.length; index++) {
    const alpha = mask.data[index]!;
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
      throw new RangeError("Picture shape alpha must be a finite fraction.");
  }
  for (let index = 0; index < mask.data.length; index++) {
    const offset = index * 4;
    surface.data[offset + 3] = surface.data[offset + 3]! * mask.data[index]!;
    if (surface.data[offset + 3] === 0) surface.data.fill(0, offset, offset + 3);
  }
}

function pointsOf(polyline: ShapePolyline) {
  const points = polyline.points;
  const first = points[0],
    last = points.at(-1);
  const epsilon =
    Number.EPSILON * Math.max(1, Math.abs(first?.x ?? 0), Math.abs(first?.y ?? 0)) * 64;
  return polyline.closed &&
    first &&
    last &&
    Math.hypot(first.x - last.x, first.y - last.y) <= epsilon
    ? points.slice(0, -1)
    : points;
}
function lengthOf(polyline: ShapePolyline): number {
  const points = pointsOf(polyline);
  let length = 0;
  for (let index = 1; index < points.length; index++)
    length += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.y - points[index - 1]!.y,
    );
  if (polyline.closed && points.length > 1)
    length += Math.hypot(points[0]!.x - points.at(-1)!.x, points[0]!.y - points.at(-1)!.y);
  return length;
}
export function getPictureShapeOutlineIntervalCount(
  shape: PreparedPictureShapeGeometry,
  line: PictureLine,
  density: number,
): number {
  assertPrepared(shape);
  if (line.widthPt === 0 || line.paint.opacity === 0) return 0;
  let count = 0;
  for (const path of shape.strokePolylines) {
    const length = lengthOf(path) * density;
    count += getPictureLineDashIntervals(
      length,
      ((line.widthPt * 4) / 3) * density,
      line.dash,
    ).length;
    if (count > PICTURE_SHAPE_MASK_LIMITS.intervals)
      throw new RangeError("Picture shape exceeds its aggregate dash interval budget.");
  }
  return count;
}
function joinFactor(polyline: ShapePolyline, miterLimit: number): number {
  const points = pointsOf(polyline);
  let factor = 1;
  for (
    let index = polyline.closed ? 0 : 1;
    index < points.length - (polyline.closed ? 0 : 1);
    index++
  ) {
    const previous = points[(index - 1 + points.length) % points.length]!,
      point = points[index]!,
      next = points[(index + 1) % points.length]!;
    const ax = point.x - previous.x,
      ay = point.y - previous.y,
      bx = next.x - point.x,
      by = next.y - point.y;
    const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (lengths === 0) continue;
    const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / lengths));
    const ratio = Math.sqrt(2 / (1 + cosine));
    if (Number.isFinite(ratio) && ratio <= miterLimit) factor = Math.max(factor, ratio);
  }
  return factor;
}
/** Conservative curve/offset-band/cap/join envelope, including acute native miters. */
export function getPictureShapeStrokeBounds(
  shape: PreparedPictureShapeGeometry,
  line: PictureLine,
): PictureEffectBounds | undefined {
  assertPrepared(shape);
  if (!shape.strokeBounds || line.widthPt === 0 || line.paint.opacity === 0) return undefined;
  const joins =
    line.compound === "single" && line.join !== "miter"
      ? 1
      : Math.max(1, ...shape.strokePolylines.map((path) => joinFactor(path, line.miterLimit)));
  const factor = Math.max(
    joins,
    line.cap === "square" && line.dash !== "round-dot" ? Math.SQRT2 : 1,
  );
  const radius = ((line.widthPt * 4) / 3 / 2) * factor;
  const bounds = shape.strokeBounds;
  return {
    left: bounds.left - radius,
    top: bounds.top - radius,
    right: bounds.right + radius,
    bottom: bounds.bottom + radius,
  };
}
function offsetPoints(
  polyline: ShapePolyline,
  offset: number,
  miterLimit: number,
): readonly Readonly<{ x: number; y: number }>[] {
  const points = pointsOf(polyline),
    output: { x: number; y: number }[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!,
      previous = points[index === 0 ? (polyline.closed ? points.length - 1 : 0) : index - 1]!;
    const next = points[index === points.length - 1 ? (polyline.closed ? 0 : index) : index + 1]!;
    const ax = point.x - previous.x,
      ay = point.y - previous.y,
      bx = next.x - point.x,
      by = next.y - point.y;
    const a = Math.hypot(ax, ay),
      b = Math.hypot(bx, by);
    const nx0 = a === 0 ? (b === 0 ? 0 : by / b) : ay / a,
      ny0 = a === 0 ? (b === 0 ? 0 : -bx / b) : -ax / a;
    const nx1 = b === 0 ? nx0 : by / b,
      ny1 = b === 0 ? ny0 : -bx / b;
    const denominator = 1 + nx0 * nx1 + ny0 * ny1;
    let nx = denominator > 1e-10 ? (nx0 + nx1) / denominator : nx1;
    let ny = denominator > 1e-10 ? (ny0 + ny1) / denominator : ny1;
    const ratio = Math.hypot(nx, ny);
    if (ratio > miterLimit) {
      nx = nx1;
      ny = ny1;
    }
    output.push({ x: point.x + nx * offset, y: point.y + ny * offset });
  }
  return output;
}
/** Exact single paths; compound paths use bounded 0.01-logical-pixel curve offsets.
 * All bands sample a shared original-path arc-length phase, including closing seams. */
export function strokePictureShapeOutline(
  context: CanvasRenderingContext2D,
  shape: PreparedPictureShapeGeometry,
  line: PictureLine,
  density: number,
): void {
  getPictureShapeOutlineIntervalCount(shape, line, density);
  context.save();
  try {
    const width = ((line.widthPt * 4) / 3) * density;
    if (width === 0 || line.paint.opacity === 0) return;
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#ffffff";
    context.lineCap = line.dash === "round-dot" ? "round" : line.cap;
    context.lineJoin = line.join;
    context.miterLimit = line.miterLimit;
    if (line.compound === "single") {
      context.lineWidth = width;
      context.setLineDash(getPictureLineDashPattern(line.dash).map((length) => length * width));
      context.lineDashOffset = 0;
      context.scale(density, density);
      context.lineWidth = width / density;
      context.setLineDash(
        getPictureLineDashPattern(line.dash).map((length) => (length * width) / density),
      );
      for (const path of shape.geometry.paths)
        if (path.stroke) {
          context.beginPath();
          tracePictureShapePath(context, path);
          context.stroke();
        }
      return;
    }
    context.setLineDash([]);
    for (const polyline of shape.strokePolylines) {
      const original = pointsOf(polyline);
      if (original.length < 2) continue;
      const pathLength = lengthOf(polyline) * density;
      const lengths = new Float64Array(original.length + (polyline.closed ? 1 : 0));
      for (let index = 1; index < lengths.length; index++)
        lengths[index] =
          lengths[index - 1]! +
          Math.hypot(
            original[index % original.length]!.x - original[index - 1]!.x,
            original[index % original.length]!.y - original[index - 1]!.y,
          ) *
            density;
      const intervals = getPictureLineDashIntervals(pathLength, width, line.dash);
      for (const [inner, outer] of getPictureLineCompoundBands(line.compound)) {
        const offset = (((inner + outer) / 2) * width) / density;
        const shifted = offsetPoints(polyline, offset, line.miterLimit);
        context.lineWidth = (outer - inner) * width;
        const at = (position: number): readonly [number, number] => {
          const t = polyline.closed
            ? ((position % pathLength) + pathLength) % pathLength
            : Math.max(0, Math.min(pathLength, position));
          let index = 1;
          while (index < lengths.length - 1 && lengths[index]! < t) index++;
          const start = lengths[index - 1]!,
            span = lengths[index]! - start,
            mix = span === 0 ? 0 : (t - start) / span;
          const a = shifted[(index - 1) % shifted.length]!,
            b = shifted[index % shifted.length]!;
          return [(a.x * (1 - mix) + b.x * mix) * density, (a.y * (1 - mix) + b.y * mix) * density];
        };
        const trace = (start: number, end: number, closed = false) => {
          context.beginPath();
          const first = at(start);
          context.moveTo(first[0], first[1]);
          for (let cycle = 0; cycle <= (end > pathLength ? 1 : 0); cycle++)
            for (let index = 1; index < lengths.length; index++) {
              const t = cycle * pathLength + lengths[index]!;
              if (t > start && t < end) {
                const point = at(t);
                context.lineTo(point[0], point[1]);
              }
            }
          const last = at(end);
          context.lineTo(last[0], last[1]);
          if (closed) context.closePath();
          context.stroke();
        };
        if (line.dash === "solid") {
          trace(0, pathLength, polyline.closed);
          continue;
        }
        const first = intervals[0],
          last = intervals.at(-1);
        const seam =
          polyline.closed &&
          line.dash !== "round-dot" &&
          first &&
          last &&
          first !== last &&
          first.start <= 0 &&
          last.end >= pathLength;
        if (seam) trace(last.start, pathLength + first.end);
        for (let index = 0; index < intervals.length; index++) {
          if (seam && (index === 0 || index === intervals.length - 1)) continue;
          const interval = intervals[index]!;
          if (interval.dot === "round") {
            if (interval.start < 0 || interval.start >= pathLength) continue;
            const point = at(interval.start);
            context.beginPath();
            context.arc(point[0], point[1], context.lineWidth / 2, 0, 2 * Math.PI);
            context.fill();
          } else {
            const start = Math.max(0, interval.start),
              end = Math.min(pathLength, interval.end);
            if (end > start) trace(start, end);
          }
        }
      }
    }
  } finally {
    context.restore();
  }
}
