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
/** Canvas-order affine: x'=a*x+c*y+e, y'=b*x+d*y+f. */
export type PictureProjectiveAffine = Readonly<{
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}>;
/** Transient common camera coordinates, never a replacement for the leaf source frame.
 * sourceToScene includes the COMPLETE affine owner chain, including source flips.
 * The output adapter is independent of physical world/normal transforms. By default
 * it is inverse(sourceToScene), so the existing affine owner placement A can paint
 * the leaf-local output A^-1*S*A and obtain the common scene projection S*A.
 */
export type PictureProjectiveScene = Readonly<{
  widthPx: number;
  heightPx: number;
  /** Common unprojected pivot/principal point; defaults to the scene frame center. */
  pivot?: PictureProjectivePoint;
  sourceToScene: PictureProjectiveAffine;
  sceneToOutput?: PictureProjectiveAffine;
}>;
export type PictureProjectiveGeometryInput = {
  widthPx: number;
  heightPx: number;
  depthPx?: number;
  rotation: PictureProjectiveRotation;
  scene?: PictureProjectiveScene;
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
  /** Transient numerical guard policy; ordinary leaf-camera behavior stays unchanged. */
  isSceneProjection: boolean;
  sourceToSceneMatrix: PictureProjectiveMatrix4;
  sourceToWorldMatrix: PictureProjectiveMatrix4;
  /** Physical inverse-transpose linear map. Normalize after mapping a source normal.
   * Never use the output adapter or the model's affine linear block for lighting.
   */
  sourceNormalToWorldMatrix: PictureProjectiveMatrix4;
  /** Common scene screen coordinates, before the independent output adapter. */
  sourceToSceneScreenMatrix: PictureProjectiveMatrix4;
  sceneToOutputMatrix: PictureProjectiveMatrix4;
  /** Corrects screen winding for physical culling, including reflected placements. */
  projectedOrientation: 1 | -1;
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
  inverseErrorPx: 1 / 1024,
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
function affineMatrix(affine: PictureProjectiveAffine): PictureProjectiveMatrix4 {
  for (const name of ["a", "b", "c", "d", "e", "f"] as const) {
    const value = affine[name];
    bounded(
      value,
      -PICTURE_PROJECTIVE_LIMITS.coordinatePx,
      PICTURE_PROJECTIVE_LIMITS.coordinatePx,
      name,
    );
  }
  return matrix4([
    affine.a,
    affine.c,
    0,
    affine.e,
    affine.b,
    affine.d,
    0,
    affine.f,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  ]);
}
function affineDeterminant(matrix: PictureProjectiveMatrix4): number {
  const determinant = matrix[0] * matrix[5] - matrix[1] * matrix[4];
  if (
    !Number.isFinite(determinant) ||
    Math.abs(determinant) <= PICTURE_PROJECTIVE_LIMITS.degeneracy
  )
    fail("degenerate", "Picture projective scene placement or output adapter is singular.");
  return determinant;
}
function inverseAffineMatrix(
  matrix: PictureProjectiveMatrix4,
  determinant: number,
): PictureProjectiveMatrix4 {
  const a = matrix[5] / determinant,
    b = -matrix[4] / determinant,
    c = -matrix[1] / determinant,
    d = matrix[0] / determinant;
  const inverse = matrix4(
    [
      a,
      c,
      0,
      -a * matrix[3] - c * matrix[7],
      b,
      d,
      0,
      -b * matrix[3] - d * matrix[7],
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    ].map((value) => (value === 0 ? 0 : value)),
  );
  if (inverse.some((value) => Math.abs(value) > PICTURE_PROJECTIVE_LIMITS.coordinatePx))
    fail("coordinate-budget", "Picture projective inverse placement coordinate budget exceeded.");
  return inverse;
}
function normalPlacementMatrix(inverse: PictureProjectiveMatrix4): PictureProjectiveMatrix4 {
  return matrix4([
    inverse[0],
    inverse[4],
    0,
    0,
    inverse[1],
    inverse[5],
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  ]);
}
function placedNormal(
  rotation: PictureProjectiveMatrix4,
  placement: PictureProjectiveMatrix4,
  nx: number,
  ny: number,
): PictureProjectiveVector {
  const normal = transformNormal(placement, nx, ny, 0);
  const length = Math.hypot(normal.x, normal.y);
  return transformNormal(rotation, normal.x / length, normal.y / length, 0);
}
const IDENTITY_MATRIX = matrix4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
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
  scenePlane = false,
): PictureProjectiveHomography | null {
  // A scene's physical camera determinant is guarded before affine adaptation.
  // A small but nonsingular output area must not be mistaken for an edge-on face.
  if (
    scenePlane ? determinant === 0 : Math.abs(determinant) <= PICTURE_PROJECTIVE_LIMITS.degeneracy
  )
    return null;
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
  // Homogeneous coefficients are not coordinates. Bound their representation
  // with a positive projective scale instead of rejecting a valid small map.
  const scale = scenePlane ? Math.max(...inverse.map(Math.abs)) : 1;
  if (scale > PICTURE_PROJECTIVE_LIMITS.coordinatePx)
    return Object.freeze(
      inverse.map((entry) => entry / scale),
    ) as unknown as PictureProjectiveHomography;
  return Object.freeze(inverse) as unknown as PictureProjectiveHomography;
}
function denominator(matrix: PictureProjectiveHomography, x: number, y: number): number {
  return matrix[6] * x + matrix[7] * y + matrix[8];
}
/** Conservative floating-point evaluation budget over the whole source rectangle.
 * This rejects ill-conditioned scene slivers explicitly rather than publishing
 * an inverse whose finite coefficients lose meaningful source coordinates.
 */
function guardSceneInverse(
  forward: PictureProjectiveHomography,
  inverse: PictureProjectiveHomography,
  corners: PictureProjectiveQuad,
  width: number,
  height: number,
): void {
  const sources = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ] as const;
  const roundoff = 64 * Number.EPSILON;
  const maxX = Math.max(...corners.map((entry) => Math.abs(entry.x))),
    maxY = Math.max(...corners.map((entry) => Math.abs(entry.y)));
  const forwardSum = (offset: number) =>
    Math.abs(forward[offset]!) * width +
    Math.abs(forward[offset + 1]!) * height +
    Math.abs(forward[offset + 2]!);
  const inverseSum = (offset: number) =>
    Math.abs(inverse[offset]!) * maxX +
    Math.abs(inverse[offset + 1]!) * maxY +
    Math.abs(inverse[offset + 2]!);
  const minForwardW = Math.min(...sources.map(([x, y]) => denominator(forward, x, y)));
  const forwardWError = roundoff * forwardSum(6);
  const stableForwardW = minForwardW - forwardWError;
  if (!(stableForwardW > 0))
    fail("degenerate", "Picture projective scene forward map is ill-conditioned.");
  const screenErrorX =
      (roundoff * forwardSum(0) + maxX * forwardWError) / stableForwardW + roundoff * maxX,
    screenErrorY =
      (roundoff * forwardSum(3) + maxY * forwardWError) / stableForwardW + roundoff * maxY;
  const inverseError = (offset: number) =>
    roundoff * inverseSum(offset) +
    Math.abs(inverse[offset]!) * screenErrorX +
    Math.abs(inverse[offset + 1]!) * screenErrorY;
  const minInverseW = Math.min(...corners.map((entry) => denominator(inverse, entry.x, entry.y)));
  const inverseWError = inverseError(6);
  const stableInverseW = minInverseW - inverseWError;
  if (
    !(stableInverseW > 0) ||
    (inverseError(0) + width * inverseWError) / stableInverseW + roundoff * width >
      PICTURE_PROJECTIVE_LIMITS.inverseErrorPx ||
    (inverseError(3) + height * inverseWError) / stableInverseW + roundoff * height >
      PICTURE_PROJECTIVE_LIMITS.inverseErrorPx
  )
    fail(
      "degenerate",
      "Picture projective scene inverse exceeds its source-coordinate precision budget.",
    );
  for (let index = 0; index < corners.length; index++) {
    const screen = corners[index]!,
      source = sources[index]!,
      w = denominator(inverse, screen.x, screen.y);
    const x = (inverse[0] * screen.x + inverse[1] * screen.y + inverse[2]) / w,
      y = (inverse[3] * screen.x + inverse[4] * screen.y + inverse[5]) / w;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.abs(x - source[0]) > PICTURE_PROJECTIVE_LIMITS.inverseErrorPx ||
      Math.abs(y - source[1]) > PICTURE_PROJECTIVE_LIMITS.inverseErrorPx
    )
      fail("degenerate", "Picture projective scene inverse does not round-trip its source frame.");
  }
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
  const scene = input.scene;
  const cameraWidth = scene ? scene.widthPx : width,
    cameraHeight = scene ? scene.heightPx : height;
  bounded(
    cameraWidth,
    PICTURE_PROJECTIVE_LIMITS.minDimensionPx,
    PICTURE_PROJECTIVE_LIMITS.dimensionPx,
    "scene width",
  );
  bounded(
    cameraHeight,
    PICTURE_PROJECTIVE_LIMITS.minDimensionPx,
    PICTURE_PROJECTIVE_LIMITS.dimensionPx,
    "scene height",
  );
  const pivotX = scene?.pivot ? scene.pivot.x : cameraWidth / 2,
    pivotY = scene?.pivot ? scene.pivot.y : cameraHeight / 2;
  bounded(
    pivotX,
    -PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    "scene pivot X",
  );
  bounded(
    pivotY,
    -PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    PICTURE_PROJECTIVE_LIMITS.coordinatePx,
    "scene pivot Y",
  );
  const placement = scene ? affineMatrix(scene.sourceToScene) : IDENTITY_MATRIX;
  const placementDeterminant = scene ? affineDeterminant(placement) : 1;
  const inversePlacement = scene
    ? inverseAffineMatrix(placement, placementDeterminant)
    : IDENTITY_MATRIX;
  const output = scene?.sceneToOutput ? affineMatrix(scene.sceneToOutput) : inversePlacement;
  const outputDeterminant = scene ? affineDeterminant(output) : 1;
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
    perspective =
      Math.tan((values.perspectiveDeg * Math.PI) / 360) / (2 * Math.max(cameraWidth, cameraHeight));
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
  const cameraModel = multiply4(
    rotation,
    matrix4([1, 0, 0, -pivotX, 0, 1, 0, -pivotY, 0, 0, 1, values.distanceFromGroundPx, 0, 0, 0, 1]),
  );
  const model = scene ? multiply4(cameraModel, placement) : cameraModel;
  const normalPlacement = scene ? normalPlacementMatrix(inversePlacement) : IDENTITY_MATRIX;
  const normalModel = scene ? multiply4(rotation, normalPlacement) : rotation;
  const projection = matrix4([
    1,
    0,
    shearX - pivotX * perspective,
    pivotX,
    0,
    1,
    shearY - pivotY * perspective,
    pivotY,
    0,
    0,
    1,
    0,
    0,
    0,
    -perspective,
    1,
  ]);
  const sceneScreen = multiply4(projection, model);
  const screen = scene ? multiply4(output, sceneScreen) : sceneScreen;
  const frontHomography = homography(screen, 0);
  const backHomography = homography(screen, -depth);
  const source = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ] as const;
  // Guard the actual placed leaf footprint/depth, not merely the scene frame.
  // The output inverse may otherwise hide out-of-budget common coordinates.
  if (scene) {
    const commonFront = homography(sceneScreen, 0),
      commonBack = homography(sceneScreen, -depth);
    for (const [px, py] of source) {
      point(
        placement[0] * px + placement[1] * py + placement[3],
        placement[4] * px + placement[5] * py + placement[7],
      );
      project(commonFront, px, py);
      project(commonBack, px, py);
      for (const pz of [0, -depth]) {
        const world = transformWorld(model, px, py, pz);
        if (
          [world.x, world.y, world.z].some(
            (value) =>
              !Number.isFinite(value) || Math.abs(value) > PICTURE_PROJECTIVE_LIMITS.coordinatePx,
          )
        )
          fail("coordinate-budget", "Picture projective world coordinate budget exceeded.");
      }
    }
  }
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
    planeVisibility?: number,
  ): PictureProjectiveFace => {
    const center = vector(
      world.reduce((sum, entry) => sum + entry.x, 0) / 4,
      world.reduce((sum, entry) => sum + entry.y, 0) / 4,
      world.reduce((sum, entry) => sum + entry.z, 0) / 4,
    );
    const visibility =
      planeVisibility ??
      (perspective > 0
        ? normal.z - perspective * (normal.x * center.x + normal.y * center.y + normal.z * center.z)
        : normal.z - shearX * normal.x - shearY * normal.y);
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
  const frontCameraDeterminant =
    perspective > 0
      ? frontNormal.z - perspective * values.distanceFromGroundPx
      : frontNormal.z - shearX * frontNormal.x - shearY * frontNormal.y;
  const adaptedDeterminant = (cameraDeterminant: number): number =>
    Math.abs(cameraDeterminant) <= PICTURE_PROJECTIVE_LIMITS.degeneracy
      ? 0
      : cameraDeterminant * placementDeterminant * outputDeterminant;
  const frontInverse = inverseHomography(
    frontHomography,
    adaptedDeterminant(frontCameraDeterminant),
    !!scene,
  );
  if (scene && frontInverse)
    guardSceneInverse(frontHomography, frontInverse, frontCorners, width, height);
  const front: PictureProjectivePlane = Object.freeze({
    ...face(
      "front",
      frontCorners,
      frontWorld,
      frontNormal,
      scene ? frontCameraDeterminant : undefined,
    ),
    homography: frontHomography,
    inverseHomography: frontInverse,
  });
  // A zero-depth plane viewed exactly edge-on legitimately has no painted area.
  // Keep its durable selection frame; hit/texture consumers use the null inverse.
  let back: PictureProjectivePlane | null = null;
  const sides: PictureProjectiveFace[] = [];
  if (depth > 0) {
    const backCameraDeterminant =
      perspective > 0
        ? frontNormal.z - perspective * (values.distanceFromGroundPx - depth)
        : frontCameraDeterminant;
    const backInverse = inverseHomography(
      backHomography,
      adaptedDeterminant(backCameraDeterminant),
      !!scene,
    );
    if (scene && backInverse)
      guardSceneInverse(backHomography, backInverse, backCorners, width, height);
    back = Object.freeze({
      ...face(
        "back",
        backCorners,
        backWorld,
        transformNormal(rotation, 0, 0, -1),
        scene ? -backCameraDeterminant : undefined,
      ),
      homography: backHomography,
      inverseHomography: backInverse,
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
          // Normalize in the unrotated scene. Reflections transform outward
          // normals by inverse transpose, without reversing front/back faces.
          placedNormal(rotation, normalPlacement, nx, ny),
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
    isSceneProjection: !!scene,
    sourceToSceneMatrix: placement,
    sourceToWorldMatrix: model,
    sourceNormalToWorldMatrix: normalModel,
    sourceToSceneScreenMatrix: sceneScreen,
    sceneToOutputMatrix: output,
    projectedOrientation: placementDeterminant * outputDeterminant > 0 ? 1 : -1,
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
  if (geometry.sourceToSceneScreenMatrix !== geometry.sourceToScreenMatrix)
    project(homography(geometry.sourceToSceneScreenMatrix, 0), source.x, source.y);
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
  if (!Number.isFinite(w) || (geometry.isSceneProjection ? w <= 0 : w < 1e-12)) return null;
  const x = (inverse[0] * screen.x + inverse[1] * screen.y + inverse[2]) / w;
  const y = (inverse[3] * screen.x + inverse[4] * screen.y + inverse[5]) / w;
  // Roundoff at projected boundary vertices must not create gaps in hit coverage.
  const epsilon = geometry.isSceneProjection
    ? PICTURE_PROJECTIVE_LIMITS.inverseErrorPx
    : 64 *
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
  if (geometry.isSceneProjection) {
    const forward = mapPictureProjectivePoint(geometry, { x: px, y: py });
    const screenEpsilon =
      64 *
      Number.EPSILON *
      Math.max(1, geometry.widthPx, geometry.heightPx, Math.abs(screen.x), Math.abs(screen.y));
    if (
      Math.abs(forward.x - screen.x) > screenEpsilon ||
      Math.abs(forward.y - screen.y) > screenEpsilon
    )
      return null;
  }
  return Object.freeze({ x: px, y: py, u: px / geometry.widthPx, v: py / geometry.heightPx });
}

export type PictureProjectiveMeshVertex = Readonly<{
  source: PictureProjectivePoint;
  screen: PictureProjectivePoint;
  w: number;
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
