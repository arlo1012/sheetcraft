import { refineHandleInverse, type HandleInverseSample } from "../shape-presets/handle-inverse.js";
import type { ShapeAdjustmentHandle } from "../shape-presets/types.js";
import { normalizeShapeTextWarp } from "./contract.js";
import { evaluateTextWarp, TEXT_WARP_GEOMETRY_LIMITS } from "./evaluate.js";
import type { EvaluatedTextWarpGeometry, ShapeTextWarp } from "./types.js";

const MAXIMUM_EVALUATIONS = 512;
const STORAGE_LIMIT = 2_147_483_647;

function targetPoint(target: Readonly<{ x: number; y: number }>): { x: number; y: number } {
  if (!target || typeof target !== "object" || Array.isArray(target))
    throw new TypeError("Invalid text warp adjustment target.");
  const prototype = Object.getPrototypeOf(target);
  const descriptors = Object.getOwnPropertyDescriptors(target);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Reflect.ownKeys(target).some((key) => key !== "x" && key !== "y") ||
    !Object.hasOwn(descriptors, "x") ||
    !Object.hasOwn(descriptors, "y") ||
    !Object.hasOwn(descriptors.x!, "value") ||
    !Object.hasOwn(descriptors.y!, "value")
  )
    throw new TypeError("Text warp adjustment target must contain own coordinate data.");
  const x: unknown = descriptors.x!.value,
    y: unknown = descriptors.y!.value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    ![x, y].every(
      (value) =>
        Number.isFinite(value) && Math.abs(value) <= TEXT_WARP_GEOMETRY_LIMITS.maximumCoordinate,
    )
  )
    throw new RangeError("Invalid text warp adjustment target.");
  return { x, y };
}

function interval(field: ShapeAdjustmentHandle["fields"][number]): readonly [number, number] {
  if (![field.minimum, field.maximum, field.value].every(Number.isFinite))
    throw new RangeError("Text warp adjustment interval must be finite.");
  return [Math.max(-STORAGE_LIMIT, field.minimum), Math.min(STORAGE_LIMIT, field.maximum)];
}

/**
 * Bounded inverse of a standard text warp's declared XY/polar handle in the actual text rectangle.
 * Changes only that handle's enabled fields, never ordinary shape-body geometry. No caller formulas.
 * At most 512 actual geometry evaluations, including the source and dynamic-range normalization.
 * Reachable, well-conditioned targets refine toward 1e-5 logical-pixel error on the declared axes.
 * Unreachable or singular targets return the best valid sample established, not an exact/global
 * inverse. An unusable source or an unresolvable legal interval rejects rather than guessing.
 * Angles remain in their declared DrawingML interval; there is no hidden continuous-turn projection.
 */
export function moveTextWarpAdjustment(
  input: ShapeTextWarp,
  width: number,
  height: number,
  handleIndex: number,
  target: Readonly<{ x: number; y: number }>,
): ShapeTextWarp {
  const warp = normalizeShapeTextWarp(input);
  if (!warp) throw new TypeError("Text warp adjustment requires an active preset.");
  const point = targetPoint(target);
  if (!Number.isSafeInteger(handleIndex) || handleIndex < 0)
    throw new RangeError("Unknown text warp adjustment handle.");
  let evaluations = 1;
  const initial = evaluateTextWarp(warp, width, height);
  const handle = initial.handles[handleIndex];
  if (!handle) throw new RangeError("Unknown text warp adjustment handle.");
  const fields = handle.fields.filter((field) => {
    const [minimum, maximum] = interval(field);
    return !field.disabled && maximum > minimum;
  });
  if (!fields.length) return warp;
  if (fields.length > 2) throw new RangeError("Text warp handle exceeds its field budget.");
  const useX = fields.some((field) => field.axis !== "y"),
    useY = fields.some((field) => field.axis !== "x");
  const evaluate = (adjustments: Readonly<Record<string, number>>) => {
    if (evaluations >= MAXIMUM_EVALUATIONS) return undefined;
    evaluations++;
    try {
      return evaluateTextWarp({ preset: warp.preset, adjustments }, width, height);
    } catch {
      return undefined;
    }
  };
  const resultSample = (
    geometry: EvaluatedTextWarpGeometry,
    adjustments: Readonly<Record<string, number>>,
  ): HandleInverseSample => {
    const position = geometry.handles[handleIndex]!.position;
    const error = { x: useX ? position.x - point.x : 0, y: useY ? position.y - point.y : 0 };
    return {
      values: fields.map((field) => adjustments[field.name]!),
      error,
      cost: error.x ** 2 + error.y ** 2,
    };
  };
  const sample = (values: readonly number[]): HandleInverseSample | undefined => {
    if (values.length !== fields.length || !values.every(Number.isFinite)) return undefined;
    const adjustments = { ...warp.adjustments };
    fields.forEach((field, index) => {
      const [minimum, maximum] = interval(field);
      adjustments[field.name] = Math.max(minimum, Math.min(maximum, values[index]!));
    });
    // Dynamic ranges must converge and be verified by an actual final evaluation.
    // Disabled and unrelated fields are never written, even when another range changes.
    for (let pass = 0; pass < 8; pass++) {
      const geometry = evaluate(adjustments);
      if (!geometry) return undefined;
      const current = geometry.handles[handleIndex];
      if (!current) return undefined;
      let changed = false;
      for (const field of fields) {
        const declared = current.fields.find((value) => value.name === field.name);
        if (!declared || declared.disabled) return undefined;
        const [minimum, maximum] = interval(declared);
        if (minimum > maximum) return undefined;
        const value = Math.max(minimum, Math.min(maximum, adjustments[field.name]!));
        if (value !== adjustments[field.name]) changed = true;
        adjustments[field.name] = value;
      }
      if (!changed) return resultSample(geometry, adjustments);
    }
    return undefined;
  };
  const initialSample = sample(fields.map((field) => field.value));
  if (!initialSample)
    throw new RangeError(
      "Text warp handle cannot establish a bounded adjustment at these extents.",
    );
  const seeds: number[][] = [];
  const angleIndex = fields.findIndex((field) => field.axis === "angle");
  if (fields.length === 2 && angleIndex >= 0) {
    const radiusIndex = 1 - angleIndex,
      angle = fields[angleIndex]!,
      radius = fields[radiusIndex]!;
    const [angleMinimum, angleMaximum] = interval(angle),
      [radiusMinimum, radiusMaximum] = interval(radius);
    // The extra radius seeds escape the zero-radius singularity without an invented angle.
    for (const radiusValue of [
      initialSample.values[radiusIndex]!,
      (radiusMinimum + radiusMaximum) / 2,
      radiusMaximum,
    ])
      for (let index = 0; index <= 16; index++) {
        const values = [...initialSample.values];
        values[angleIndex] = angleMinimum + ((angleMaximum - angleMinimum) * index) / 16;
        values[radiusIndex] = radiusValue;
        seeds.push(values);
      }
  } else if (fields.length === 1 && angleIndex < 0) {
    const [minimum, maximum] = interval(fields[0]!);
    seeds.push([minimum], [(minimum + maximum) / 2], [maximum]);
  }
  const best = refineHandleInverse(
    fields,
    sample,
    initialSample,
    () => evaluations < MAXIMUM_EVALUATIONS,
    seeds,
    true,
  );
  const adjustments = { ...warp.adjustments };
  fields.forEach((field, index) => {
    adjustments[field.name] = best.values[index]!;
  });
  return normalizeShapeTextWarp({ preset: warp.preset, adjustments })!;
}
