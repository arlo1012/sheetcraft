/** Equation flags are source identity, independent of shape body mirroring. */
export type EquationFlipState = { equationFlipX?: true; equationFlipY?: true };
export type EquationFlipAxis = "horizontal" | "vertical";

/** Own-data admission never visits an inherited flag or evaluates an accessor. */
export function normalizeEquationFlipState(value: unknown): EquationFlipState {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Equation flips require a drawing data record.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Equation flips require ordinary drawing data records.");
  const result: EquationFlipState = Object.create(null);
  for (const key of ["equationFlipX", "equationFlipY"] as const) {
    if (!(key in value)) continue;
    const kind = Object.getOwnPropertyDescriptor(value, "kind");
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!kind || !("value" in kind) || kind.value !== "equation")
      throw new TypeError("Only equations may carry equation flips.");
    if (!field || !("value" in field))
      throw new TypeError("Equation flips require own data fields, not accessors.");
    if (field.value !== true)
      throw new TypeError("Equation flips require sparse true data fields.");
    if (field.value) result[key] = true;
  }
  return result;
}

/** Sparse flag update only; the caller preserves the exact math source and placement. */
export function toggleEquationFlipState(value: unknown, axis: EquationFlipAxis): EquationFlipState {
  if (axis !== "horizontal" && axis !== "vertical")
    throw new TypeError("Unknown equation flip axis.");
  const result = normalizeEquationFlipState(value);
  const kind = Object.getOwnPropertyDescriptor(value, "kind");
  if (!kind || !("value" in kind) || kind.value !== "equation")
    throw new TypeError("Only equations may carry equation flips.");
  const key = axis === "horizontal" ? "equationFlipX" : "equationFlipY";
  if (Object.hasOwn(result, key)) delete result[key];
  else result[key] = true;
  return result;
}

/** Horizontal math stays readable; vertical math rotates 180° about its local center. */
export function getEquationMathRotationDeg(value: unknown): 0 | 180 {
  const flags = normalizeEquationFlipState(value);
  const kind = Object.getOwnPropertyDescriptor(value, "kind");
  if (!kind || !("value" in kind) || kind.value !== "equation")
    throw new TypeError("Equation math rotation requires an Equation source.");
  return Object.hasOwn(flags, "equationFlipY") ? 180 : 0;
}
