import type { TextWarpBoundary, TextWarpPathCommand } from "./types.js";

export type TextWarpPoint = Readonly<{ x: number; y: number }>;
export type TextWarpSamplingOptions = Readonly<{
  width: number;
  height: number;
  /** Absolute logical-pixel error, at the density settled by the caller. */
  positionTolerance: number;
  lengthTolerance?: number;
  maxDepth?: number;
  maxSamplesPerPath?: number;
  maxSamplesPerObject?: number;
}>;
export type TextWarpArcSample = Readonly<{
  position: TextWarpPoint;
  cumulativeLength: number;
  segmentIndex: number;
  parameter: number;
}>;
export type SampledTextWarpBoundary = Readonly<{
  length: number;
  constant: boolean;
  /** Conservative bounds of the original continuous boundary, not just sample vertices. */
  bounds: Readonly<{ left: number; top: number; right: number; bottom: number }>;
  samples: readonly TextWarpArcSample[];
  requestedPositionTolerance: number;
  requestedLengthTolerance: number;
  /** Conservative absolute errors, including accumulated length/inversion error. */
  positionErrorBound: number;
  lengthErrorBound: number;
  work: Readonly<{
    samples: number;
    subdivisions: number;
    /** Direct curve evaluations during plan building, including parse/extrema; future lookups excluded. */
    positionEvaluations: number;
    maximumDepth: number;
    /** Numeric scalar storage only; this is not a JavaScript heap-size claim. */
    numericBytes: number;
  }>;
}>;
export type SampledTextWarpBoundaries = Readonly<{
  boundaries: readonly SampledTextWarpBoundary[];
  samples: number;
  numericBytes: number;
}>;
export type TextWarpFractionSample = Readonly<{
  position: TextWarpPoint;
  /** Directed unit tangent. Null at a constant path or an interior stationary cusp. */
  tangent: TextWarpPoint | null;
  normal: TextWarpPoint | null;
  distance: number;
  segmentIndex: number;
  parameter: number;
}>;
export class TextWarpSamplingError extends RangeError {
  constructor(
    public readonly reason:
      | "depth-budget"
      | "path-sample-budget"
      | "object-sample-budget"
      | "accuracy",
  ) {
    super(`Text-warp sampling failed: ${reason}.`);
    this.name = "TextWarpSamplingError";
  }
}

const MAX_COORDINATE = 10_000_000;
const MAX_COMMANDS = 16;
const MAX_PATHS = 6;
const MAX_NUMERIC_BYTES = 1_048_576;
const TURN = 2 * Math.PI;
type Segment =
  | Readonly<{ kind: "bezier"; controls: readonly TextWarpPoint[] }>
  | Readonly<{
      kind: "arc";
      rx: number;
      ry: number;
      cx: number;
      cy: number;
      start: number;
      sweep: number;
    }>;
type Leaf = Readonly<{
  segment: number;
  t0: number;
  t1: number;
  startLength: number;
  length: number;
}>;
type InternalBoundary = Readonly<{
  segments: readonly Segment[];
  leaves: readonly Leaf[];
  initial: TextWarpPoint;
}>;
const internals = new WeakMap<SampledTextWarpBoundary, InternalBoundary>();
type Options = Required<TextWarpSamplingOptions>;
type WorkAccount = { samples: number; numericBytes: number };

/** Own data only: reject getters before reading, symbols, extra/inherited fields and holes. */
function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object")
    throw new TypeError("Expected an own-data record.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Expected a plain text-warp record.");
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key))
      throw new TypeError("Unknown text-warp field.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor)) throw new TypeError("Text-warp accessors are not admitted.");
    result[key] = descriptor.value;
  }
  return result;
}
function array(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError("Expected a text-warp data array.");
  const length = Object.getOwnPropertyDescriptor(value, "length")!.value as number;
  if (length > maximum) throw new RangeError("Text-warp array exceeds its work budget.");
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)
      throw new TypeError("Unexpected text-warp array field.");
    if (!("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError("Text-warp array accessors are not admitted.");
  }
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor))
      throw new TypeError("Sparse text-warp arrays are not admitted.");
    result.push(descriptor.value);
  }
  return result;
}
function finite(value: unknown, maximum = MAX_COORDINATE): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > maximum)
    throw new RangeError("Invalid finite text-warp number.");
  return value === 0 ? 0 : value;
}
function positive(value: unknown, maximum: number): number {
  const number = finite(value, maximum);
  if (number <= 0) throw new RangeError("Text-warp value must be positive.");
  return number;
}
function limit(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  const number = positive(value, maximum);
  if (!Number.isInteger(number)) throw new RangeError("Text-warp work limits must be integers.");
  return number;
}
function options(input: TextWarpSamplingOptions): Options {
  const data = record(input, [
    "width",
    "height",
    "positionTolerance",
    "lengthTolerance",
    "maxDepth",
    "maxSamplesPerPath",
    "maxSamplesPerObject",
  ]);
  const positionTolerance = positive(data.positionTolerance, 16_384);
  return {
    width: positive(data.width, 16_384),
    height: positive(data.height, 16_384),
    positionTolerance,
    lengthTolerance:
      data.lengthTolerance === undefined
        ? positionTolerance / 6
        : positive(data.lengthTolerance, 16_384),
    maxDepth: limit(data.maxDepth, 16, 16),
    maxSamplesPerPath: limit(data.maxSamplesPerPath, 4_096, 4_096),
    maxSamplesPerObject: limit(data.maxSamplesPerObject, 8_192, 8_192),
  };
}
function point(x: number, y: number): TextWarpPoint {
  return Object.freeze({ x: finite(x), y: finite(y) });
}
function distance(a: TextWarpPoint, b: TextWarpPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mix(a: TextWarpPoint, b: TextWarpPoint, t: number): TextWarpPoint {
  return point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
}
function position(segment: Segment, t: number): TextWarpPoint {
  if (segment.kind === "arc") {
    const angle = segment.start + segment.sweep * t;
    return point(
      segment.cx + segment.rx * Math.cos(angle),
      segment.cy + segment.ry * Math.sin(angle),
    );
  }
  let controls = segment.controls.slice();
  while (controls.length > 1)
    controls = controls.slice(0, -1).map((control, index) => mix(control, controls[index + 1]!, t));
  return controls[0]!;
}
function parseCommands(input: readonly TextWarpPathCommand[]): {
  segments: Segment[];
  initial: TextWarpPoint;
  continuityError: number;
  positionEvaluations: number;
} {
  const commands = array(input, MAX_COMMANDS);
  if (!commands.length) throw new TypeError("An open boundary needs an initial move.");
  const segments: Segment[] = [];
  let current: TextWarpPoint | undefined;
  let initial: TextWarpPoint | undefined;
  let continuityError = 0;
  let positionEvaluations = 0;
  for (let index = 0; index < commands.length; index++) {
    const command = array(commands[index], 7);
    const kind = command[0];
    const arity =
      kind === "M" || kind === "L" ? 3 : kind === "Q" ? 5 : kind === "C" || kind === "A" ? 7 : 0;
    if (!arity || command.length !== arity) throw new TypeError("Invalid open text-warp command.");
    const values = command.slice(1).map((value) => finite(value));
    if (kind === "M") {
      if (index !== 0) throw new TypeError("A boundary has exactly one initial move.");
      current = initial = point(values[0]!, values[1]!);
      continue;
    }
    if (!current) throw new TypeError("Boundary command precedes its move.");
    if (kind === "A") {
      const [rx, ry, cx, cy, start, end] = values as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      if (rx < 0 || ry < 0 || Math.abs(end - start) > 2 * TURN + 1e-8)
        throw new RangeError("Invalid bounded directed ellipse.");
      const segment: Segment = { kind: "arc", rx, ry, cx, cy, start, sweep: end - start };
      const gap = distance(current, position(segment, 0));
      positionEvaluations++;
      const roundoff =
        64 *
        Number.EPSILON *
        Math.max(1, Math.abs(cx), Math.abs(cy), rx, ry, Math.abs(current.x), Math.abs(current.y));
      if (gap > roundoff) throw new TypeError("Ellipse does not start at the preceding endpoint.");
      continuityError += gap;
      // Extrema, including signed sweeps, are checked without allocating an unbounded loop.
      for (let turn = -4; turn <= 4; turn++) {
        for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
          const candidate = angle + TURN * (Math.floor(start / TURN) + turn);
          const t = segment.sweep === 0 ? -1 : (candidate - start) / segment.sweep;
          if (t > 0 && t < 1) {
            position(segment, t);
            positionEvaluations++;
          }
        }
      }
      segments.push(segment);
      current = position(segment, 1);
      positionEvaluations++;
    } else {
      const controls: TextWarpPoint[] = [current];
      for (let coordinate = 0; coordinate < values.length; coordinate += 2)
        controls.push(point(values[coordinate]!, values[coordinate + 1]!));
      segments.push({ kind: "bezier", controls });
      current = controls[controls.length - 1]!;
    }
  }
  return { segments, initial: initial!, continuityError, positionEvaluations };
}
function split(
  controls: readonly TextWarpPoint[],
): [readonly TextWarpPoint[], readonly TextWarpPoint[]] {
  const left = [controls[0]!];
  const right = [controls[controls.length - 1]!];
  let row = controls.slice();
  while (row.length > 1) {
    row = row.slice(0, -1).map((value, index) => mix(value, row[index + 1]!, 0.5));
    left.push(row[0]!);
    right.unshift(row[row.length - 1]!);
  }
  return [left, right];
}
/** Bernstein convex-hull bound against the parameter-linear chord, including nonuniform speed. */
function bezierBounds(controls: readonly TextWarpPoint[]): {
  position: number;
  lower: number;
  upper: number;
} {
  const first = controls[0]!;
  const last = controls[controls.length - 1]!;
  if (controls.every((control) => control.x === first.x && control.y === first.y))
    return { position: 0, lower: 0, upper: 0 };
  let upper = 0;
  let deviation = 0;
  let scale = Math.max(1, Math.abs(first.x), Math.abs(first.y));
  for (let index = 1; index < controls.length; index++) {
    upper += distance(controls[index - 1]!, controls[index]!);
    deviation = Math.max(
      deviation,
      distance(controls[index]!, mix(first, last, index / (controls.length - 1))),
    );
    scale = Math.max(scale, Math.abs(controls[index]!.x), Math.abs(controls[index]!.y));
  }
  const roundoff = 64 * Number.EPSILON * scale;
  return {
    position: deviation + roundoff,
    lower: Math.max(0, distance(first, last) - roundoff),
    upper: upper + roundoff,
  };
}
function arcBounds(
  segment: Extract<Segment, { kind: "arc" }>,
  t0: number,
  t1: number,
): { position: number; lower: number; upper: number } {
  const span = Math.abs(segment.sweep * (t1 - t0));
  const first = position(segment, t0);
  const last = position(segment, t1);
  if (span === 0 || (segment.rx === 0 && segment.ry === 0))
    return { position: 0, lower: 0, upper: 0 };
  if (span > Math.PI / 2) return { position: Infinity, lower: 0, upper: Infinity };
  const middle = segment.start + (segment.sweep * (t0 + t1)) / 2;
  const secant = 1 / Math.cos(span / 2);
  // The bounding tangent triangle may extend past the admitted curve coordinates.
  const tangentIntersection = {
    x: segment.cx + segment.rx * Math.cos(middle) * secant,
    y: segment.cy + segment.ry * Math.sin(middle) * secant,
  };
  const roundoff =
    64 *
    Number.EPSILON *
    Math.max(1, Math.abs(segment.cx), Math.abs(segment.cy), segment.rx, segment.ry);
  // A convex ellipse arc lies inside its endpoint tangent triangle. Its tangent polygon
  // is a length upper bound, also after an affine collapse to a degenerate ellipse.
  return {
    position: (Math.max(segment.rx, segment.ry) * span * span) / 8 + roundoff,
    lower: Math.max(0, distance(first, last) - roundoff),
    upper: distance(first, tangentIntersection) + distance(tangentIntersection, last) + roundoff,
  };
}
function sampleBoundary(
  input: readonly TextWarpPathCommand[],
  settings: Options,
  account: WorkAccount,
): SampledTextWarpBoundary {
  const { segments, initial, continuityError, positionEvaluations } = parseCommands(input);
  const lengthBudget = Math.min(settings.lengthTolerance, settings.positionTolerance / 6);
  if (continuityError > lengthBudget) throw new TextWarpSamplingError("accuracy");
  const availableLengthError = lengthBudget - continuityError;
  const samples: TextWarpArcSample[] = [];
  const leaves: Leaf[] = [];
  let length = 0;
  let lengthError = continuityError;
  let maximumDeviation = 0;
  let subdivisions = 0;
  let evaluations = positionEvaluations;
  let maximumDepth = 0;
  const reserve = (additional: number) => {
    if (samples.length + additional > settings.maxSamplesPerPath)
      throw new TextWarpSamplingError("path-sample-budget");
    if (account.samples + samples.length + additional > settings.maxSamplesPerObject)
      throw new TextWarpSamplingError("object-sample-budget");
  };
  reserve(1);
  samples.push(
    Object.freeze({ position: initial, cumulativeLength: 0, segmentIndex: 0, parameter: 0 }),
  );
  function visit(
    segmentIndex: number,
    t0: number,
    t1: number,
    depth: number,
    controls?: readonly TextWarpPoint[],
  ): void {
    const segment = segments[segmentIndex]!;
    maximumDepth = Math.max(maximumDepth, depth);
    const bounds = segment.kind === "arc" ? arcBounds(segment, t0, t1) : bezierBounds(controls!);
    evaluations += segment.kind === "arc" ? 2 : 0;
    const error = Math.max(0, (bounds.upper - bounds.lower) / 2);
    if (
      bounds.position <= settings.positionTolerance / 2 &&
      error <= (availableLengthError * (t1 - t0)) / Math.max(1, segments.length)
    ) {
      const leafLength = (bounds.upper + bounds.lower) / 2;
      const nextLength = length + leafLength;
      if (!Number.isFinite(nextLength) || (leafLength > 0 && nextLength === length))
        throw new TextWarpSamplingError("accuracy");
      reserve(1);
      leaves.push({ segment: segmentIndex, t0, t1, startLength: length, length: leafLength });
      length = nextLength;
      lengthError += error;
      maximumDeviation = Math.max(maximumDeviation, bounds.position);
      samples.push(
        Object.freeze({
          position: position(segment, t1),
          cumulativeLength: length,
          segmentIndex,
          parameter: t1,
        }),
      );
      evaluations++;
      return;
    }
    if (depth >= settings.maxDepth) throw new TextWarpSamplingError("depth-budget");
    subdivisions++;
    const middle = (t0 + t1) / 2;
    if (segment.kind === "arc") {
      visit(segmentIndex, t0, middle, depth + 1);
      visit(segmentIndex, middle, t1, depth + 1);
    } else {
      const [left, right] = split(controls!);
      visit(segmentIndex, t0, middle, depth + 1, left);
      visit(segmentIndex, middle, t1, depth + 1, right);
    }
  }
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    visit(index, 0, 1, 0, segment.kind === "bezier" ? segment.controls : undefined);
  }
  const positionErrorBound = maximumDeviation + 3 * lengthError;
  if (lengthError > settings.lengthTolerance || positionErrorBound > settings.positionTolerance)
    throw new TextWarpSamplingError("accuracy");
  // Five scalars per public sample, five per private leaf, trusted source data, and a
  // fixed reservation for metadata and depth-16 numeric subdivision scratch.
  const numericBytes =
    samples.length * 5 * 8 +
    leaves.length * 5 * 8 +
    segments.reduce(
      (sum, segment) => sum + (segment.kind === "arc" ? 6 : segment.controls.length * 2) * 8,
      0,
    ) +
    4_096;
  if (account.numericBytes + numericBytes > MAX_NUMERIC_BYTES)
    throw new TextWarpSamplingError("object-sample-budget");
  account.samples += samples.length;
  account.numericBytes += numericBytes;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const sample of samples) {
    left = Math.min(left, sample.position.x);
    top = Math.min(top, sample.position.y);
    right = Math.max(right, sample.position.x);
    bottom = Math.max(bottom, sample.position.y);
  }
  const result: SampledTextWarpBoundary = Object.freeze({
    length,
    constant: length === 0,
    bounds: Object.freeze({
      left: left - maximumDeviation - continuityError,
      top: top - maximumDeviation - continuityError,
      right: right + maximumDeviation + continuityError,
      bottom: bottom + maximumDeviation + continuityError,
    }),
    samples: Object.freeze(samples),
    requestedPositionTolerance: settings.positionTolerance,
    requestedLengthTolerance: settings.lengthTolerance,
    positionErrorBound,
    lengthErrorBound: lengthError,
    work: Object.freeze({
      samples: samples.length,
      subdivisions,
      positionEvaluations: evaluations,
      maximumDepth,
      numericBytes,
    }),
  });
  internals.set(result, { segments, leaves, initial });
  return result;
}
/** One directed open boundary. Exceeding an accuracy/work limit is an explicit failure. */
export function sampleTextWarpBoundary(
  commands: readonly TextWarpPathCommand[],
  input: TextWarpSamplingOptions,
): SampledTextWarpBoundary {
  return sampleBoundary(commands, options(input), { samples: 0, numericBytes: 0 });
}
/** Shared account across all boundaries: no per-path reset can evade the object budget. */
export function sampleTextWarpBoundaries(
  boundaries: readonly TextWarpBoundary[],
  input: TextWarpSamplingOptions,
): SampledTextWarpBoundaries {
  const settings = options(input);
  const paths = array(boundaries, MAX_PATHS);
  if (!paths.length) throw new TypeError("Text-warp sampling needs a boundary.");
  const commands = paths.map(
    (path) => record(path, ["commands"]).commands as readonly TextWarpPathCommand[],
  );
  if (commands.reduce((count, path) => count + array(path, MAX_COMMANDS).length, 0) > MAX_COMMANDS)
    throw new RangeError("Text-warp object exceeds its source-command budget.");
  const account = { samples: 0, numericBytes: 0 };
  const result = commands.map((path) => sampleBoundary(path, settings, account));
  return Object.freeze({
    boundaries: Object.freeze(result),
    samples: account.samples,
    numericBytes: account.numericBytes,
  });
}
function unit(x: number, y: number): TextWarpPoint | null {
  const magnitude = Math.hypot(x, y);
  return magnitude === 0 ? null : point(x / magnitude, y / magnitude);
}
function tangent(segment: Segment, t: number): TextWarpPoint | null {
  if (segment.kind === "arc") {
    const angle = segment.start + segment.sweep * t;
    const directed = unit(
      -segment.rx * Math.sin(angle) * segment.sweep,
      segment.ry * Math.cos(angle) * segment.sweep,
    );
    if (directed || (t !== 0 && t !== 1) || segment.sweep === 0) return directed;
    const side = t === 0 ? 1 : -1;
    return unit(
      -segment.rx * Math.cos(angle) * segment.sweep * segment.sweep * side,
      -segment.ry * Math.sin(angle) * segment.sweep * segment.sweep * side,
    );
  }
  let controls = segment.controls;
  let order = 1;
  while (controls.length > 1) {
    const derivative = controls.slice(0, -1).map((value, index) => ({
      x: (controls[index + 1]!.x - value.x) * (controls.length - 1),
      y: (controls[index + 1]!.y - value.y) * (controls.length - 1),
    }));
    let row = derivative;
    while (row.length > 1)
      row = row.slice(0, -1).map((value, index) => ({
        x: value.x + (row[index + 1]!.x - value.x) * t,
        y: value.y + (row[index + 1]!.y - value.y) * t,
      }));
    const side = t === 1 && order % 2 === 0 ? -1 : 1;
    const result = unit(row[0]!.x * side, row[0]!.y * side);
    if (result || (t !== 0 && t !== 1)) return result;
    controls = derivative;
    order++;
  }
  return null;
}
/** Fractions are closed [0,1]; nearly-full arcs remain open and never wrap at their seam. */
export function sampleTextWarpFraction(
  boundary: SampledTextWarpBoundary,
  fraction: number,
): TextWarpFractionSample {
  const data = internals.get(boundary);
  if (!data) throw new TypeError("Expected a sampler-produced immutable boundary.");
  fraction = finite(fraction, 1);
  if (fraction < 0) throw new RangeError("Text-warp fraction is outside [0,1].");
  if (boundary.constant)
    return Object.freeze({
      position: data.initial,
      tangent: null,
      normal: null,
      distance: 0,
      segmentIndex: 0,
      parameter: 0,
    });
  const target = fraction * boundary.length;
  const leaves = data.leaves;
  let index: number;
  if (fraction === 1) {
    index = leaves.length - 1;
    while (index > 0 && leaves[index]!.length === 0) index--;
  } else {
    let low = 0;
    let high = leaves.length;
    // Upper-bound search chooses the outgoing one-sided tangent at an exact corner.
    while (low < high) {
      const middle = (low + high) >>> 1;
      const leaf = leaves[middle]!;
      if (leaf.startLength + leaf.length <= target) low = middle + 1;
      else high = middle;
    }
    index = Math.min(low, leaves.length - 1);
  }
  const leaf = leaves[index]!;
  const ratio =
    fraction === 1 ? 1 : Math.max(0, Math.min(1, (target - leaf.startLength) / leaf.length));
  const parameter = leaf.t0 + (leaf.t1 - leaf.t0) * ratio;
  const segment = data.segments[leaf.segment]!;
  const direction = tangent(segment, parameter);
  return Object.freeze({
    position: position(segment, parameter),
    tangent: direction,
    normal: direction ? point(-direction.y, direction.x) : null,
    distance: target,
    segmentIndex: leaf.segment,
    parameter,
  });
}
