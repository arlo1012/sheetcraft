import { normalizeShapePresetParameters } from "./contract.js";
import { evaluateShapePreset } from "./evaluate.js";
import type { PictureCropShape } from "./types.js";

/** Bounded numeric inverse of declared handles; no caller-provided expressions are executed. */
export function moveShapePresetAdjustment(
  input: PictureCropShape,
  width: number,
  height: number,
  handleIndex: number,
  target: Readonly<{ x: number; y: number }>,
): PictureCropShape {
  const shape = normalizeShapePresetParameters(input);
  if (!shape) throw new TypeError("A rectangle has no shape adjustment handle.");
  if (
    ![target.x, target.y].every((value) => Number.isFinite(value) && Math.abs(value) <= 10_000_000)
  )
    throw new RangeError("Invalid shape adjustment target.");
  const initial = evaluateShapePreset(shape, width, height);
  const handle = initial.handles[handleIndex];
  if (!Number.isSafeInteger(handleIndex) || !handle)
    throw new RangeError("Unknown shape adjustment handle.");
  const fields = handle.fields.filter((field) => !field.disabled && field.maximum > field.minimum);
  if (!fields.length) return shape;
  if (fields.length > 2) throw new RangeError("Shape handle exceeds its field budget.");
  const useX = fields.some((field) => field.axis !== "y"),
    useY = fields.some((field) => field.axis !== "x");
  let evaluations = 0;
  const sample = (values: readonly number[]) => {
    if (++evaluations > 256) return undefined;
    const adjustments = { ...shape.adjustments };
    fields.forEach((field, index) => {
      adjustments[field.name] = Math.max(field.minimum, Math.min(field.maximum, values[index]!));
    });
    try {
      let result = evaluateShapePreset({ preset: shape.preset, adjustments }, width, height);
      // A guide may narrow another field's interval. Only this handle's declared values change.
      for (const field of result.handles[handleIndex]!.fields)
        if (Object.hasOwn(adjustments, field.name) && !field.disabled)
          adjustments[field.name] = Math.max(
            field.minimum,
            Math.min(field.maximum, adjustments[field.name]!),
          );
      result = evaluateShapePreset({ preset: shape.preset, adjustments }, width, height);
      const point = result.handles[handleIndex]!.position;
      const error = { x: useX ? point.x - target.x : 0, y: useY ? point.y - target.y : 0 };
      return {
        values: fields.map((field) => adjustments[field.name]!),
        error,
        cost: error.x ** 2 + error.y ** 2,
      };
    } catch {
      return undefined;
    }
  };
  let best = sample(fields.map((field) => field.value))!;
  if (!best) throw new RangeError("Shape handle cannot be evaluated at these extents.");
  const keep = (candidate: ReturnType<typeof sample>) => {
    if (candidate && candidate.cost < best.cost) best = candidate;
  };
  // Periodic polar handles need a deterministic coarse seed before local refinement.
  if (fields.length === 1 && fields[0]!.axis === "angle")
    for (let index = 0; index <= 16; index++)
      keep(sample([fields[0]!.minimum + ((fields[0]!.maximum - fields[0]!.minimum) * index) / 16]));
  for (let iteration = 0; iteration < 24 && best.cost > 1e-10 && evaluations < 220; iteration++) {
    const origin = best;
    const derivatives = fields.map((field, index) => {
      const delta = Math.max(
        1e-3,
        Math.abs(origin.values[index]!) * 1e-5,
        (field.maximum - field.minimum) * 1e-6,
      );
      const values = [...origin.values];
      values[index] = Math.min(field.maximum, origin.values[index]! + delta);
      if (values[index] === origin.values[index])
        values[index] = Math.max(field.minimum, origin.values[index]! - delta);
      const next = sample(values),
        difference = next ? next.values[index]! - origin.values[index]! : 0;
      return next && difference !== 0
        ? {
            x: (next.error.x - origin.error.x) / difference,
            y: (next.error.y - origin.error.y) / difference,
          }
        : { x: 0, y: 0 };
    });
    let step: number[];
    if (fields.length === 1) {
      const d = derivatives[0]!,
        square = d.x ** 2 + d.y ** 2;
      if (square < 1e-30) break;
      step = [-(d.x * origin.error.x + d.y * origin.error.y) / square];
    } else {
      const a = derivatives[0]!,
        b = derivatives[1]!,
        determinant = a.x * b.y - a.y * b.x;
      if (Math.abs(determinant) < 1e-30) break;
      step = [
        (-origin.error.x * b.y + origin.error.y * b.x) / determinant,
        (-a.x * origin.error.y + a.y * origin.error.x) / determinant,
      ];
    }
    for (const fraction of [1, 0.5, 0.25, 0.125, 0.0625])
      keep(sample(origin.values.map((value, index) => value + step[index]! * fraction)));
    if (best === origin) break;
  }
  const adjustments = { ...shape.adjustments };
  fields.forEach((field, index) => {
    adjustments[field.name] = best.values[index]!;
  });
  return normalizeShapePresetParameters({ preset: shape.preset, adjustments })!;
}
