/** A bounded native-alpha consumer. Source geometry includes authored space advances;
 * this module never derives it from visible alpha or allocates lines/bands.
 * Positions returned by mapPoint are already at the settled destination raster density.
 */
export const TEXT_WARP_MESH_LIMITS = Object.freeze({
  vertices: 16_384,
  triangles: 32_768,
  sourceSide: 16_384,
  destinationSide: 4096,
  destinationPixels: 4_000_000,
  work: 128_000_000,
  bytes: 64 * 1024 * 1024,
  subdivisionDepth: 16,
  refinementPasses: 32,
  coordinateMagnitude: 10_000_000,
});

export type TextWarpPoint = Readonly<{ x: number; y: number }>;
export type TextWarpSourceRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;
export type TextWarpMeshBudget = Readonly<{
  maxVertices?: number;
  maxTriangles?: number;
  maxDestinationSide?: number;
  maxDestinationPixels?: number;
  maxWork?: number;
  maxBytes?: number;
  /** Other live compositor allocations, excluding the native source buffer. */
  reservedBytes?: number;
  /** Reserve its known backing-buffer bytes before constructing a mesh over a live source. */
  sourceBytes?: number;
  maxSubdivisionDepth?: number;
  maxRefinementPasses?: number;
}>;
export type TextWarpMeshErrorCode = "invalid" | "mapping" | "degenerate" | "budget" | "accuracy";
export class TextWarpMeshError extends RangeError {
  constructor(
    public readonly code: TextWarpMeshErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TextWarpMeshError";
  }
}
export type TextWarpMesh = Readonly<{
  sourceRect: TextWarpSourceRect;
  destination: TextWarpSourceRect;
  vertexCount: number;
  triangleCount: number;
  degenerateTriangleCount: number;
  toleranceRasterPx: number;
  maximumSampledErrorRasterPx: number;
  /** Finite probes cannot establish a supremum for an arbitrary caller callback. */
  accuracyScope: "edge-midpoints-diagonal-and-interior-probes";
  proof: Readonly<{
    numericBytes: number;
    /** Cumulative numeric allocations conservatively cover delayed GC during refinement. */
    preparationAllocatedNumericBytes: number;
    preparationPeakBytes: number;
    reservedSourceBytes: number;
    outputBytes: number;
    plannedRasterBytesWithoutSource: number;
    mappingEvaluations: number;
    preparationWork: number;
    rasterCandidatePixels: number;
    rasterScanlines: number;
    rasterWork: number;
    totalWork: number;
    reservedBytes: number;
  }>;
}>;
export type TextWarpAlphaSource = Readonly<{
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** RGBA samples use only genuine alpha. Alpha is already its own premultiplied component. */
  format?: "alpha" | "rgba";
}>;
export type TextWarpAlphaRaster = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  proof: Readonly<{
    numericBytes: number;
    sourceBytes: number;
    outputBytes: number;
    reservedBytes: number;
    peakBytes: number;
    totalWork: number;
  }>;
}>;

type Budget = Required<TextWarpMeshBudget>;
type MeshStorage = { vertices: Float64Array; triangles: Uint16Array; budget: Budget };
const prepared = new WeakMap<TextWarpMesh, MeshStorage>();
const MIN_TRIANGLE_AREA = 1e-12;
// These bounded weighted work units include allocation clearing, mapper invocation,
// deviation checks, triangle/span setup and inverse lookup. The mapper's internals
// are external work; mappingEvaluations lets its owner add their own bounded charge.
const PIXEL_WORK = 16;
const SCANLINE_WORK = 16;
const TRIANGLE_WORK = 32;
function fail(code: TextWarpMeshErrorCode, message: string): never {
  throw new TextWarpMeshError(code, message);
}
function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  name: string,
) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < minimum || result > fallback)
    fail("invalid", `Text warp ${name} must be an integer in [${minimum},${fallback}].`);
  return result;
}
function budgetOf(input: TextWarpMeshBudget = {}): Budget {
  return {
    maxVertices: boundedInteger(
      input.maxVertices,
      TEXT_WARP_MESH_LIMITS.vertices,
      4,
      "vertex budget",
    ),
    maxTriangles: boundedInteger(
      input.maxTriangles,
      TEXT_WARP_MESH_LIMITS.triangles,
      2,
      "triangle budget",
    ),
    maxDestinationSide: boundedInteger(
      input.maxDestinationSide,
      TEXT_WARP_MESH_LIMITS.destinationSide,
      1,
      "destination side",
    ),
    maxDestinationPixels: boundedInteger(
      input.maxDestinationPixels,
      TEXT_WARP_MESH_LIMITS.destinationPixels,
      1,
      "destination pixels",
    ),
    maxWork: boundedInteger(input.maxWork, TEXT_WARP_MESH_LIMITS.work, 1, "work budget"),
    maxBytes: boundedInteger(input.maxBytes, TEXT_WARP_MESH_LIMITS.bytes, 1, "byte budget"),
    reservedBytes: boundedInteger(
      input.reservedBytes ?? 0,
      TEXT_WARP_MESH_LIMITS.bytes,
      0,
      "reserved bytes",
    ),
    sourceBytes: boundedInteger(
      input.sourceBytes ?? 0,
      TEXT_WARP_MESH_LIMITS.bytes,
      0,
      "source bytes",
    ),
    maxSubdivisionDepth: boundedInteger(
      input.maxSubdivisionDepth,
      TEXT_WARP_MESH_LIMITS.subdivisionDepth,
      0,
      "subdivision depth",
    ),
    maxRefinementPasses: boundedInteger(
      input.maxRefinementPasses,
      TEXT_WARP_MESH_LIMITS.refinementPasses,
      0,
      "refinement passes",
    ),
  };
}
function validateSourceRect(rect: TextWarpSourceRect) {
  if (
    !rect ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.width > TEXT_WARP_MESH_LIMITS.sourceSide ||
    rect.height > TEXT_WARP_MESH_LIMITS.sourceSide ||
    Math.abs(rect.left) > TEXT_WARP_MESH_LIMITS.coordinateMagnitude ||
    Math.abs(rect.top) > TEXT_WARP_MESH_LIMITS.coordinateMagnitude ||
    Math.abs(rect.left + rect.width) > TEXT_WARP_MESH_LIMITS.coordinateMagnitude ||
    Math.abs(rect.top + rect.height) > TEXT_WARP_MESH_LIMITS.coordinateMagnitude
  )
    fail("invalid", "Text warp requires a finite positive bounded source geometry rectangle.");
}
function checkBytes(bytes: number, budget: Budget) {
  if (bytes + budget.reservedBytes + budget.sourceBytes > budget.maxBytes)
    fail("budget", "Text warp exceeds its aggregate live-byte budget.");
}
function checkWork(work: number, budget: Budget) {
  if (!Number.isSafeInteger(work) || work > budget.maxWork)
    fail("budget", "Text warp exceeds its aggregate work budget.");
}

/** Adjacent rectangles share complete rows/columns, including every refinement.
 * This conforming rectilinear strategy trades some surplus subdivision for no T-junctions.
 * Each rectangle has the same source diagonal, with row-major, left-to-right paint order.
 * Black-box maps are checked at four edge midpoints, the diagonal center, both triangle
 * centroids and four interior quarter points. A depth/budget failure never returns a mesh.
 * The callback's own internal work/storage must also be charged by its geometry owner.
 */
export function prepareTextWarpMesh(
  options: Readonly<{
    sourceRect: TextWarpSourceRect;
    mapPoint: (x: number, y: number) => TextWarpPoint;
    toleranceRasterPx: number;
    /** Optional common integer raster frame; must contain this mesh, without implicit clipping. */
    destinationFrame?: TextWarpSourceRect;
    budget?: TextWarpMeshBudget;
  }>,
): TextWarpMesh {
  validateSourceRect(options.sourceRect);
  if (typeof options.mapPoint !== "function")
    fail("invalid", "Text warp requires a numeric point mapper.");
  if (
    !Number.isFinite(options.toleranceRasterPx) ||
    options.toleranceRasterPx <= 0 ||
    options.toleranceRasterPx > 4096
  )
    fail("invalid", "Text warp requires a finite positive raster positional tolerance.");
  const budget = budgetOf(options.budget);
  const sourceRect = Object.freeze({ ...options.sourceRect });
  let allocatedBytes = 0,
    work = 0,
    mappingEvaluations = 0;
  const allocate = (bytes: number) => {
    checkBytes(allocatedBytes + bytes, budget);
    allocatedBytes += bytes;
    work += Math.ceil(bytes / 8);
    checkWork(work, budget);
  };
  const map = (u: number, v: number): TextWarpPoint => {
    work += 16;
    checkWork(work, budget);
    mappingEvaluations++;
    let point: TextWarpPoint;
    try {
      point = options.mapPoint(
        sourceRect.left + u * sourceRect.width,
        sourceRect.top + v * sourceRect.height,
      );
    } catch {
      return fail("mapping", "Text warp point mapping failed.");
    }
    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      Math.abs(point.x) > TEXT_WARP_MESH_LIMITS.coordinateMagnitude ||
      Math.abs(point.y) > TEXT_WARP_MESH_LIMITS.coordinateMagnitude
    )
      fail("mapping", "Text warp point mapping returned non-finite or out-of-range coordinates.");
    return point;
  };
  allocate(32);
  let xs: Float64Array = new Float64Array([0, 1]),
    ys: Float64Array = new Float64Array([0, 1]),
    vertices: Float64Array = new Float64Array(0),
    maximumSampledError = 0;
  for (let pass = 0; ; pass++) {
    const count = xs.length * ys.length,
      triangles = (xs.length - 1) * (ys.length - 1) * 2;
    if (count > budget.maxVertices || triangles > budget.maxTriangles)
      fail("budget", "Text warp conforming mesh exceeds its vertex/triangle budget.");
    allocate(count * 32 + xs.length + ys.length - 2);
    vertices = new Float64Array(count * 4);
    const splitX = new Uint8Array(xs.length - 1),
      splitY = new Uint8Array(ys.length - 1);
    for (let iy = 0; iy < ys.length; iy++)
      for (let ix = 0; ix < xs.length; ix++) {
        const u = xs[ix]!,
          v = ys[iy]!,
          point = map(u, v),
          index = (iy * xs.length + ix) * 4;
        vertices[index] = sourceRect.left + u * sourceRect.width;
        vertices[index + 1] = sourceRect.top + v * sourceRect.height;
        vertices[index + 2] = point.x;
        vertices[index + 3] = point.y;
      }
    let needsRefinement = false;
    maximumSampledError = 0;
    for (let iy = 0; iy < ys.length - 1; iy++)
      for (let ix = 0; ix < xs.length - 1; ix++) {
        const a = (iy * xs.length + ix) * 4,
          b = a + 4,
          d = a + xs.length * 4,
          c = d + 4;
        let xBad = false,
          yBad = false,
          interiorBad = false;
        const probe = (u: number, v: number) => {
          const actual = map(
            xs[ix]! + (xs[ix + 1]! - xs[ix]!) * u,
            ys[iy]! + (ys[iy + 1]! - ys[iy]!) * v,
          );
          // Source diagonal a->c: a,b,c when u>=v; a,c,d otherwise.
          const i0 = a,
            i1 = u >= v ? b : c,
            i2 = u >= v ? c : d,
            w0 = u >= v ? 1 - u : 1 - v,
            w1 = u >= v ? u - v : u,
            w2 = u >= v ? v : v - u,
            dx =
              actual.x - (vertices[i0 + 2]! * w0 + vertices[i1 + 2]! * w1 + vertices[i2 + 2]! * w2),
            dy =
              actual.y - (vertices[i0 + 3]! * w0 + vertices[i1 + 3]! * w1 + vertices[i2 + 3]! * w2),
            error = Math.hypot(dx, dy);
          work += 16;
          checkWork(work, budget);
          maximumSampledError = Math.max(maximumSampledError, error);
          return error > options.toleranceRasterPx;
        };
        xBad = probe(0.5, 0) || xBad;
        xBad = probe(0.5, 1) || xBad;
        yBad = probe(0, 0.5) || yBad;
        yBad = probe(1, 0.5) || yBad;
        interiorBad = probe(0.5, 0.5) || interiorBad;
        interiorBad = probe(2 / 3, 1 / 3) || interiorBad;
        interiorBad = probe(1 / 3, 2 / 3) || interiorBad;
        interiorBad = probe(0.25, 0.25) || interiorBad;
        interiorBad = probe(0.75, 0.75) || interiorBad;
        interiorBad = probe(0.75, 0.25) || interiorBad;
        interiorBad = probe(0.25, 0.75) || interiorBad;
        if (interiorBad && !xBad && !yBad) xBad = yBad = true;
        if (xBad) splitX[ix] = 1;
        if (yBad) splitY[iy] = 1;
        needsRefinement ||= xBad || yBad;
      }
    if (!needsRefinement) break;
    if (pass >= budget.maxRefinementPasses)
      fail(
        "accuracy",
        "Text warp cannot meet its sampled positional tolerance within its refinement-pass limit.",
      );
    const refine = (axis: Float64Array, flags: Uint8Array) => {
      let additions = 0;
      for (let index = 0; index < flags.length; index++) {
        if (!flags[index]) continue;
        if (axis[index + 1]! - axis[index]! <= 2 ** -budget.maxSubdivisionDepth)
          fail(
            "accuracy",
            "Text warp cannot meet its sampled positional tolerance within its subdivision depth.",
          );
        additions++;
      }
      return additions;
    };
    const addX = refine(xs, splitX),
      addY = refine(ys, splitY);
    if (
      (xs.length + addX) * (ys.length + addY) > budget.maxVertices ||
      (xs.length + addX - 1) * (ys.length + addY - 1) * 2 > budget.maxTriangles
    )
      fail("budget", "Text warp refinement exceeds its vertex/triangle budget before allocation.");
    const split = (axis: Float64Array, flags: Uint8Array, additions: number) => {
      if (additions === 0) return axis;
      allocate((axis.length + additions) * 8);
      const next = new Float64Array(axis.length + additions);
      let output = 0;
      for (let index = 0; index < axis.length - 1; index++) {
        next[output++] = axis[index]!;
        if (flags[index]) next[output++] = (axis[index]! + axis[index + 1]!) / 2;
      }
      next[output] = axis[axis.length - 1]!;
      return next;
    };
    xs = split(xs, splitX, addX);
    ys = split(ys, splitY, addY);
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let index = 0; index < vertices.length; index += 4) {
    minX = Math.min(minX, vertices[index + 2]!);
    minY = Math.min(minY, vertices[index + 3]!);
    maxX = Math.max(maxX, vertices[index + 2]!);
    maxY = Math.max(maxY, vertices[index + 3]!);
  }
  if (maxX <= minX || maxY <= minY)
    fail("degenerate", "Text warp geometry collapses to zero area.");
  const frame = options.destinationFrame;
  if (
    frame &&
    (!Number.isSafeInteger(frame.left) ||
      !Number.isSafeInteger(frame.top) ||
      !Number.isSafeInteger(frame.width) ||
      !Number.isSafeInteger(frame.height) ||
      frame.width < 1 ||
      frame.height < 1 ||
      Math.abs(frame.left) > TEXT_WARP_MESH_LIMITS.coordinateMagnitude ||
      Math.abs(frame.top) > TEXT_WARP_MESH_LIMITS.coordinateMagnitude)
  )
    fail(
      "invalid",
      "Text warp common destination frame must have bounded integer dimensions/origin.",
    );
  if (
    frame &&
    (frame.left > minX ||
      frame.top > minY ||
      frame.left + frame.width < maxX ||
      frame.top + frame.height < maxY)
  )
    fail("invalid", "Text warp common destination frame must contain the mesh without clipping.");
  const left = frame?.left ?? Math.floor(minX),
    top = frame?.top ?? Math.floor(minY),
    width = frame?.width ?? Math.ceil(maxX) - left,
    height = frame?.height ?? Math.ceil(maxY) - top;
  if (
    width > budget.maxDestinationSide ||
    height > budget.maxDestinationSide ||
    width * height > budget.maxDestinationPixels
  )
    fail("budget", "Text warp destination exceeds its settled raster side/pixel budget.");
  const triangleCount = (xs.length - 1) * (ys.length - 1) * 2;
  allocate(triangleCount * 6);
  const triangles = new Uint16Array(triangleCount * 3);
  let cursor = 0;
  for (let iy = 0; iy < ys.length - 1; iy++)
    for (let ix = 0; ix < xs.length - 1; ix++) {
      const a = iy * xs.length + ix,
        b = a + 1,
        d = a + xs.length,
        c = d + 1;
      triangles[cursor++] = a;
      triangles[cursor++] = b;
      triangles[cursor++] = c;
      triangles[cursor++] = a;
      triangles[cursor++] = c;
      triangles[cursor++] = d;
    }
  const numericBytes = vertices.byteLength + triangles.byteLength;
  checkBytes(allocatedBytes + width * height, budget);
  let rasterCandidatePixels = 0,
    rasterScanlines = 0,
    degenerateTriangleCount = 0;
  // The same local-coordinate scanline formula is used in preflight and rendering.
  const t = emptyTriangle(),
    span = { first: 0, last: 0 };
  for (let index = 0; index < triangles.length; index += 3) {
    work += TRIANGLE_WORK;
    checkWork(work, budget);
    if (!triangleGeometry(vertices, triangles, index, left, top, t)) {
      degenerateTriangleCount++;
      continue;
    }
    const firstY = Math.max(0, Math.ceil(Math.min(t.ay, t.by, t.cy) - 0.5)),
      lastY = Math.min(height - 1, Math.floor(Math.max(t.ay, t.by, t.cy) - 0.5));
    for (let y = firstY; y <= lastY; y++) {
      work += SCANLINE_WORK;
      rasterScanlines++;
      if (triangleSpan(t, y + 0.5, width, span))
        rasterCandidatePixels += span.last - span.first + 1;
      checkWork(
        work +
          rasterCandidatePixels * PIXEL_WORK +
          rasterScanlines * SCANLINE_WORK +
          triangleCount * TRIANGLE_WORK +
          width * height,
        budget,
      );
    }
  }
  if (degenerateTriangleCount === triangleCount)
    fail("degenerate", "Text warp has no non-degenerate destination triangle.");
  const rasterWork =
    rasterCandidatePixels * PIXEL_WORK +
    rasterScanlines * SCANLINE_WORK +
    triangleCount * TRIANGLE_WORK +
    width * height;
  checkWork(work + rasterWork, budget);
  const mesh: TextWarpMesh = Object.freeze({
    sourceRect,
    destination: Object.freeze({ left, top, width, height }),
    vertexCount: vertices.length / 4,
    triangleCount,
    degenerateTriangleCount,
    toleranceRasterPx: options.toleranceRasterPx,
    maximumSampledErrorRasterPx: maximumSampledError,
    accuracyScope: "edge-midpoints-diagonal-and-interior-probes",
    proof: Object.freeze({
      numericBytes,
      preparationAllocatedNumericBytes: allocatedBytes,
      preparationPeakBytes: allocatedBytes + budget.reservedBytes + budget.sourceBytes,
      reservedSourceBytes: budget.sourceBytes,
      outputBytes: width * height,
      plannedRasterBytesWithoutSource: allocatedBytes + width * height + budget.reservedBytes,
      mappingEvaluations,
      preparationWork: work,
      rasterCandidatePixels,
      rasterScanlines,
      rasterWork,
      totalWork: work + rasterWork,
      reservedBytes: budget.reservedBytes,
    }),
  });
  prepared.set(mesh, { vertices, triangles, budget });
  return mesh;
}

type Triangle = {
  a: number;
  b: number;
  c: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  area: number;
};
function emptyTriangle(): Triangle {
  return { a: 0, b: 0, c: 0, ax: 0, ay: 0, bx: 0, by: 0, cx: 0, cy: 0, area: 0 };
}
function triangleGeometry(
  vertices: Float64Array,
  triangles: Uint16Array,
  index: number,
  left: number,
  top: number,
  target: Triangle,
): boolean {
  const a = triangles[index]!,
    b = triangles[index + 1]!,
    c = triangles[index + 2]!,
    ax = vertices[a * 4 + 2]! - left,
    ay = vertices[a * 4 + 3]! - top,
    bx = vertices[b * 4 + 2]! - left,
    by = vertices[b * 4 + 3]! - top,
    cx = vertices[c * 4 + 2]! - left,
    cy = vertices[c * 4 + 3]! - top,
    area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) <= MIN_TRIANGLE_AREA) return false;
  target.a = a;
  target.b = area > 0 ? b : c;
  target.c = area > 0 ? c : b;
  target.ax = ax;
  target.ay = ay;
  target.bx = area > 0 ? bx : cx;
  target.by = area > 0 ? by : cy;
  target.cx = area > 0 ? cx : bx;
  target.cy = area > 0 ? cy : by;
  target.area = Math.abs(area);
  return true;
}
function triangleSpan(
  t: Triangle,
  y: number,
  width: number,
  target: { first: number; last: number },
): boolean {
  let min = Infinity,
    max = -Infinity;
  for (let edge = 0; edge < 3; edge++) {
    const ax = edge === 0 ? t.ax : edge === 1 ? t.bx : t.cx,
      ay = edge === 0 ? t.ay : edge === 1 ? t.by : t.cy,
      bx = edge === 0 ? t.bx : edge === 1 ? t.cx : t.ax,
      by = edge === 0 ? t.by : edge === 1 ? t.cy : t.ay;
    if (y < Math.min(ay, by) || y > Math.max(ay, by)) continue;
    if (ay === by) {
      min = Math.min(min, ax, bx);
      max = Math.max(max, ax, bx);
    } else {
      const x = ax + ((y - ay) / (by - ay)) * (bx - ax);
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  }
  if (min === Infinity) return false;
  // One guard pixel at each side covers intersection rounding; exact edges decide ownership.
  target.first = Math.max(0, Math.ceil(min - 0.5) - 1);
  target.last = Math.min(width - 1, Math.floor(max - 0.5) + 1);
  return target.last >= target.first;
}
type Edge = { x: number; y: number; c: number; sign: number; inclusive: boolean };
function triangleEdge(
  a: number,
  ax: number,
  ay: number,
  b: number,
  bx: number,
  by: number,
  target: Edge,
) {
  // Canonical vertex order makes shared-edge expressions bit-identical, with opposite signs.
  const forward = a < b,
    x0 = forward ? ax : bx,
    y0 = forward ? ay : by,
    x1 = forward ? bx : ax,
    y1 = forward ? by : ay;
  target.x = y0 - y1;
  target.y = x1 - x0;
  target.c = x0 * y1 - y0 * x1;
  target.sign = forward ? 1 : -1;
  target.inclusive = by < ay || (by === ay && bx > ax);
}
function edgeValue(edge: Edge, x: number, y: number) {
  return edge.sign * (edge.x * x + edge.y * y + edge.c);
}
function onOwnedSide(value: number, edge: Edge) {
  return value > 0 || (value === 0 && edge.inclusive);
}

/** Inverse barycentric texture lookup, bilinear alpha, and source-over foldovers in
 * deterministic source rectangle/triangle order. A top-left shared-edge rule avoids
 * double alpha and cracks. Pixels sample at centers; alpha outside source is transparent.
 * No source extraction, straight-text fallback, density retry, DOM, or Canvas is used.
 */
export function rasterizeTextWarpAlpha(
  options: Readonly<{
    mesh: TextWarpMesh;
    source: TextWarpAlphaSource;
    budget?: TextWarpMeshBudget;
  }>,
): TextWarpAlphaRaster {
  const storage = prepared.get(options.mesh);
  if (!storage) fail("invalid", "Text warp rasterization requires an admitted mesh plan.");
  const budget = budgetOf({ ...storage.budget, ...options.budget }),
    source = options.source,
    channels = source?.format === "rgba" ? 4 : 1;
  if (
    !source ||
    (source.format !== undefined && source.format !== "alpha" && source.format !== "rgba") ||
    !Number.isSafeInteger(source.width) ||
    !Number.isSafeInteger(source.height) ||
    source.width < 1 ||
    source.height < 1 ||
    source.width > TEXT_WARP_MESH_LIMITS.destinationSide ||
    source.height > TEXT_WARP_MESH_LIMITS.destinationSide ||
    source.width * source.height > TEXT_WARP_MESH_LIMITS.destinationPixels ||
    !(source.data instanceof Uint8ClampedArray) ||
    source.data.length !== source.width * source.height * channels
  )
    fail("invalid", "Text warp requires an exact-length bounded native alpha/RGBA source.");
  const mesh = options.mesh,
    { vertices, triangles } = storage,
    { left, top, width, height } = mesh.destination,
    numericBytes = mesh.proof.numericBytes,
    outputBytes = width * height,
    sourceBytes = Math.max(budget.sourceBytes, source.data.buffer.byteLength),
    peakBytes =
      mesh.proof.preparationAllocatedNumericBytes +
      sourceBytes +
      outputBytes +
      budget.reservedBytes;
  if (
    mesh.vertexCount > budget.maxVertices ||
    mesh.triangleCount > budget.maxTriangles ||
    width > budget.maxDestinationSide ||
    height > budget.maxDestinationSide ||
    outputBytes > budget.maxDestinationPixels
  )
    fail("budget", "Text warp rasterization exceeds its mesh/destination budget.");
  if (peakBytes > budget.maxBytes)
    fail("budget", "Text warp exceeds its aggregate live-byte budget.");
  checkWork(mesh.proof.totalWork, budget);
  const data = new Uint8ClampedArray(outputBytes),
    rect = mesh.sourceRect,
    alphaOffset = channels - 1;
  const tap = (x: number, y: number) =>
    x < 0 || y < 0 || x >= source.width || y >= source.height
      ? 0
      : source.data[(y * source.width + x) * channels + alphaOffset]!;
  const sample = (x: number, y: number) => {
    const px = ((x - rect.left) / rect.width) * source.width - 0.5,
      py = ((y - rect.top) / rect.height) * source.height - 0.5,
      ix = Math.floor(px),
      iy = Math.floor(py),
      fx = px - ix,
      fy = py - iy;
    return (
      (tap(ix, iy) * (1 - fx) + tap(ix + 1, iy) * fx) * (1 - fy) +
      (tap(ix, iy + 1) * (1 - fx) + tap(ix + 1, iy + 1) * fx) * fy
    );
  };
  const t = emptyTriangle(),
    span = { first: 0, last: 0 },
    ab: Edge = { x: 0, y: 0, c: 0, sign: 1, inclusive: false },
    bc: Edge = { ...ab },
    ca: Edge = { ...ab };
  for (let index = 0; index < triangles.length; index += 3) {
    if (!triangleGeometry(vertices, triangles, index, left, top, t)) continue;
    triangleEdge(t.a, t.ax, t.ay, t.b, t.bx, t.by, ab);
    triangleEdge(t.b, t.bx, t.by, t.c, t.cx, t.cy, bc);
    triangleEdge(t.c, t.cx, t.cy, t.a, t.ax, t.ay, ca);
    const firstY = Math.max(0, Math.ceil(Math.min(t.ay, t.by, t.cy) - 0.5)),
      lastY = Math.min(height - 1, Math.floor(Math.max(t.ay, t.by, t.cy) - 0.5));
    for (let y = firstY; y <= lastY; y++) {
      const py = y + 0.5;
      if (!triangleSpan(t, py, width, span)) continue;
      for (let x = span.first; x <= span.last; x++) {
        const px = x + 0.5,
          eAB = edgeValue(ab, px, py),
          eBC = edgeValue(bc, px, py),
          eCA = edgeValue(ca, px, py);
        if (!onOwnedSide(eAB, ab) || !onOwnedSide(eBC, bc) || !onOwnedSide(eCA, ca)) continue;
        // Normalize the shared-edge expressions themselves, avoiding a second area evaluation.
        const area = eAB + eBC + eCA,
          wa = eBC / area,
          wb = eCA / area,
          wc = eAB / area,
          sx = vertices[t.a * 4]! * wa + vertices[t.b * 4]! * wb + vertices[t.c * 4]! * wc,
          sy =
            vertices[t.a * 4 + 1]! * wa + vertices[t.b * 4 + 1]! * wb + vertices[t.c * 4 + 1]! * wc,
          alpha = sample(sx, sy),
          output = y * width + x;
        data[output] = alpha + data[output]! * (1 - alpha / 255);
      }
    }
  }
  return Object.freeze({
    left,
    top,
    width,
    height,
    data,
    proof: Object.freeze({
      numericBytes,
      sourceBytes,
      outputBytes,
      reservedBytes: budget.reservedBytes,
      peakBytes,
      totalWork: mesh.proof.totalWork,
    }),
  });
}
