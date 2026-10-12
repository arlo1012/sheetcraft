import type { ShapeLine } from "@sheetcraft/core/shape-style";
import {
  getPictureLineCompoundBands,
  getPictureLineDashIntervals,
} from "../../shared/images/picture-effect-geometry";
import type { PictureRgbaSurface } from "../../shared/images/picture-effect-raster";

/** Transient numeric glyph boundaries. No document assets or rectangular extrusion proxy. */
export const SHAPE_GLYPH_CONTOUR_LIMITS = Object.freeze({
  side: 4096,
  pixels: 4_000_000,
  edges: 32_768,
  points: 16_384,
  contours: 4096,
  intervals: 8192,
  scratchBytes: 12 * 1024 * 1024,
});
export type ShapeGlyphPoint = Readonly<{ x: number; y: number }>;
export type ShapeGlyphContour = Readonly<{
  points: readonly ShapeGlyphPoint[];
  /** Signed area is positive for outer boundaries in Canvas's downward y axis. */
  area: number;
  length: number;
}>;
export type ShapeGlyphSilhouette = Readonly<{
  width: number;
  height: number;
  contours: readonly ShapeGlyphContour[];
  edgeCount: number;
  pointCount: number;
  /** Pixel-cell tracing is an explicitly quantized silhouette, not vector font outlines. */
  maximumErrorRasterPx: number;
}>;
type Edge = { start: number; end: number; direction: number; used: boolean };
const preparedSilhouettes = new WeakSet<object>();

/** Trace the actual native alpha, including counters/holes and disconnected components.
 * A fixed threshold and bounded edge graph keep work O(pixels + boundary edges).
 * Diagonal touching cells stay separate; no invented edge joins fill their gap. */
export function traceShapeGlyphSilhouette(
  surface: PictureRgbaSurface,
  threshold = 128,
): ShapeGlyphSilhouette {
  const { width, height, data } = surface;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > SHAPE_GLYPH_CONTOUR_LIMITS.side ||
    height > SHAPE_GLYPH_CONTOUR_LIMITS.side ||
    width * height > SHAPE_GLYPH_CONTOUR_LIMITS.pixels ||
    !(data instanceof Uint8ClampedArray) ||
    data.length !== width * height * 4
  )
    throw new RangeError("Glyph silhouette requires a bounded exact-length RGBA surface.");
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 255)
    throw new RangeError("Glyph alpha threshold must be an integer within [1,255].");
  const stride = width + 1,
    edges: Edge[] = [],
    outgoing = new Map<number, number[]>();
  const inside = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && data[(y * width + x) * 4 + 3]! >= threshold;
  const add = (x: number, y: number, dx: number, dy: number, direction: number) => {
    if (edges.length >= SHAPE_GLYPH_CONTOUR_LIMITS.edges)
      throw new RangeError("Glyph alpha contour exceeds its boundary edge budget.");
    const start = y * stride + x,
      end = (y + dy) * stride + x + dx,
      list = outgoing.get(start) ?? [];
    list.push(edges.length);
    outgoing.set(start, list);
    edges.push({ start, end, direction, used: false });
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      // Interior is always on the right of a directed edge, including holes.
      if (!inside(x, y - 1)) add(x, y, 1, 0, 0);
      if (!inside(x + 1, y)) add(x + 1, y, 0, 1, 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, -1, 0, 2);
      if (!inside(x - 1, y)) add(x, y + 1, 0, -1, 3);
    }
  const contours: ShapeGlyphContour[] = [];
  let pointCount = 0;
  for (let firstIndex = 0; firstIndex < edges.length; firstIndex++) {
    if (edges[firstIndex]!.used) continue;
    if (contours.length >= SHAPE_GLYPH_CONTOUR_LIMITS.contours)
      throw new RangeError("Glyph alpha contour exceeds its component budget.");
    const first = edges[firstIndex]!,
      points: ShapeGlyphPoint[] = [];
    let current = firstIndex,
      previousDirection = -1,
      traversed = 0;
    while (true) {
      const edge = edges[current]!;
      if (edge.used || ++traversed > edges.length)
        throw new TypeError("Glyph alpha contour has an invalid boundary graph.");
      edge.used = true;
      if (edge.direction !== previousDirection)
        points.push({ x: edge.start % stride, y: Math.floor(edge.start / stride) });
      previousDirection = edge.direction;
      if (edge.end === first.start) break;
      const candidates = (outgoing.get(edge.end) ?? []).filter((index) => !edges[index]!.used);
      // Right turn, straight, left, reverse. This separates diagonal components.
      const rank = (index: number) => {
        const turn = (edges[index]!.direction - edge.direction + 4) % 4;
        return turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3;
      };
      candidates.sort((a, b) => rank(a) - rank(b));
      const next = candidates[0];
      if (next === undefined) throw new TypeError("Glyph alpha contour is not closed.");
      current = next;
    }
    // The initial vertex may have been in a straight edge across the closing seam.
    if (points.length > 2) {
      const a = points.at(-1)!,
        b = points[0]!,
        c = points[1]!;
      if ((b.x - a.x) * (c.y - b.y) === (b.y - a.y) * (c.x - b.x)) points.shift();
    }
    pointCount += points.length;
    if (pointCount > SHAPE_GLYPH_CONTOUR_LIMITS.points)
      throw new RangeError("Glyph alpha contour exceeds its simplified point budget.");
    let area = 0,
      length = 0;
    for (let index = 0; index < points.length; index++) {
      const a = points[index]!,
        b = points[(index + 1) % points.length]!;
      area += a.x * b.y - b.x * a.y;
      length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    contours.push(
      Object.freeze({
        points: Object.freeze(points.map((point) => Object.freeze(point))),
        area: area / 2,
        length,
      }),
    );
  }
  const result = Object.freeze({
    width,
    height,
    contours: Object.freeze(contours),
    edgeCount: edges.length,
    pointCount,
    maximumErrorRasterPx: Math.SQRT2,
  });
  preparedSilhouettes.add(result);
  return result;
}

function shiftedPoints(contour: ShapeGlyphContour, offset: number, limit: number) {
  return contour.points.map((point, index, points) => {
    const a = points[(index + points.length - 1) % points.length]!,
      b = points[(index + 1) % points.length]!,
      ax = point.x - a.x,
      ay = point.y - a.y,
      bx = b.x - point.x,
      by = b.y - point.y,
      al = Math.hypot(ax, ay),
      bl = Math.hypot(bx, by),
      nx0 = ay / al,
      ny0 = -ax / al,
      nx1 = by / bl,
      ny1 = -bx / bl,
      denominator = 1 + nx0 * nx1 + ny0 * ny1;
    let nx = denominator > 1e-10 ? (nx0 + nx1) / denominator : nx1,
      ny = denominator > 1e-10 ? (ny0 + ny1) / denominator : ny1;
    if (Math.hypot(nx, ny) > limit) {
      nx = nx1;
      ny = ny1;
    }
    return { x: point.x + offset * nx, y: point.y + offset * ny };
  });
}

/** Compound/dashed bands follow true glyph alpha contours, including hole boundaries.
 * Every band's dash phase uses the same ORIGINAL contour arc length. Rasterization
 * precision is disclosed by maximumErrorRasterPx; this is not desktop font parity. */
export function strokeShapeGlyphSilhouette(
  context: CanvasRenderingContext2D,
  silhouette: ShapeGlyphSilhouette,
  line: ShapeLine,
  density: number,
): void {
  if (!preparedSilhouettes.has(silhouette))
    throw new TypeError("Glyph outline requires a preflighted native alpha silhouette.");
  const width = (line.widthPt * 4 * density) / 3;
  if (!Number.isFinite(width) || width < 0 || width > 4096)
    throw new RangeError("Glyph contour outline exceeds its raster width budget.");
  if (width === 0 || line.paint.opacity === 0) return;
  let intervalCount = 0;
  const work = silhouette.contours.map((contour) => {
    const intervals = getPictureLineDashIntervals(contour.length, width, line.dash);
    intervalCount += intervals.length;
    if (intervalCount > SHAPE_GLYPH_CONTOUR_LIMITS.intervals)
      throw new RangeError("Glyph contour outline exceeds its aggregate dash interval budget.");
    return { contour, intervals };
  });
  context.save();
  try {
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#ffffff";
    context.lineCap = line.dash === "round-dot" ? "round" : line.cap;
    context.lineJoin = line.join;
    context.miterLimit = line.miterLimit;
    context.setLineDash([]);
    for (const { contour, intervals } of work) {
      const points = contour.points,
        lengths = new Float64Array(points.length + 1);
      for (let index = 1; index < lengths.length; index++)
        lengths[index] =
          lengths[index - 1]! +
          Math.hypot(
            points[index % points.length]!.x - points[index - 1]!.x,
            points[index % points.length]!.y - points[index - 1]!.y,
          );
      const upper = (position: number) => {
        let low = 1,
          high = lengths.length - 1;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (lengths[middle]! <= position) low = middle + 1;
          else high = middle;
        }
        return low;
      };
      for (const [inner, outer] of getPictureLineCompoundBands(line.compound)) {
        const shifted = shiftedPoints(contour, ((inner + outer) * width) / 2, line.miterLimit);
        context.lineWidth = (outer - inner) * width;
        const at = (position: number) => {
          const t = ((position % contour.length) + contour.length) % contour.length,
            index = upper(t),
            span = lengths[index]! - lengths[index - 1]!,
            mix = span === 0 ? 0 : (t - lengths[index - 1]!) / span,
            a = shifted[index - 1]!,
            b = shifted[index % shifted.length]!;
          return { x: a.x * (1 - mix) + b.x * mix, y: a.y * (1 - mix) + b.y * mix };
        };
        const trace = (start: number, end: number, closed = false) => {
          const first = at(start);
          context.beginPath();
          context.moveTo(first.x, first.y);
          const firstCycle = Math.floor(start / contour.length),
            finalCycle = Math.floor(end / contour.length);
          for (let cycle = firstCycle; cycle <= finalCycle; cycle++) {
            const localStart = Math.max(0, start - cycle * contour.length),
              localEnd = Math.min(contour.length, end - cycle * contour.length);
            for (let index = upper(localStart); index < lengths.length; index++) {
              const t = lengths[index]!;
              if (t > localEnd || cycle * contour.length + t >= end) break;
              const point = shifted[index % shifted.length]!;
              context.lineTo(point.x, point.y);
            }
          }
          const last = at(end);
          context.lineTo(last.x, last.y);
          if (closed) context.closePath();
          context.stroke();
        };
        if (line.dash === "solid") {
          trace(0, contour.length, true);
          continue;
        }
        const first = intervals[0],
          last = intervals.at(-1),
          seam =
            line.dash !== "round-dot" &&
            first &&
            last &&
            first !== last &&
            first.start <= 0 &&
            last.end >= contour.length;
        if (seam) trace(last.start, contour.length + first.end);
        for (let index = 0; index < intervals.length; index++) {
          if (seam && (index === 0 || index === intervals.length - 1)) continue;
          const interval = intervals[index]!;
          if (interval.dot === "round") {
            if (interval.start < 0 || interval.start >= contour.length) continue;
            const point = at(interval.start);
            context.beginPath();
            context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
            context.fill();
          } else {
            const start = Math.max(0, interval.start),
              end = Math.min(contour.length, interval.end);
            if (end > start) trace(start, end);
          }
        }
      }
    }
  } finally {
    context.restore();
  }
}
