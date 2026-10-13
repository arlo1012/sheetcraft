import { sampleTextWarpFraction } from "./sampling.js";
import type { SampledTextWarpBoundary, TextWarpPoint } from "./sampling.js";

/**
 * Supplied by the existing native layout, before paint/effects. Include the native
 * ink and authored space advances; do not substitute margins, painted bounds or
 * the transparent 1x1 allocation sentinel. This module never shapes text.
 */
export type TextWarpMappingSource =
  | Readonly<{ kind: "native-text"; left: number; top: number; width: number; height: number }>
  | Readonly<{ kind: "whitespace" }>;
export type TextWarpExtrapolation = Readonly<{
  /** Normalized overhang limits. Each is independently bounded to [0,1]. */
  horizontalBefore?: number;
  horizontalAfter?: number;
  verticalBefore?: number;
  verticalAfter?: number;
}>;
export type TextWarpMappingOptions = Readonly<{
  origin?: TextWarpPoint;
  /** Default is no overhang admission, never implicit clamping. */
  extrapolation?: TextWarpExtrapolation;
}>;
const MAX_COORDINATE = 10_000_000;
function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object")
    throw new TypeError("Expected an own-data mapping record.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Expected a plain mapping record.");
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key))
      throw new TypeError("Unknown text-warp mapping field.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor)) throw new TypeError("Mapping accessors are not admitted.");
    result[key] = descriptor.value;
  }
  return result;
}
function finite(value: unknown, maximum = MAX_COORDINATE): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > maximum)
    throw new RangeError("Invalid finite text-warp mapping number.");
  return value === 0 ? 0 : value;
}
function point(input: TextWarpPoint): TextWarpPoint {
  const data = record(input, ["x", "y"]);
  return { x: finite(data.x), y: finite(data.y) };
}
function source(input: TextWarpMappingSource): TextWarpMappingSource {
  const data = record(input, ["kind", "left", "top", "width", "height"]);
  if (data.kind === "whitespace") {
    if (Reflect.ownKeys(data).length !== 1)
      throw new TypeError("Whitespace has no allocation geometry.");
    return { kind: "whitespace" };
  }
  if (data.kind !== "native-text") throw new TypeError("Unknown native source geometry kind.");
  const width = finite(data.width, 16_384);
  const height = finite(data.height, 16_384);
  if (width <= 0 || height <= 0)
    throw new RangeError("Native text source extents must be positive.");
  const left = finite(data.left);
  const top = finite(data.top);
  finite(left + width);
  finite(top + height);
  return { kind: "native-text", left, top, width, height };
}
type MappingInput = Readonly<{
  origin: TextWarpPoint;
  horizontalBefore: number;
  horizontalAfter: number;
  verticalBefore: number;
  verticalAfter: number;
}>;
function options(input: TextWarpMappingOptions | undefined): MappingInput {
  const data: Record<string, unknown> =
    input === undefined ? {} : record(input, ["origin", "extrapolation"]);
  const overhang: Record<string, unknown> =
    data.extrapolation === undefined
      ? {}
      : record(data.extrapolation, [
          "horizontalBefore",
          "horizontalAfter",
          "verticalBefore",
          "verticalAfter",
        ]);
  function limit(key: string): number {
    const value = overhang[key] === undefined ? 0 : finite(overhang[key], 1);
    if (value < 0) throw new RangeError("Text-warp overhang must be nonnegative.");
    return value;
  }
  return {
    origin: data.origin === undefined ? { x: 0, y: 0 } : point(data.origin as TextWarpPoint),
    horizontalBefore: limit("horizontalBefore"),
    horizontalAfter: limit("horizontalAfter"),
    verticalBefore: limit("verticalBefore"),
    verticalAfter: limit("verticalAfter"),
  };
}
function fractions(
  native: Exclude<TextWarpMappingSource, { kind: "whitespace" }>,
  input: TextWarpPoint,
  settings: MappingInput,
): { u: number; v: number } {
  const u = (input.x - native.left) / native.width;
  const v = (input.y - native.top) / native.height;
  if (
    !Number.isFinite(u) ||
    !Number.isFinite(v) ||
    u < -settings.horizontalBefore ||
    u > 1 + settings.horizontalAfter ||
    v < -settings.verticalBefore ||
    v > 1 + settings.verticalAfter
  )
    throw new RangeError("Source point exceeds its declared text-warp overhang policy.");
  return { u, v };
}
/** Explicit horizontal overhang extends the open endpoint's directed tangent. */
function boundaryPoint(boundary: SampledTextWarpBoundary, u: number): TextWarpPoint | null {
  const endpoint = u < 0 ? 0 : u > 1 ? 1 : u;
  const sample = sampleTextWarpFraction(boundary, endpoint);
  if (u >= 0 && u <= 1) return sample.position;
  if (boundary.constant) return sample.position;
  if (!sample.tangent) return null;
  const distance = (u - endpoint) * boundary.length;
  return {
    x: sample.position.x + sample.tangent.x * distance,
    y: sample.position.y + sample.tangent.y * distance,
  };
}
function mapped(x: number, y: number): TextWarpPoint {
  return Object.freeze({ x: finite(x), y: finite(y) });
}

/**
 * The caller selects one band. Independently normalized top/bottom arc lengths
 * are sampled in their authored directions, then interpolated by native y.
 * Constant edges may collapse an envelope; whitespace is explicitly transparent.
 * Vertical overhang follows the same interpolation without silently clamping v.
 */
export function mapTextWarpEnvelopePoint(
  top: SampledTextWarpBoundary,
  bottom: SampledTextWarpBoundary,
  nativeSource: TextWarpMappingSource,
  sourcePoint: TextWarpPoint,
  input?: TextWarpMappingOptions,
): TextWarpPoint | null {
  const native = source(nativeSource);
  const original = point(sourcePoint);
  const settings = options(input);
  if (native.kind === "whitespace") return null;
  const { u, v } = fractions(native, original, settings);
  const upper = boundaryPoint(top, u);
  const lower = boundaryPoint(bottom, u);
  if (!upper || !lower) return null;
  return mapped(
    settings.origin.x + (1 - v) * upper.x + v * lower.x,
    settings.origin.y + (1 - v) * upper.y + v * lower.y,
  );
}

/**
 * The caller selects one track and a native baseline. Signed native y distance
 * is preserved along normal (-dy, dx), with no invented second envelope edge.
 * This continuous native-alpha approximation bends pixels within glyphs. It is
 * not a rigid shaped-cluster placement algorithm or a claim of native parity.
 * An undefined stationary tangent / zero baseline is explicitly transparent.
 */
export function mapTextWarpBaselinePoint(
  baseline: SampledTextWarpBoundary,
  nativeSource: TextWarpMappingSource,
  sourcePoint: TextWarpPoint,
  baselineY: number,
  input?: TextWarpMappingOptions,
): TextWarpPoint | null {
  const native = source(nativeSource);
  const original = point(sourcePoint);
  const settings = options(input);
  baselineY = finite(baselineY);
  if (native.kind === "whitespace") return null;
  if (baselineY < native.top || baselineY > native.top + native.height)
    throw new RangeError("The native baseline must belong to its declared source geometry.");
  const { u } = fractions(native, original, settings);
  const endpoint = u < 0 ? 0 : u > 1 ? 1 : u;
  const sample = sampleTextWarpFraction(baseline, endpoint);
  if (!sample.normal || !sample.tangent) return null;
  const advance = (u - endpoint) * baseline.length;
  const signedDistance = original.y - baselineY;
  return mapped(
    settings.origin.x +
      sample.position.x +
      sample.tangent.x * advance +
      sample.normal.x * signedDistance,
    settings.origin.y +
      sample.position.y +
      sample.tangent.y * advance +
      sample.normal.y * signedDistance,
  );
}
