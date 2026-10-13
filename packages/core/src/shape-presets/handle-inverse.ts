import type { ShapeAdjustmentHandle } from "./types.js";

/** Private numeric primitive. Each domain owns validation, evaluation and its work budget. */
export type HandleInverseSample = Readonly<{
  values: readonly number[];
  error: Readonly<{ x: number; y: number }>;
  cost: number;
}>;

export function refineHandleInverse(
  fields: ShapeAdjustmentHandle["fields"],
  sample: (values: readonly number[]) => HandleInverseSample | undefined,
  initial: HandleInverseSample,
  continueRefinement: () => boolean,
  seeds: readonly (readonly number[])[] = [],
  retryProjectedDerivative = false,
): HandleInverseSample {
  let best = initial;
  const keep = (candidate: HandleInverseSample | undefined) => {
    if (candidate && candidate.cost < best.cost) best = candidate;
  };
  for (const values of seeds) keep(sample(values));
  // Periodic polar handles need a deterministic coarse seed before local refinement.
  if (fields.length === 1 && fields[0]!.axis === "angle")
    for (let index = 0; index <= 16; index++)
      keep(sample([fields[0]!.minimum + ((fields[0]!.maximum - fields[0]!.minimum) * index) / 16]));
  for (
    let iteration = 0;
    iteration < 24 && best.cost > 1e-10 && continueRefinement();
    iteration++
  ) {
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
      let next = sample(values),
        difference = next ? next.values[index]! - origin.values[index]! : 0;
      // Opt-in for domains whose re-evaluated ranges can project the forward probe
      // back onto the origin. Ordinary shapes retain their established probe order.
      if (retryProjectedDerivative && (!next || difference === 0)) {
        const direction = values[index]! >= origin.values[index]! ? -1 : 1;
        values[index] = Math.max(
          field.minimum,
          Math.min(field.maximum, origin.values[index]! + delta * direction),
        );
        next = sample(values);
        difference = next ? next.values[index]! - origin.values[index]! : 0;
      }
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
  return best;
}
