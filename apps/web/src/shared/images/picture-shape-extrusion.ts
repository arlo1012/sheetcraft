import {
  flattenShapePath,
  getShapePresetFillBounds,
  type ShapePathCommand,
  type ShapePolyline,
  type ShapePresetGeometry,
  type ShapePresetPath,
} from "@sheetcraft/core/shape-presets";
import {
  PICTURE_PROJECTIVE_LIMITS,
  type PictureProjectiveBounds,
  type PictureProjectiveGeometry,
  type PictureProjectiveHomography,
  type PictureProjectivePoint,
  type PictureProjectiveVector,
} from "./picture-projective-geometry";

/** Shape tessellation, not another camera: all projection uses the owner's matrices. */
export const PICTURE_SHAPE_EXTRUSION_LIMITS = Object.freeze({
  paths: 16,
  commands: 1024,
  points: 4096,
  sides: 4096,
  splits: 16_384,
  pairTests: 8_388_608,
  curveErrorPx: 0.125,
  rasterWork: 128_000_000,
});
export type PictureShapeProjectedPoint = PictureProjectivePoint &
  Readonly<{ w: number; depth: number }>;
export type PictureShapeProjectedEdge = Readonly<{
  a: PictureShapeProjectedPoint;
  b: PictureShapeProjectedPoint;
}>;
export type PictureShapeProjectedSide = Readonly<{
  corners: readonly [
    PictureShapeProjectedPoint,
    PictureShapeProjectedPoint,
    PictureShapeProjectedPoint,
    PictureShapeProjectedPoint,
  ];
  inverse: PictureProjectiveHomography;
  normal: PictureProjectiveVector;
  /** World z = depthOrigin + u*depthU + v*depthV; u follows boundary, v follows extrusion. */
  depthOrigin: number;
  depthU: number;
  depthV: number;
  bounds: PictureProjectiveBounds;
}>;
export type PictureShapeExtrusion = Readonly<{
  fillPaths: readonly (readonly ShapePolyline[])[];
  frontFill: readonly (readonly ShapePolyline[])[];
  backFill: readonly (readonly ShapePolyline[])[];
  frontStroke: readonly PictureShapeProjectedEdge[];
  backStroke: readonly PictureShapeProjectedEdge[];
  connectors: readonly PictureShapeProjectedEdge[];
  sides: readonly PictureShapeProjectedSide[];
  bounds: PictureProjectiveBounds;
}>;
type Edge = Readonly<{ a: PictureProjectivePoint; b: PictureProjectivePoint }>;

function finite(value: number, name: string): void {
  if (!Number.isFinite(value) || Math.abs(value) > PICTURE_PROJECTIVE_LIMITS.coordinatePx)
    throw new RangeError(`Picture shape ${name} exceeds its finite coordinate budget.`);
}
function scaleCommand(command: ShapePathCommand, density: number): ShapePathCommand {
  return command.map((value, index) =>
    typeof value === "number" ? value * (command[0] === "A" && index >= 5 ? 1 : density) : value,
  ) as unknown as ShapePathCommand;
}
function scaledShape(
  shape: ShapePresetGeometry,
  geometry: PictureProjectiveGeometry,
  density: number,
): ShapePresetGeometry {
  if (
    !Number.isFinite(density) ||
    density <= 0 ||
    density > 64 ||
    !shape ||
    !Number.isFinite(shape.width) ||
    !Number.isFinite(shape.height) ||
    Math.abs(shape.width * density - geometry.widthPx) > 1e-8 * Math.max(1, geometry.widthPx) ||
    Math.abs(shape.height * density - geometry.heightPx) > 1e-8 * Math.max(1, geometry.heightPx)
  )
    throw new RangeError(
      "Picture projected logical shape and raster frame must match at the supplied density.",
    );
  if (
    !Array.isArray(shape.paths) ||
    shape.paths.length < 1 ||
    shape.paths.length > PICTURE_SHAPE_EXTRUSION_LIMITS.paths
  )
    throw new RangeError("Picture projected shape exceeds its nonempty path budget.");
  let commands = 0;
  for (const path of shape.paths) {
    if (
      !path ||
      typeof path.filled !== "boolean" ||
      typeof path.stroke !== "boolean" ||
      !Array.isArray(path.commands)
    )
      throw new TypeError("Picture projected shape needs numeric fill/stroke paths.");
    commands += path.commands.length;
  }
  if (commands > PICTURE_SHAPE_EXTRUSION_LIMITS.commands)
    throw new RangeError("Picture projected shape exceeds its aggregate command budget.");
  // Public Core validates commands/radii/sweeps before we scale or flatten anything.
  const filled = getShapePresetFillBounds(shape);
  if (!filled) throw new RangeError("Picture projected shape has no filled extent.");
  return {
    width: geometry.widthPx,
    height: geometry.heightPx,
    handles: [],
    adjustments: {},
    paths: shape.paths.map((path) => ({
      filled: path.filled,
      stroke: path.stroke,
      commands: path.commands.map((command: ShapePathCommand) => scaleCommand(command, density)),
    })),
  };
}
function sourceBounds(shape: ShapePresetGeometry): PictureProjectiveBounds {
  const all = getShapePresetFillBounds({
    ...shape,
    paths: shape.paths.map((path) => ({ ...path, filled: path.filled || path.stroke })),
  });
  if (!all) throw new RangeError("Picture projected shape has no usable extent.");
  return {
    left: all.left,
    top: all.top,
    right: all.left + all.width,
    bottom: all.top + all.height,
  };
}
export function projectPictureShapePoint(
  geometry: PictureProjectiveGeometry,
  point: PictureProjectivePoint,
  z = 0,
): PictureShapeProjectedPoint {
  const matrix = geometry.sourceToScreenMatrix,
    model = geometry.sourceToWorldMatrix;
  finite(point.x, "source X");
  finite(point.y, "source Y");
  finite(z, "source Z");
  const w = matrix[12] * point.x + matrix[13] * point.y + matrix[14] * z + matrix[15];
  if (!Number.isFinite(w) || w <= PICTURE_PROJECTIVE_LIMITS.nearPlaneW)
    throw new RangeError("Picture shape extrusion crosses or approaches the camera near plane.");
  const x = (matrix[0] * point.x + matrix[1] * point.y + matrix[2] * z + matrix[3]) / w;
  const y = (matrix[4] * point.x + matrix[5] * point.y + matrix[6] * z + matrix[7]) / w;
  const depth = model[8] * point.x + model[9] * point.y + model[10] * z + model[11];
  finite(x, "projected X");
  finite(y, "projected Y");
  finite(depth, "world depth");
  return { x, y, w, depth };
}
function boundsOf(points: readonly PictureProjectivePoint[]): PictureProjectiveBounds {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return { left, top, right, bottom };
}
function guardedBounds(
  geometry: PictureProjectiveGeometry,
  box: PictureProjectiveBounds,
): PictureProjectiveBounds {
  const corners = [
    { x: box.left, y: box.top },
    { x: box.right, y: box.top },
    { x: box.right, y: box.bottom },
    { x: box.left, y: box.bottom },
  ];
  return boundsOf(
    corners.flatMap((point) => [
      projectPictureShapePoint(geometry, point),
      projectPictureShapePoint(geometry, point, -geometry.depthPx),
    ]),
  );
}
/** Full pure topology/curve preflight, not merely a layout-extent calculation.
 * The conservative TRUE path extent is a horizon guard, never a fill mask. */
export function getPictureShapeExtrusionBounds(
  geometry: PictureProjectiveGeometry,
  shape: ShapePresetGeometry,
  density: number,
): PictureProjectiveBounds {
  return createPictureShapeExtrusion(geometry, shape, density).bounds;
}
function contains(
  paths: readonly (readonly ShapePolyline[])[],
  point: PictureProjectivePoint,
  work: { remaining: number },
): boolean {
  for (const path of paths) {
    let winding = 0;
    for (const contour of path)
      for (let index = 0; index < contour.points.length; index++) {
        if (--work.remaining < 0)
          throw new RangeError("Picture shape boundary exceeds its winding work budget.");
        const a = contour.points[index]!,
          b = contour.points[(index + 1) % contour.points.length]!;
        const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
        if (a.y <= point.y && b.y > point.y && cross > 0) winding++;
        else if (a.y > point.y && b.y <= point.y && cross < 0) winding--;
      }
    if (winding !== 0) return true;
  }
  return false;
}
function edgesOf(contours: readonly ShapePolyline[], fill: boolean): Edge[] {
  const edges: Edge[] = [];
  for (const { points, closed } of contours) {
    for (let index = 0; index < points.length - (fill || closed ? 0 : 1); index++) {
      const a = points[index]!,
        b = points[(index + 1) % points.length]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-10) edges.push({ a, b });
    }
  }
  return edges;
}
function boundaryEdges(paths: readonly (readonly ShapePolyline[])[]): Edge[] {
  const windingWork = { remaining: PICTURE_SHAPE_EXTRUSION_LIMITS.rasterWork };
  const edges = paths.flatMap((path) => edgesOf(path, true)),
    count = edges.length;
  if (
    count > PICTURE_SHAPE_EXTRUSION_LIMITS.sides ||
    (count * (count - 1)) / 2 > PICTURE_SHAPE_EXTRUSION_LIMITS.pairTests
  )
    throw new RangeError("Picture shape boundary exceeds its intersection work budget.");
  const splits = edges.map(() => [0, 1]);
  let splitCount = count * 2;
  const append = (index: number, t: number) => {
    if (t > 1e-10 && t < 1 - 1e-10) {
      if (++splitCount > PICTURE_SHAPE_EXTRUSION_LIMITS.splits)
        throw new RangeError("Picture shape boundary exceeds its intersection split budget.");
      splits[index]!.push(t);
    }
  };
  for (let first = 0; first < count; first++)
    for (let second = first + 1; second < count; second++) {
      const a = edges[first]!,
        b = edges[second]!;
      const ax = a.b.x - a.a.x,
        ay = a.b.y - a.a.y,
        bx = b.b.x - b.a.x,
        by = b.b.y - b.a.y;
      const dx = b.a.x - a.a.x,
        dy = b.a.y - a.a.y,
        cross = ax * by - ay * bx;
      if (Math.abs(cross) > 1e-12 * Math.hypot(ax, ay) * Math.hypot(bx, by)) {
        const t = (dx * by - dy * bx) / cross,
          u = (dx * ay - dy * ax) / cross;
        if (t >= -1e-10 && t <= 1 + 1e-10 && u >= -1e-10 && u <= 1 + 1e-10) {
          append(first, t);
          append(second, u);
        }
      } else if (Math.abs(dx * ay - dy * ax) <= 1e-10 * Math.hypot(ax, ay)) {
        const aa = ax * ax + ay * ay,
          bb = bx * bx + by * by;
        append(first, (dx * ax + dy * ay) / aa);
        append(first, ((b.b.x - a.a.x) * ax + (b.b.y - a.a.y) * ay) / aa);
        append(second, (-dx * bx - dy * by) / bb);
        append(second, ((a.b.x - b.a.x) * bx + (a.b.y - b.a.y) * by) / bb);
      }
    }
  const result: Edge[] = [],
    seen = new Set<string>();
  for (let index = 0; index < count; index++) {
    const edge = edges[index]!,
      ts = splits[index]!.sort((a, b) => a - b);
    const dx = edge.b.x - edge.a.x,
      dy = edge.b.y - edge.a.y,
      length = Math.hypot(dx, dy);
    for (let part = 1; part < ts.length; part++) {
      const start = ts[part - 1]!,
        end = ts[part]!;
      if (end - start <= 1e-10) continue;
      const a = { x: edge.a.x + start * dx, y: edge.a.y + start * dy };
      const b = { x: edge.a.x + end * dx, y: edge.a.y + end * dy };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let left = false,
        right = false;
      for (
        let epsilon = Math.min(0.01, ((end - start) * length) / 100);
        epsilon >= 1e-8;
        epsilon /= 10
      ) {
        left = contains(
          paths,
          {
            x: mid.x - (dy / length) * epsilon,
            y: mid.y + (dx / length) * epsilon,
          },
          windingWork,
        );
        right = contains(
          paths,
          {
            x: mid.x + (dy / length) * epsilon,
            y: mid.y - (dx / length) * epsilon,
          },
          windingWork,
        );
        if (left !== right) break;
      }
      if (left === right) continue;
      const oriented = left ? { a, b } : { a: b, b: a };
      const key = [oriented.a.x, oriented.a.y, oriented.b.x, oriented.b.y]
        .map((value) => value.toPrecision(14))
        .join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(oriented);
      if (result.length > PICTURE_SHAPE_EXTRUSION_LIMITS.sides)
        throw new RangeError("Picture shape union exceeds its side face budget.");
    }
  }
  return result;
}
function invert(h: PictureProjectiveHomography): PictureProjectiveHomography | null {
  const [a, b, c, d, e, f, g, i, j] = h;
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [
    e * j - f * i,
    c * i - b * j,
    b * f - c * e,
    f * g - d * j,
    a * j - c * g,
    c * d - a * f,
    d * i - e * g,
    b * g - a * i,
    a * e - b * d,
  ].map((value) => value / det) as unknown as PictureProjectiveHomography;
}
function sideOf(
  geometry: PictureProjectiveGeometry,
  edge: Edge,
): PictureShapeProjectedSide | undefined {
  const { a, b } = edge,
    dx = b.x - a.x,
    dy = b.y - a.y,
    depth = geometry.depthPx;
  const corners = [
    projectPictureShapePoint(geometry, a),
    projectPictureShapePoint(geometry, a, -depth),
    projectPictureShapePoint(geometry, b, -depth),
    projectPictureShapePoint(geometry, b),
  ] as const;
  let area = 0;
  for (let index = 0; index < 4; index++) {
    const p = corners[index]!,
      q = corners[(index + 1) % 4]!;
    area +=
      (p.x - corners[0].x) * (q.y - corners[0].y) - (q.x - corners[0].x) * (p.y - corners[0].y);
  }
  if (area <= 1e-10) return undefined;
  const s = geometry.sourceToScreenMatrix,
    m = geometry.sourceToWorldMatrix;
  const inverse = invert([
    s[0] * dx + s[1] * dy,
    -depth * s[2],
    s[0] * a.x + s[1] * a.y + s[3],
    s[4] * dx + s[5] * dy,
    -depth * s[6],
    s[4] * a.x + s[5] * a.y + s[7],
    s[12] * dx + s[13] * dy,
    -depth * s[14],
    s[12] * a.x + s[13] * a.y + s[15],
  ]);
  if (!inverse) return undefined;
  const length = Math.hypot(dx, dy),
    nx = dy / length,
    ny = -dx / length;
  return {
    corners,
    inverse,
    normal: { x: m[0] * nx + m[1] * ny, y: m[4] * nx + m[5] * ny, z: m[8] * nx + m[9] * ny },
    depthOrigin: m[8] * a.x + m[9] * a.y + m[11],
    depthU: m[8] * dx + m[9] * dy,
    depthV: -depth * m[10],
    bounds: boundsOf(corners),
  };
}
function curveTolerance(geometry: PictureProjectiveGeometry, box: PictureProjectiveBounds): number {
  const s = geometry.sourceToScreenMatrix;
  let minimumW = Infinity,
    nxX = 0,
    nxY = 0,
    nyX = 0,
    nyY = 0;
  for (const x of [box.left, box.right])
    for (const y of [box.top, box.bottom])
      for (const z of [0, -geometry.depthPx]) {
        const p = projectPictureShapePoint(geometry, { x, y }, z),
          w = p.w;
        minimumW = Math.min(minimumW, w);
        nxX = Math.max(nxX, Math.abs((s[0] - p.x * s[12]) * w));
        nxY = Math.max(nxY, Math.abs((s[1] - p.x * s[13]) * w));
        nyX = Math.max(nyX, Math.abs((s[4] - p.y * s[12]) * w));
        nyY = Math.max(nyY, Math.abs((s[5] - p.y * s[13]) * w));
      }
  const lipschitz = Math.hypot(nxX, nxY, nyX, nyY) / (minimumW * minimumW);
  return Math.min(0.125, PICTURE_SHAPE_EXTRUSION_LIMITS.curveErrorPx / Math.max(lipschitz, 1e-12));
}
/** Core's hard depth cap must meet the declared curve error, never a coarse fallback. */
function assertCurveResolution(path: ShapePresetPath, tolerance: number): void {
  let pen: PictureProjectivePoint = { x: 0, y: 0 },
    start = pen,
    leaves = 0;
  const curve = (points: readonly PictureProjectivePoint[], depth: number): void => {
    const a = points[0]!,
      b = points.at(-1)!,
      dx = b.x - a.x,
      dy = b.y - a.y;
    const square = dx * dx + dy * dy;
    const flat = points.slice(1, -1).every((point) => {
      const t =
        square > 0
          ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square))
          : 0;
      return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) <= tolerance;
    });
    if (flat) {
      if (++leaves > PICTURE_SHAPE_EXTRUSION_LIMITS.points)
        throw new RangeError("Picture shape curve exceeds its subdivision work budget.");
      return;
    }
    if (depth >= 10)
      throw new RangeError("Picture shape Bezier cannot meet its bounded curve error.");
    const left = [a],
      right = [b];
    let row = [...points];
    while (row.length > 1) {
      row = row.slice(1).map((point, index) => ({
        x: (row[index]!.x + point.x) / 2,
        y: (row[index]!.y + point.y) / 2,
      }));
      left.push(row[0]!);
      right.unshift(row.at(-1)!);
    }
    curve(left, depth + 1);
    curve(right, depth + 1);
  };
  for (const command of path.commands) {
    if (command[0] === "M" || command[0] === "L") {
      pen = { x: command[1], y: command[2] };
      if (command[0] === "M") start = pen;
    } else if (command[0] === "Q") {
      const end = { x: command[3], y: command[4] };
      curve([pen, { x: command[1], y: command[2] }, end], 0);
      pen = end;
    } else if (command[0] === "C") {
      const end = { x: command[5], y: command[6] };
      curve([pen, { x: command[1], y: command[2] }, { x: command[3], y: command[4] }, end], 0);
      pen = end;
    } else if (command[0] === "A") {
      pen = {
        x: command[3] + command[1] * Math.cos(command[6]),
        y: command[4] + command[2] * Math.sin(command[6]),
      };
    } else pen = start;
  }
}
/** Resolves numeric evaluated presets only. Nonzero-winding holes and independent
 * filled-path unions determine solid boundaries; stroke paths stay independent.
 * Smooth facet joins are NOT invented wire-frame creases. */
function buildPictureShapeExtrusion(
  geometry: PictureProjectiveGeometry,
  scaled: ShapePresetGeometry,
): PictureShapeExtrusion {
  const box = sourceBounds(scaled),
    bounds = guardedBounds(geometry, box);
  const tolerance = curveTolerance(geometry, box);
  const curved = scaled.paths.some((path) =>
    path.commands.some((command) => ["Q", "C", "A"].includes(command[0])),
  );
  if (curved && tolerance < 0.01)
    throw new RangeError(
      "Picture shape projection requires unsupported curve subdivision precision.",
    );
  let pointCount = 0;
  const flattened = scaled.paths.map((path) => {
    assertCurveResolution(path, Math.max(0.01, tolerance));
    for (const command of path.commands)
      if (command[0] === "A") {
        const radius = Math.max(command[1], command[2]);
        const step =
          radius > tolerance
            ? 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius)))
            : Math.PI / 2;
        if (Math.ceil(Math.abs(command[6] - command[5]) / Math.max(step, 1e-6)) > 1024)
          throw new RangeError("Picture shape arc cannot meet its bounded curve error.");
      }
    const contours = flattenShapePath(path, Math.max(0.01, tolerance));
    pointCount += contours.reduce((sum, contour) => sum + contour.points.length, 0);
    if (pointCount > PICTURE_SHAPE_EXTRUSION_LIMITS.points)
      throw new RangeError("Picture shape exceeds its aggregate flattened point budget.");
    return contours;
  });
  const fillPaths = flattened.filter((_, index) => scaled.paths[index]!.filled);
  const boundary = geometry.depthPx > 0 ? boundaryEdges(fillPaths) : [];
  const strokes = flattened.flatMap((contours, index) =>
    scaled.paths[index]!.stroke ? edgesOf(contours, false) : [],
  );
  const projectEdge = (edge: Edge, z: number): PictureShapeProjectedEdge => ({
    a: projectPictureShapePoint(geometry, edge.a, z),
    b: projectPictureShapePoint(geometry, edge.b, z),
  });
  const frontStroke = strokes.map((edge) => projectEdge(edge, 0));
  const backStroke =
    geometry.depthPx > 0 ? strokes.map((edge) => projectEdge(edge, -geometry.depthPx)) : [];
  const sides = boundary.flatMap((edge) => {
    const side = sideOf(geometry, edge);
    return side ? [side] : [];
  });
  const connectors: PictureShapeProjectedEdge[] = [];
  for (const edge of boundary) {
    const previous = boundary.find(
      (other) => Math.hypot(other.b.x - edge.a.x, other.b.y - edge.a.y) < 1e-7,
    );
    const side = sideOf(geometry, edge),
      previousSide = previous ? sideOf(geometry, previous) : undefined;
    const dx = edge.b.x - edge.a.x,
      dy = edge.b.y - edge.a.y;
    const pdx = previous ? previous.b.x - previous.a.x : dx,
      pdy = previous ? previous.b.y - previous.a.y : dy;
    const cosine = (dx * pdx + dy * pdy) / (Math.hypot(dx, dy) * Math.hypot(pdx, pdy));
    if (!!side !== !!previousSide || (side && cosine < Math.cos(0.2)))
      connectors.push({
        a: projectPictureShapePoint(geometry, edge.a),
        b: projectPictureShapePoint(geometry, edge.a, -geometry.depthPx),
      });
  }
  const projectFill = (z: number) =>
    fillPaths.map((path) =>
      path.map((contour) => ({
        closed: true,
        points: contour.points.map((point) => projectPictureShapePoint(geometry, point, z)),
      })),
    );
  return {
    fillPaths,
    frontFill: projectFill(0),
    backFill: geometry.depthPx > 0 ? projectFill(-geometry.depthPx) : [],
    frontStroke,
    backStroke,
    connectors,
    sides,
    bounds,
  };
}

const SHAPE_CACHE_ENTRIES = 8,
  SHAPE_CACHE_UNITS = 65_536;
const extrusionCache = new Map<
  string,
  Readonly<{ result: PictureShapeExtrusion; units: number }>
>();
let cachedUnits = 0;
function freezeGeometry(value: object): void {
  if (Object.isFrozen(value)) return;
  for (const child of Object.values(value))
    if (child && typeof child === "object") freezeGeometry(child);
  Object.freeze(value);
}
function geometryUnits(result: PictureShapeExtrusion): number {
  const contours = (paths: readonly (readonly ShapePolyline[])[]) =>
    paths.reduce(
      (sum, path) => sum + path.reduce((count, contour) => count + contour.points.length, 0),
      0,
    );
  return (
    contours(result.fillPaths) +
    contours(result.frontFill) +
    contours(result.backFill) +
    2 * (result.frontStroke.length + result.backStroke.length + result.connectors.length) +
    14 * result.sides.length
  );
}
/** Content-keyed numeric-only LRU; mutable input edits cannot reuse stale topology.
 * Eight entries AND 65536 geometry units bound retained allocation. No assets,
 * pixels, Canvas, callbacks, document state, or failed partial geometry is cached.
 * Returned derived geometry is deeply frozen before it can enter the cache. */
export function createPictureShapeExtrusion(
  geometry: PictureProjectiveGeometry,
  shape: ShapePresetGeometry,
  density: number,
): PictureShapeExtrusion {
  const scaled = scaledShape(shape, geometry, density);
  // scaledShape rejects path/command counts and malformed numbers BEFORE stringify.
  const key = JSON.stringify([
    geometry.widthPx,
    geometry.heightPx,
    geometry.depthPx,
    geometry.sourceToWorldMatrix,
    geometry.sourceToScreenMatrix,
    scaled.paths,
  ]);
  const previous = extrusionCache.get(key);
  if (previous) {
    extrusionCache.delete(key);
    extrusionCache.set(key, previous);
    return previous.result;
  }
  const result = buildPictureShapeExtrusion(geometry, scaled),
    units = geometryUnits(result);
  freezeGeometry(result);
  if (units <= SHAPE_CACHE_UNITS) {
    while (extrusionCache.size >= SHAPE_CACHE_ENTRIES || cachedUnits + units > SHAPE_CACHE_UNITS) {
      const first = extrusionCache.keys().next().value;
      if (first === undefined) break;
      cachedUnits -= extrusionCache.get(first)!.units;
      extrusionCache.delete(first);
    }
    extrusionCache.set(key, { result, units });
    cachedUnits += units;
  }
  return result;
}
