/** Output-pixel geometry only. Durable picture geometry and point conversion stay
 * with their owners. These bounds never replace selection/hit-test bounds. */
export type PictureEffectBounds = { left: number; top: number; right: number; bottom: number };
export type PictureEffectAffine = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};
export type PictureShadowGeometry = {
  kind: "outer" | "inner" | "perspective";
  scale: number;
  blurRadiusPx: number;
  distancePx: number;
  angleDeg: number;
  /** Normalized anchor coordinates in the source bounds. */
  anchorX: number;
  anchorY: number;
  /** Ground-map coefficients, not Euler angles. Required for perspective. */
  cast?: {
    scaleX: number;
    scaleY: number;
    skewX: number;
    /** Separate normalized ground-map origin. Defaults to the scale anchor. */
    originX?: number;
    originY?: number;
  };
};

export const PICTURE_EFFECT_MAX_COORDINATE = 10_000_000;
export const PICTURE_EFFECT_MAX_BLUR_RADIUS = 256;
export const PICTURE_EFFECT_IDENTITY: Readonly<PictureEffectAffine> = Object.freeze({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
});

export function assertPictureEffectNumber(
  value: number,
  name: string,
  min: number,
  max: number,
): void {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new RangeError(`Picture effect ${name} must be finite and within [${min}, ${max}].`);
}

export function assertPictureEffectBounds(bounds: PictureEffectBounds): void {
  for (const value of [bounds.left, bounds.top, bounds.right, bounds.bottom])
    assertPictureEffectNumber(
      value,
      "coordinate",
      -PICTURE_EFFECT_MAX_COORDINATE,
      PICTURE_EFFECT_MAX_COORDINATE,
    );
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top)
    throw new RangeError("Picture effect bounds must have positive width and height.");
}

export function assertPictureEffectAffine(matrix: PictureEffectAffine): void {
  for (const value of [matrix.a, matrix.b, matrix.c, matrix.d])
    assertPictureEffectNumber(value, "affine coefficient", -10_000, 10_000);
  assertPictureEffectNumber(
    matrix.e,
    "affine translation",
    -PICTURE_EFFECT_MAX_COORDINATE,
    PICTURE_EFFECT_MAX_COORDINATE,
  );
  assertPictureEffectNumber(
    matrix.f,
    "affine translation",
    -PICTURE_EFFECT_MAX_COORDINATE,
    PICTURE_EFFECT_MAX_COORDINATE,
  );
}

/** A singular affine has no raster footprint. Negative determinants are valid. */
export function invertPictureEffectAffine(matrix: PictureEffectAffine): PictureEffectAffine | null {
  assertPictureEffectAffine(matrix);
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 1e-12) return null;
  const inverse = {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
  // Inverse coefficients naturally exceed the forward-map input range for a
  // small valid scale. They are sampling coordinates, never surface dimensions.
  for (const coefficient of Object.values(inverse))
    if (!Number.isFinite(coefficient)) throw new RangeError("Nonfinite inverse picture affine.");
  return inverse;
}

export function transformPictureEffectBounds(
  bounds: PictureEffectBounds,
  matrix: PictureEffectAffine,
): PictureEffectBounds {
  assertPictureEffectBounds(bounds);
  assertPictureEffectAffine(matrix);
  const x0 = matrix.a * bounds.left + matrix.c * bounds.top + matrix.e;
  const y0 = matrix.b * bounds.left + matrix.d * bounds.top + matrix.f;
  const x1 = matrix.a * bounds.right + matrix.c * bounds.top + matrix.e;
  const y1 = matrix.b * bounds.right + matrix.d * bounds.top + matrix.f;
  const x2 = matrix.a * bounds.right + matrix.c * bounds.bottom + matrix.e;
  const y2 = matrix.b * bounds.right + matrix.d * bounds.bottom + matrix.f;
  const x3 = matrix.a * bounds.left + matrix.c * bounds.bottom + matrix.e;
  const y3 = matrix.b * bounds.left + matrix.d * bounds.bottom + matrix.f;
  const result = {
    left: Math.min(x0, x1, x2, x3),
    top: Math.min(y0, y1, y2, y3),
    right: Math.max(x0, x1, x2, x3),
    bottom: Math.max(y0, y1, y2, y3),
  };
  for (const value of [result.left, result.top, result.right, result.bottom])
    assertPictureEffectNumber(
      value,
      "transformed coordinate",
      -PICTURE_EFFECT_MAX_COORDINATE,
      PICTURE_EFFECT_MAX_COORDINATE,
    );
  return result;
}

export function expandPictureEffectBounds(
  bounds: PictureEffectBounds,
  radiusPx: number,
): PictureEffectBounds {
  assertPictureEffectBounds(bounds);
  assertPictureEffectNumber(radiusPx, "bounds support", 0, 4096);
  const result = {
    left: bounds.left - radiusPx,
    top: bounds.top - radiusPx,
    right: bounds.right + radiusPx,
    bottom: bounds.bottom + radiusPx,
  };
  assertPictureEffectBounds(result);
  return result;
}

export function unionPictureEffectBounds(
  ...bounds: readonly PictureEffectBounds[]
): PictureEffectBounds {
  if (bounds.length === 0 || bounds.length > 16)
    throw new RangeError("Picture bounds union needs 1–16 inputs.");
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const entry of bounds) {
    assertPictureEffectBounds(entry);
    left = Math.min(left, entry.left);
    top = Math.min(top, entry.top);
    right = Math.max(right, entry.right);
    bottom = Math.max(bottom, entry.bottom);
  }
  return { left, top, right, bottom };
}

export function integerPictureEffectBounds(bounds: PictureEffectBounds): PictureEffectBounds {
  assertPictureEffectBounds(bounds);
  return {
    left: Math.floor(bounds.left),
    top: Math.floor(bounds.top),
    right: Math.ceil(bounds.right),
    bottom: Math.ceil(bounds.bottom),
  };
}

export function pictureEffectBlurSupport(radiusPx: number): number {
  assertPictureEffectNumber(radiusPx, "blur radius", 0, PICTURE_EFFECT_MAX_BLUR_RADIUS);
  return Math.ceil(radiusPx);
}

export function createPictureShadowAffine(
  bounds: PictureEffectBounds,
  effect: PictureShadowGeometry,
): PictureEffectAffine {
  assertPictureEffectBounds(bounds);
  assertPictureEffectNumber(effect.scale, "shadow scale", 0, 16);
  pictureEffectBlurSupport(effect.blurRadiusPx);
  assertPictureEffectNumber(effect.distancePx, "shadow distance", 0, 4096);
  assertPictureEffectNumber(effect.angleDeg, "shadow angle", -3600, 3600);
  assertPictureEffectNumber(effect.anchorX, "shadow anchor", 0, 1);
  assertPictureEffectNumber(effect.anchorY, "shadow anchor", 0, 1);
  if (!["outer", "inner", "perspective"].includes(effect.kind))
    throw new TypeError("Unknown picture shadow kind.");
  let a = effect.scale,
    c = 0,
    d = effect.scale;
  if (effect.kind === "perspective") {
    if (!effect.cast) throw new TypeError("Perspective shadow requires a ground affine.");
    assertPictureEffectNumber(effect.cast.scaleX, "cast scale X", -16, 16);
    assertPictureEffectNumber(effect.cast.scaleY, "cast scale Y", -16, 16);
    assertPictureEffectNumber(effect.cast.skewX, "cast skew", -16, 16);
    a *= effect.cast.scaleX;
    c = effect.scale * effect.cast.skewX;
    d *= effect.cast.scaleY;
  }
  const anchorX = bounds.left + (bounds.right - bounds.left) * effect.anchorX;
  const anchorY = bounds.top + (bounds.bottom - bounds.top) * effect.anchorY;
  const radians = (effect.angleDeg * Math.PI) / 180;
  let translateX = anchorX - a * anchorX - c * anchorY;
  let translateY = anchorY - d * anchorY;
  if (effect.kind === "perspective" && effect.cast) {
    const normalizedX = effect.cast.originX ?? effect.anchorX;
    const normalizedY = effect.cast.originY ?? effect.anchorY;
    assertPictureEffectNumber(normalizedX, "cast origin X", 0, 1);
    assertPictureEffectNumber(normalizedY, "cast origin Y", 0, 1);
    const originX = bounds.left + (bounds.right - bounds.left) * normalizedX;
    const originY = bounds.top + (bounds.bottom - bounds.top) * normalizedY;
    // S(anchor) first, G(origin) second. They coincide only when both pivots do.
    const scaleOffsetX = (1 - effect.scale) * anchorX;
    const scaleOffsetY = (1 - effect.scale) * anchorY;
    translateX =
      effect.cast.scaleX * scaleOffsetX +
      effect.cast.skewX * scaleOffsetY +
      (1 - effect.cast.scaleX) * originX -
      effect.cast.skewX * originY;
    translateY = effect.cast.scaleY * scaleOffsetY + (1 - effect.cast.scaleY) * originY;
  }
  return {
    a,
    b: 0,
    c,
    d,
    e: translateX + effect.distancePx * Math.cos(radians),
    f: translateY + effect.distancePx * Math.sin(radians),
  };
}

export function getPictureShadowBounds(
  bounds: PictureEffectBounds,
  effect: PictureShadowGeometry,
): PictureEffectBounds | null {
  const matrix = createPictureShadowAffine(bounds, effect);
  if (effect.kind === "inner") return { ...bounds };
  if (Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-12) return null;
  // One pixel of bilinear reconstruction support in addition to finite blur.
  return expandPictureEffectBounds(
    transformPictureEffectBounds(bounds, matrix),
    pictureEffectBlurSupport(effect.blurRadiusPx) + 1,
  );
}

export function getPictureReflectionBounds(
  bounds: PictureEffectBounds,
  coverage: number,
  gapPx: number,
  blurRadiusPx: number,
): PictureEffectBounds | null {
  assertPictureEffectBounds(bounds);
  assertPictureEffectNumber(coverage, "reflection coverage", 0, 1);
  assertPictureEffectNumber(gapPx, "reflection gap", 0, 4096);
  const support = pictureEffectBlurSupport(blurRadiusPx);
  if (coverage === 0) return null;
  return expandPictureEffectBounds(
    {
      left: bounds.left,
      right: bounds.right,
      top: bounds.bottom + gapPx,
      bottom: bounds.bottom + gapPx + coverage * (bounds.bottom - bounds.top),
    },
    support,
  );
}

export type PictureLineCompound = "single" | "double" | "thick-thin" | "thin-thick" | "triple";
export type PictureLineDash =
  | "solid"
  | "round-dot"
  | "square-dot"
  | "dash"
  | "short-dash"
  | "long-dash"
  | "long-dash-dot"
  | "long-dash-dot-dot";
export type PictureLineCap = "butt" | "round" | "square";
export type PictureLineJoin = "round" | "bevel" | "miter";
export type PictureLineBand = readonly [number, number];
const COMPOUND_BANDS: Record<PictureLineCompound, readonly PictureLineBand[]> = {
  single: [[-0.5, 0.5]],
  double: [
    [-0.5, -1 / 6],
    [1 / 6, 0.5],
  ],
  "thick-thin": [
    [-0.5, 0.1],
    [0.3, 0.5],
  ],
  "thin-thick": [
    [-0.5, -0.3],
    [-0.1, 0.5],
  ],
  triple: [
    [-0.5, -1 / 3],
    [-1 / 6, 1 / 6],
    [1 / 3, 0.5],
  ],
};
const DASH_PATTERNS: Record<PictureLineDash, readonly number[]> = {
  solid: [],
  "round-dot": [0, 2],
  "square-dot": [1, 2],
  dash: [4, 3],
  "short-dash": [2, 2],
  "long-dash": [8, 3],
  "long-dash-dot": [8, 3, 1, 3],
  "long-dash-dot-dot": [8, 3, 1, 3, 1, 3],
};
for (const bands of Object.values(COMPOUND_BANDS)) {
  for (const band of bands) Object.freeze(band);
  Object.freeze(bands);
}
for (const pattern of Object.values(DASH_PATTERNS)) Object.freeze(pattern);

/** Normalized offsets across the TOTAL line envelope; gaps are truly unpainted. */
export function getPictureLineCompoundBands(
  compound: PictureLineCompound,
): readonly PictureLineBand[] {
  if (!Object.hasOwn(COMPOUND_BANDS, compound))
    throw new TypeError("Unknown picture compound line.");
  const bands = COMPOUND_BANDS[compound];
  if (!bands) throw new TypeError("Unknown picture compound line.");
  return bands;
}

/** App-owned lengths in total-width multiples. No WPS positional parity claim. */
export function getPictureLineDashPattern(dash: PictureLineDash): readonly number[] {
  if (!Object.hasOwn(DASH_PATTERNS, dash)) throw new TypeError("Unknown picture line dash.");
  const pattern = DASH_PATTERNS[dash];
  if (!pattern) throw new TypeError("Unknown picture line dash.");
  return pattern;
}

export type PictureDashInterval = { start: number; end: number; dot: "round" | null };
/** One continuous path phase, also shared by every compound band. Unclipped
 * endpoints preserve cap placement when a dash crosses a path boundary. */
export function getPictureLineDashIntervals(
  pathLength: number,
  widthPx: number,
  dash: PictureLineDash,
  phasePx = 0,
): readonly PictureDashInterval[] {
  assertPictureEffectNumber(pathLength, "path length", 0, 65_536);
  assertPictureEffectNumber(widthPx, "line width", Number.MIN_VALUE, 4096);
  assertPictureEffectNumber(
    phasePx,
    "dash phase",
    -PICTURE_EFFECT_MAX_COORDINATE,
    PICTURE_EFFECT_MAX_COORDINATE,
  );
  const pattern = getPictureLineDashPattern(dash);
  if (pathLength === 0) return [];
  if (pattern.length === 0) return [{ start: 0, end: pathLength, dot: null }];
  const period = pattern.reduce((sum, value) => sum + value, 0) * widthPx;
  const phases = Math.ceil(pathLength / period) + 2;
  if (!Number.isFinite(phases) || (phases * pattern.length) / 2 > 8192)
    throw new RangeError("Picture dash interval budget exceeded.");
  const phase = ((phasePx % period) + period) % period;
  const intervals: PictureDashInterval[] = [];
  for (let cycle = 0; cycle < phases; cycle++) {
    let position = cycle * period - phase;
    for (let entry = 0; entry < pattern.length; entry += 2) {
      const end = position + pattern[entry]! * widthPx;
      if (end >= 0 && position <= pathLength)
        intervals.push({ start: position, end, dot: dash === "round-dot" ? "round" : null });
      position = end + pattern[entry + 1]! * widthPx;
    }
  }
  return intervals;
}

/** Analytic open-dash cap coverage in tangent/normal coordinates. */
export function pictureLineDashContainsPoint(
  alongPx: number,
  normalPx: number,
  startPx: number,
  endPx: number,
  halfWidthPx: number,
  cap: PictureLineCap,
  roundDot = false,
): boolean {
  assertPictureEffectNumber(
    alongPx,
    "line tangent",
    -PICTURE_EFFECT_MAX_COORDINATE,
    PICTURE_EFFECT_MAX_COORDINATE,
  );
  assertPictureEffectNumber(
    normalPx,
    "line normal",
    -PICTURE_EFFECT_MAX_COORDINATE,
    PICTURE_EFFECT_MAX_COORDINATE,
  );
  assertPictureEffectNumber(
    startPx,
    "dash start",
    -PICTURE_EFFECT_MAX_COORDINATE,
    PICTURE_EFFECT_MAX_COORDINATE,
  );
  assertPictureEffectNumber(
    endPx,
    "dash end",
    -PICTURE_EFFECT_MAX_COORDINATE,
    PICTURE_EFFECT_MAX_COORDINATE,
  );
  assertPictureEffectNumber(halfWidthPx, "half line width", 0, 2048);
  if (endPx < startPx || (cap !== "butt" && cap !== "round" && cap !== "square"))
    throw new TypeError("Invalid picture dash geometry.");
  if (halfWidthPx === 0) return false;
  if (roundDot) return (alongPx - startPx) ** 2 + normalPx ** 2 <= halfWidthPx ** 2;
  if (Math.abs(normalPx) > halfWidthPx) return false;
  if (alongPx >= startPx && alongPx <= endPx) return true;
  if (cap === "butt") return false;
  const distance = alongPx < startPx ? startPx - alongPx : alongPx - endPx;
  return cap === "square"
    ? distance <= halfWidthPx
    : distance ** 2 + normalPx ** 2 <= halfWidthPx ** 2;
}

/** Coverage of the outside quadrant of a rectangular 90-degree join. x/y
 * are nonnegative distances from the path corner along its outward normals. */
export function pictureLineCornerContainsPoint(
  xPx: number,
  yPx: number,
  halfWidthPx: number,
  join: PictureLineJoin,
  miterLimit = 10,
): boolean {
  assertPictureEffectNumber(xPx, "corner X", 0, PICTURE_EFFECT_MAX_COORDINATE);
  assertPictureEffectNumber(yPx, "corner Y", 0, PICTURE_EFFECT_MAX_COORDINATE);
  assertPictureEffectNumber(halfWidthPx, "corner width", 0, 2048);
  assertPictureEffectNumber(miterLimit, "miter limit", 1, 1000);
  if (join !== "round" && join !== "bevel" && join !== "miter")
    throw new TypeError("Unknown picture line join.");
  if (halfWidthPx === 0 || xPx > halfWidthPx || yPx > halfWidthPx) return false;
  if (join === "round") return xPx ** 2 + yPx ** 2 <= halfWidthPx ** 2;
  if (join === "bevel" || miterLimit < Math.SQRT2) return xPx + yPx <= halfWidthPx;
  return true;
}
