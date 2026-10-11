/** Pure output-pixel geometry. This never changes the durable 2D picture frame.
 *
 * The isolated WPS observations establish X as yaw, Y as pitch, and positive Z
 * as screen-counterclockwise. Mixed-axis order, camera calibration, oblique
 * shears, ground distance, and extrusion are explicitly PRODUCT geometry:
 * local-normal ground translation, then yaw X, pitch Y, screen-CCW Z. The
 * perspective focal distance is 2 * max(frame dimensions) / tan(angle / 2).
 * This is not a claim of WPS composite-camera or focal-length equivalence.
 *
 * Coordinates use x right, y down, z toward the viewer. The source front plane
 * is z=0, centered before rotation; extrusion extends toward local negative z.
 * All lengths, including ground distance and depth, are resolved pixels supplied
 * by the caller. Materials, lighting, paint, clipping and Canvas are not owned here.
 */

export type PictureProjectivePoint = Readonly<{ x: number; y: number }>;
export type PictureProjectiveVector = Readonly<{ x: number; y: number; z: number }>;
export type PictureProjectiveBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;
/** Row-major matrices multiplying column vectors. */
export type PictureProjectiveMatrix4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
/** Row-major 3x3 source-pixel-to-screen-pixel homography. */
export type PictureProjectiveHomography = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
type PictureProjectiveRotationParameters = {
  xDeg: number;
  yDeg: number;
  zDeg: number;
  /** Local +z translation BEFORE rotations; it does not move the selection frame. */
  distanceFromGroundPx: number;
};
export type PictureProjectiveRotation = PictureProjectiveRotationParameters &
  (
    | { projection: "parallel" }
    | { projection: "perspective"; perspectiveDeg: number }
    | { projection: "oblique"; shearX: number; shearY: number }
  );
export type PictureProjectiveGeometryInput = {
  widthPx: number;
  heightPx: number;
  depthPx?: number;
  rotation: PictureProjectiveRotation;
};
export type PictureProjectiveFacing = "front" | "back" | "edge-on";
export type PictureProjectiveFaceKind = "front" | "back" | "top" | "right" | "bottom" | "left";
export type PictureProjectiveQuad = readonly [
  PictureProjectivePoint,
  PictureProjectivePoint,
  PictureProjectivePoint,
  PictureProjectivePoint,
];
export type PictureProjectiveFace = Readonly<{
  kind: PictureProjectiveFaceKind;
  /** Front/back use TL, TR, BR, BL source order; side quads follow outward normals. */
  corners: PictureProjectiveQuad;
  normal: PictureProjectiveVector;
  centerWorld: PictureProjectiveVector;
  facing: PictureProjectiveFacing;
  /** Larger is nearer. Deterministic mean-depth order, not an occlusion algorithm. */
  averageDepth: number;
}>;
export type PictureProjectivePlane = PictureProjectiveFace &
  Readonly<{
    homography: PictureProjectiveHomography;
    /** An edge-on/singular plane has no inverse or texture/hit sampling. */
    inverseHomography: PictureProjectiveHomography | null;
  }>;
export type PictureProjectiveGeometry = Readonly<{
  widthPx: number;
  heightPx: number;
  depthPx: number;
  selectionBounds: PictureProjectiveBounds;
  /** Paint/culling bounds only, including extrusion. Never selection bounds. */
  visualBounds: PictureProjectiveBounds;
  sourceToWorldMatrix: PictureProjectiveMatrix4;
  /** Actual 4x4 homogeneous projection; screen x/y require division by w. */
  sourceToScreenMatrix: PictureProjectiveMatrix4;
  front: PictureProjectivePlane;
  back: PictureProjectivePlane | null;
  sides: readonly PictureProjectiveFace[];
  /** Visible convex-solid faces, far-to-near. Opaque depth geometry only. */
  visibleFaces: readonly PictureProjectiveFace[];
}>;

export const PICTURE_PROJECTIVE_LIMITS = Object.freeze({
  dimensionPx: 65_536,
  coordinatePx: 10_000_000,
  minDimensionPx: 1e-6,
  nearPlaneW: 1 / 1024,
  degeneracy: 1e-10,
  triangles: 8192,
  subdivisions: 64,
  minMeshErrorPx: 1e-4,
});
export type PictureProjectiveFailure =
  | "invalid-input"
  | "near-plane"
  | "degenerate"
  | "coordinate-budget"
  | "mesh-budget";
/** Callers can safely block unsupported rendering instead of silently using affine geometry. */
export class PictureProjectiveGeometryError extends RangeError {
  readonly reason: PictureProjectiveFailure;
  constructor(reason: PictureProjectiveFailure, message: string) {
    super(message);
    this.name = "PictureProjectiveGeometryError";
    this.reason = reason;
  }
}

function fail(reason: PictureProjectiveFailure, message: string): never {
  throw new PictureProjectiveGeometryError(reason, message);
}
function bounded(value: number, min: number, max: number, name: string): void {
  if (!Number.isFinite(value) || value < min || value > max)
    fail("invalid-input", `Picture projective ${name} must be finite and within [${min}, ${max}].`);
}
function point(x: number, y: number): PictureProjectivePoint {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    Math.abs(x) > PICTURE_PROJECTIVE_LIMITS.coordinatePx ||
    Math.abs(y) > PICTURE_PROJECTIVE_LIMITS.coordinatePx
  )
    fail("coordinate-budget", "Picture projective screen coordinate budget exceeded.");
  return Object.freeze({ x, y });
}
function vector(x: number, y: number, z: number): PictureProjectiveVector {
  return Object.freeze({ x, y, z });
}
function matrix4(values: number[]): PictureProjectiveMatrix4 {
  if (values.length !== 16 || values.some((entry) => !Number.isFinite(entry)))
    fail("invalid-input", "Picture projective matrix must have 16 finite entries.");
  return Object.freeze(values) as unknown as PictureProjectiveMatrix4;
}
function multiply4(
  left: PictureProjectiveMatrix4,
  right: PictureProjectiveMatrix4,
): PictureProjectiveMatrix4 {
  const result = Array.from({ length: 16 }, () => 0);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      let value = 0;
      for (let entry = 0; entry < 4; entry++)
        value += left[row * 4 + entry]! * right[entry * 4 + column]!;
      result[row * 4 + column] = value;
    }
  }
  return matrix4(result);
}
function transformWorld(
  matrix: PictureProjectiveMatrix4,
  x: number,
  y: number,
  z: number,
): PictureProjectiveVector {
  return vector(
    matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
    matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
    matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
  );
}
function transformNormal(
  rotation: PictureProjectiveMatrix4,
  x: number,
  y: number,
  z: number,
): PictureProjectiveVector {
  return vector(
    rotation[0] * x + rotation[1] * y + rotation[2] * z,
    rotation[4] * x + rotation[5] * y + rotation[6] * z,
    rotation[8] * x + rotation[9] * y + rotation[10] * z,
  );
}
function homography(matrix: PictureProjectiveMatrix4, z: number): PictureProjectiveHomography {
  return Object.freeze([
    matrix[0],
    matrix[1],
    matrix[2] * z + matrix[3],
    matrix[4],
    matrix[5],
    matrix[6] * z + matrix[7],
    matrix[12],
    matrix[13],
    matrix[14] * z + matrix[15],
  ]) as PictureProjectiveHomography;
}
function inverseHomography(
  matrix: PictureProjectiveHomography,
  determinant: number,
): PictureProjectiveHomography | null {
  if (Math.abs(determinant) <= PICTURE_PROJECTIVE_LIMITS.degeneracy) return null;
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const inverse = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ].map((entry) => entry / determinant);
  if (inverse.some((entry) => !Number.isFinite(entry)))
    fail("degenerate", "Picture projective inverse is not finite.");
  return Object.freeze(inverse) as unknown as PictureProjectiveHomography;
}
function denominator(matrix: PictureProjectiveHomography, x: number, y: number): number {
  return matrix[6] * x + matrix[7] * y + matrix[8];
}
function project(
  matrix: PictureProjectiveHomography,
  x: number,
  y: number,
): PictureProjectivePoint {
  const w = denominator(matrix, x, y);
  if (!Number.isFinite(w) || w <= PICTURE_PROJECTIVE_LIMITS.nearPlaneW)
    fail("near-plane", "Picture projective plane crosses or approaches the camera near plane.");
  return point(
    (matrix[0] * x + matrix[1] * y + matrix[2]) / w,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / w,
  );
}
function facing(value: number): PictureProjectiveFacing {
  return Math.abs(value) <= PICTURE_PROJECTIVE_LIMITS.degeneracy
    ? "edge-on"
    : value > 0
      ? "front"
      : "back";
}
function bounds(
  points: readonly PictureProjectivePoint[],
  allowCollapsed = false,
): PictureProjectiveBounds {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const entry of points) {
    left = Math.min(left, entry.x);
    top = Math.min(top, entry.y);
    right = Math.max(right, entry.x);
    bottom = Math.max(bottom, entry.y);
  }
  if (
    !allowCollapsed &&
    (right - left < PICTURE_PROJECTIVE_LIMITS.minDimensionPx ||
      bottom - top < PICTURE_PROJECTIVE_LIMITS.minDimensionPx)
  )
    fail("degenerate", "Picture projective solid has no drawable two-dimensional bounds.");
  return Object.freeze({ left, top, right, bottom });
}

/** Creates a convex projected rectangle/box, with no implicit near-plane clipping.
 * All front/back corners must be in front of the guarded camera plane. Because
 * w is linear, this guards every point of the solid, not just the samples.
 */
export function createPictureProjectiveGeometry(
  input: PictureProjectiveGeometryInput,
): PictureProjectiveGeometry {
  const { widthPx: width, heightPx: height, rotation: values } = input;
  const depth = input.depthPx ?? 0;
  bounded(
    width,
    PICTURE_PROJECTIVE_LIMITS.minDimensionPx,
    PICTURE_PROJECTIVE_LIMITS.dimensionPx,
    "width",
  );
  bounded(
    height,
    PICTURE_PROJECTIVE_LIMITS.minDimensionPx,
    PICTURE_PROJECTIVE_LIMITS.dimensionPx,
    "height",
  );
  bounded(depth, 0, PICTURE_PROJECTIVE_LIMITS.dimensionPx, "depth");
  for (const [name, value] of [
    ["X rotation", values.xDeg],
    ["Y rotation", values.yDeg],
    ["Z rotation", values.zDeg],
  ] as const)
    bounded(value, -3600, 3600, name);
  bounded(
    values.distanceFromGroundPx,
    -PICTURE_PROJECTIVE_LIMITS.dimensionPx,
    PICTURE_PROJECTIVE_LIMITS.dimensionPx,
    "ground distance",
  );
  let perspective = 0,
    shearX = 0,
    shearY = 0;
  if (values.projection === "perspective") {
    bounded(values.perspectiveDeg, 0, 120, "perspective angle");
    perspective = Math.tan((values.perspectiveDeg * Math.PI) / 360) / (2 * Math.max(width, height));
  } else if (values.projection === "oblique") {
    bounded(values.shearX, -16, 16, "oblique X shear");
    bounded(values.shearY, -16, 16, "oblique Y shear");
    shearX = values.shearX;
    shearY = values.shearY;
  } else if (values.projection !== "parallel") {
    fail("invalid-input", "Unknown picture projective projection.");
  }
  const x = (values.xDeg * Math.PI) / 180,
    y = (values.yDeg * Math.PI) / 180,
    z = (values.zDeg * Math.PI) / 180;
  const cx = Math.cos(x),
    sx = Math.sin(x),
    cy = Math.cos(y),
    sy = Math.sin(y),
    cz = Math.cos(z),
    sz = Math.sin(z);
  const yaw = matrix4([cx, 0, -sx, 0, 0, 1, 0, 0, sx, 0, cx, 0, 0, 0, 0, 1]);
  const pitch = matrix4([1, 0, 0, 0, 0, cy, sy, 0, 0, -sy, cy, 0, 0, 0, 0, 1]);
  const counterclockwise = matrix4([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const rotation = multiply4(counterclockwise, multiply4(pitch, yaw));
  const model = multiply4(
    rotation,
    matrix4([
      1,
      0,
      0,
      -width / 2,
      0,
      1,
      0,
      -height / 2,
      0,
      0,
      1,
      values.distanceFromGroundPx,
      0,
      0,
      0,
      1,
    ]),
  );
  const projection = matrix4([
    1,
    0,
    shearX - (width / 2) * perspective,
    width / 2,
    0,
    1,
    shearY - (height / 2) * perspective,
    height / 2,
    0,
    0,
    1,
    0,
    0,
    0,
    -perspective,
    1,
  ]);
  const screen = multiply4(projection, model);
  const frontHomography = homography(screen, 0);
  const backHomography = homography(screen, -depth);
  const source = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ] as const;
  const frontCorners = Object.freeze(
    source.map(([px, py]) => project(frontHomography, px, py)),
  ) as unknown as PictureProjectiveQuad;
  const backCorners = Object.freeze(
    source.map(([px, py]) => project(backHomography, px, py)),
  ) as unknown as PictureProjectiveQuad;
  const frontWorld = source.map(([px, py]) => transformWorld(model, px, py, 0));
  const backWorld = source.map(([px, py]) => transformWorld(model, px, py, -depth));
  const viewLength = Math.hypot(shearX, shearY, 1);
  const face = (
    kind: PictureProjectiveFaceKind,
    corners: PictureProjectiveQuad,
    world: readonly PictureProjectiveVector[],
    normal: PictureProjectiveVector,
  ): PictureProjectiveFace => {
    const center = vector(
      world.reduce((sum, entry) => sum + entry.x, 0) / 4,
      world.reduce((sum, entry) => sum + entry.y, 0) / 4,
      world.reduce((sum, entry) => sum + entry.z, 0) / 4,
    );
    const visibility =
      perspective > 0
        ? normal.z - perspective * (normal.x * center.x + normal.y * center.y + normal.z * center.z)
        : normal.z - shearX * normal.x - shearY * normal.y;
    return Object.freeze({
      kind,
      corners,
      normal,
      centerWorld: center,
      facing: facing(visibility),
      averageDepth: (center.z - shearX * center.x - shearY * center.y) / viewLength,
    });
  };
  const frontNormal = transformNormal(rotation, 0, 0, 1);
  // The analytic determinant avoids subtracting large translated screen terms.
  const frontDeterminant =
    perspective > 0
      ? frontNormal.z - perspective * values.distanceFromGroundPx
      : frontNormal.z - shearX * frontNormal.x - shearY * frontNormal.y;
  const front: PictureProjectivePlane = Object.freeze({
    ...face("front", frontCorners, frontWorld, frontNormal),
    homography: frontHomography,
    inverseHomography: inverseHomography(frontHomography, frontDeterminant),
  });
  // A zero-depth plane viewed exactly edge-on legitimately has no painted area.
  // Keep its durable selection frame; hit/texture consumers use the null inverse.
  let back: PictureProjectivePlane | null = null;
  const sides: PictureProjectiveFace[] = [];
  if (depth > 0) {
    const backDeterminant =
      perspective > 0
        ? frontNormal.z - perspective * (values.distanceFromGroundPx - depth)
        : frontDeterminant;
    back = Object.freeze({
      ...face("back", backCorners, backWorld, transformNormal(rotation, 0, 0, -1)),
      homography: backHomography,
      inverseHomography: inverseHomography(backHomography, backDeterminant),
    });
    const side = (
      kind: PictureProjectiveFaceKind,
      first: number,
      second: number,
      nx: number,
      ny: number,
    ): void => {
      sides.push(
        face(
          kind,
          Object.freeze([
            frontCorners[first]!,
            backCorners[first]!,
            backCorners[second]!,
            frontCorners[second]!,
          ] as const),
          [frontWorld[first]!, backWorld[first]!, backWorld[second]!, frontWorld[second]!],
          transformNormal(rotation, nx, ny, 0),
        ),
      );
    };
    side("top", 0, 1, 0, -1);
    side("right", 1, 2, 1, 0);
    side("bottom", 2, 3, 0, 1);
    side("left", 3, 0, -1, 0);
  }
  const visibleFaces = [front, ...(back ? [back] : []), ...sides]
    .filter((entry) => entry.facing === "front")
    .sort((left, right) => left.averageDepth - right.averageDepth);
  return Object.freeze({
    widthPx: width,
    heightPx: height,
    depthPx: depth,
    selectionBounds: Object.freeze({ left: 0, top: 0, right: width, bottom: height }),
    visualBounds: bounds(
      depth > 0 ? [...frontCorners, ...backCorners] : frontCorners,
      depth === 0 && !front.inverseHomography,
    ),
    sourceToWorldMatrix: model,
    sourceToScreenMatrix: screen,
    front,
    back,
    sides: Object.freeze(sides),
    visibleFaces: Object.freeze(visibleFaces),
  });
}

/** Exact front-plane mapping, including perspective division. */
export function mapPictureProjectivePoint(
  geometry: PictureProjectiveGeometry,
  source: PictureProjectivePoint,
): PictureProjectivePoint {
  bounded(
    source.x,
    -PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    "source X",
  );
  bounded(
    source.y,
    -PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    "source Y",
  );
  return project(geometry.front.homography, source.x, source.y);
}
export type PictureProjectiveHit = Readonly<{ x: number; y: number; u: number; v: number }>;
/** Exact inverse texture/hit coordinates. Back/edge-on fronts never falsely hit.
 * This is appearance hit-testing only; it does not replace the 2D selection box.
 */
export function hitPictureProjectiveFront(
  geometry: PictureProjectiveGeometry,
  screen: PictureProjectivePoint,
): PictureProjectiveHit | null {
  bounded(
    screen.x,
    -PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    "hit X",
  );
  bounded(
    screen.y,
    -PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    "hit Y",
  );
  const inverse = geometry.front.inverseHomography;
  if (!inverse || geometry.front.facing !== "front") return null;
  const w = denominator(inverse, screen.x, screen.y);
  if (!Number.isFinite(w) || w < 1e-12) return null;
  const x = (inverse[0] * screen.x + inverse[1] * screen.y + inverse[2]) / w;
  const y = (inverse[3] * screen.x + inverse[4] * screen.y + inverse[5]) / w;
  // Roundoff at projected boundary vertices must not create gaps in hit coverage.
  const epsilon =
    64 *
    Number.EPSILON *
    Math.max(1, geometry.widthPx, geometry.heightPx, Math.abs(screen.x), Math.abs(screen.y));
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < -epsilon ||
    y < -epsilon ||
    x > geometry.widthPx + epsilon ||
    y > geometry.heightPx + epsilon
  )
    return null;
  const px = Math.min(geometry.widthPx, Math.max(0, x));
  const py = Math.min(geometry.heightPx, Math.max(0, y));
  return Object.freeze({ x: px, y: py, u: px / geometry.widthPx, v: py / geometry.heightPx });
}

export type PictureProjectiveMeshVertex = Readonly<{
  source: PictureProjectivePoint;
  screen: PictureProjectivePoint;
  w: number;
}>;
export type PictureProjectiveAffine = Readonly<{
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}>;
export type PictureProjectiveMeshTriangle = Readonly<{
  vertices: readonly [
    PictureProjectiveMeshVertex,
    PictureProjectiveMeshVertex,
    PictureProjectiveMeshVertex,
  ];
  sourceToScreenAffine: PictureProjectiveAffine;
  errorBoundPx: number;
}>;
export type PictureProjectiveMesh = Readonly<{
  vertices: readonly PictureProjectiveMeshVertex[];
  triangles: readonly PictureProjectiveMeshTriangle[];
  subdivisions: number;
  maxErrorPx: number;
}>;
export type PictureProjectiveMeshOptions = { maxErrorPx?: number; maxTriangles?: number };

/** For barycentric weights l_i, the rational/affine difference is
 * sum(i<j) l_i*l_j*(w_i-w_j)*(q_i-q_j) / sum(l_i*w_i).
 * Since sum(i<j) l_i*l_j <= 1/3, the expression below bounds EVERY
 * point of the triangle, not merely a midpoint sample.
 */
function triangleError(
  a: PictureProjectiveMeshVertex,
  b: PictureProjectiveMeshVertex,
  c: PictureProjectiveMeshVertex,
): number {
  const pair = (left: PictureProjectiveMeshVertex, right: PictureProjectiveMeshVertex): number =>
    Math.abs(left.w - right.w) *
    Math.hypot(left.screen.x - right.screen.x, left.screen.y - right.screen.y);
  return Math.max(pair(a, b), pair(b, c), pair(c, a)) / (3 * Math.min(a.w, b.w, c.w));
}
function triangleAffine(
  a: PictureProjectiveMeshVertex,
  b: PictureProjectiveMeshVertex,
  c: PictureProjectiveMeshVertex,
): PictureProjectiveAffine {
  const sx1 = b.source.x - a.source.x,
    sy1 = b.source.y - a.source.y;
  const sx2 = c.source.x - a.source.x,
    sy2 = c.source.y - a.source.y;
  const determinant = sx1 * sy2 - sx2 * sy1;
  if (!Number.isFinite(determinant) || determinant === 0)
    fail("degenerate", "Picture projective mesh source triangle is singular.");
  const dx1 = b.screen.x - a.screen.x,
    dy1 = b.screen.y - a.screen.y;
  const dx2 = c.screen.x - a.screen.x,
    dy2 = c.screen.y - a.screen.y;
  const aa = (dx1 * sy2 - dx2 * sy1) / determinant;
  const bb = (dy1 * sy2 - dy2 * sy1) / determinant;
  const cc = (dx2 * sx1 - dx1 * sx2) / determinant;
  const dd = (dy2 * sx1 - dy1 * sx2) / determinant;
  const ee = a.screen.x - aa * a.source.x - cc * a.source.y;
  const ff = a.screen.y - bb * a.source.x - dd * a.source.y;
  if (![aa, bb, cc, dd, ee, ff].every(Number.isFinite))
    fail("degenerate", "Picture projective triangle affine is not finite.");
  return Object.freeze({ a: aa, b: bb, c: cc, d: dd, e: ee, f: ff });
}

/** A crack-free regular source grid for Canvas triangle clipping/drawImage.
 * Affine triangles approximate the REAL homography with a proved pixel error.
 * Subdivision has at most 64x64 cells, 4225 vertices and 8192 triangles. An
 * insufficient budget throws; it never returns an unchecked coarse fallback.
 * These bounds cover geometric interpolation only, not filtering/clip seams.
 */
export function tessellatePictureProjectiveFront(
  geometry: PictureProjectiveGeometry,
  options: PictureProjectiveMeshOptions = {},
): PictureProjectiveMesh {
  const tolerance = options.maxErrorPx ?? 0.25;
  const budget = options.maxTriangles ?? PICTURE_PROJECTIVE_LIMITS.triangles;
  bounded(tolerance, PICTURE_PROJECTIVE_LIMITS.minMeshErrorPx, 64, "mesh error");
  bounded(budget, 2, PICTURE_PROJECTIVE_LIMITS.triangles, "triangle budget");
  if (!Number.isInteger(budget))
    fail("invalid-input", "Picture projective triangle budget must be an integer.");
  if (!geometry.front.inverseHomography)
    fail("degenerate", "An edge-on picture front cannot be texture-tessellated.");
  const maximum = Math.min(
    PICTURE_PROJECTIVE_LIMITS.subdivisions,
    Math.floor(Math.sqrt(budget / 2)),
  );
  let subdivisions = 1;
  for (;;) {
    const stride = subdivisions + 1;
    const vertices: PictureProjectiveMeshVertex[] = [];
    for (let row = 0; row <= subdivisions; row++) {
      for (let column = 0; column <= subdivisions; column++) {
        const source = point(
          (column / subdivisions) * geometry.widthPx,
          (row / subdivisions) * geometry.heightPx,
        );
        vertices.push(
          Object.freeze({
            source,
            screen: project(geometry.front.homography, source.x, source.y),
            w: denominator(geometry.front.homography, source.x, source.y),
          }),
        );
      }
    }
    let maximumError = 0;
    for (let row = 0; row < subdivisions; row++) {
      for (let column = 0; column < subdivisions; column++) {
        const first = row * stride + column;
        const a = vertices[first]!,
          b = vertices[first + 1]!,
          c = vertices[first + stride + 1]!,
          d = vertices[first + stride]!;
        maximumError = Math.max(maximumError, triangleError(a, b, c), triangleError(a, c, d));
      }
    }
    if (maximumError <= tolerance) {
      const triangles: PictureProjectiveMeshTriangle[] = [];
      const append = (
        a: PictureProjectiveMeshVertex,
        b: PictureProjectiveMeshVertex,
        c: PictureProjectiveMeshVertex,
      ): void => {
        triangles.push(
          Object.freeze({
            vertices: Object.freeze([a, b, c] as const),
            sourceToScreenAffine: triangleAffine(a, b, c),
            errorBoundPx: triangleError(a, b, c),
          }),
        );
      };
      for (let row = 0; row < subdivisions; row++) {
        for (let column = 0; column < subdivisions; column++) {
          const first = row * stride + column;
          const a = vertices[first]!,
            b = vertices[first + 1]!,
            c = vertices[first + stride + 1]!,
            d = vertices[first + stride]!;
          append(a, b, c);
          append(a, c, d);
        }
      }
      return Object.freeze({
        vertices: Object.freeze(vertices),
        triangles: Object.freeze(triangles),
        subdivisions,
        maxErrorPx: maximumError,
      });
    }
    if (subdivisions === maximum)
      fail(
        "mesh-budget",
        "Picture projective triangle budget cannot satisfy the requested interpolation error.",
      );
    subdivisions = Math.min(maximum, subdivisions * 2);
  }
}
