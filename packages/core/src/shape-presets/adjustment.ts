import { normalizeShapePresetParameters } from "./contract.js";
import { evaluateShapePreset } from "./evaluate.js";
import { refineHandleInverse } from "./handle-inverse.js";
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
  const initialSample = sample(fields.map((field) => field.value));
  if (!initialSample) throw new RangeError("Shape handle cannot be evaluated at these extents.");
  const best = refineHandleInverse(fields, sample, initialSample, () => evaluations < 220);
  const adjustments = { ...shape.adjustments };
  fields.forEach((field, index) => {
    adjustments[field.name] = best.values[index]!;
  });
  return normalizeShapePresetParameters({ preset: shape.preset, adjustments })!;
}
