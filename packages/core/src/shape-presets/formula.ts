const ANGLE_RADIAN = Math.PI / 10_800_000;
export function shapeGuideVariables(width: number, height: number): Record<string, number> {
  const shortest = Math.min(width, height);
  const values: Record<string, number> = {
    w: width,
    h: height,
    l: 0,
    t: 0,
    r: width,
    b: height,
    hc: width / 2,
    vc: height / 2,
    ss: shortest,
    ls: Math.max(width, height),
    cd2: 10_800_000,
    cd4: 5_400_000,
    cd8: 2_700_000,
    "3cd4": 16_200_000,
    "3cd8": 8_100_000,
    "5cd8": 13_500_000,
    "7cd8": 18_900_000,
  };
  for (const divisor of [2, 3, 4, 5, 6, 8, 10, 12, 16, 32]) {
    values[`wd${divisor}`] = width / divisor;
    values[`hd${divisor}`] = height / divisor;
    values[`ssd${divisor}`] = shortest / divisor;
  }
  return values;
}
export function readShapeGuide(value: string, variables: Readonly<Record<string, number>>): number {
  const result = /^-?\d+(?:\.\d+)?$/u.test(value)
    ? Number(value)
    : Object.hasOwn(variables, value)
      ? variables[value]
      : undefined;
  if (result === undefined || !Number.isFinite(result) || Math.abs(result) > 1e18)
    throw new RangeError(`Invalid or unknown preset guide: ${value}.`);
  return result;
}
/** Fixed operators over trusted pinned data, never eval/Function or caller-provided formulas. */
export function evaluateShapeGuide(
  formula: readonly string[],
  variables: Readonly<Record<string, number>>,
): number {
  const operation = formula[0],
    args = formula.slice(1).map((name) => readShapeGuide(name, variables));
  const count =
    operation === "val" || operation === "abs" || operation === "sqrt"
      ? 1
      : ["at2", "cos", "sin", "tan", "max", "min"].includes(operation ?? "")
        ? 2
        : 3;
  if (args.length !== count) throw new TypeError("Invalid preset formula arity.");
  const x = args[0]!,
    y = args[1]!,
    z = args[2]!;
  // Inactive, degenerate guides in the standard data can divide by zero. A bounded
  // zero result keeps collapsed parameters deterministic; path outputs are still validated.
  const divide = (numerator: number, denominator: number) =>
    denominator === 0 ? 0 : numerator / denominator;
  let result: number;
  switch (operation) {
    case "val":
      result = x;
      break;
    case "*/":
      result = divide(x * y, z);
      break;
    case "+-":
      result = x + y - z;
      break;
    case "+/":
      result = divide(x + y, z);
      break;
    case "?:":
      result = x > 0 ? y : z;
      break;
    case "abs":
      result = Math.abs(x);
      break;
    case "at2":
      result = Math.atan2(y, x) / ANGLE_RADIAN;
      break;
    case "cat2":
      result = x * Math.cos(Math.atan2(z, y));
      break;
    case "sat2":
      result = x * Math.sin(Math.atan2(z, y));
      break;
    case "cos":
      result = x * Math.cos(y * ANGLE_RADIAN);
      break;
    case "sin":
      result = x * Math.sin(y * ANGLE_RADIAN);
      break;
    case "tan":
      result = x * Math.tan(y * ANGLE_RADIAN);
      break;
    case "max":
      result = Math.max(x, y);
      break;
    case "min":
      result = Math.min(x, y);
      break;
    case "mod":
      result = Math.hypot(x, y, z);
      break;
    case "pin":
      result = Math.max(x, Math.min(y, z));
      break;
    case "sqrt":
      result = Math.sqrt(Math.max(0, x));
      break;
    default:
      throw new TypeError("Unknown preset guide operator.");
  }
  if (!Number.isFinite(result) || Math.abs(result) > 1e18)
    throw new RangeError("Preset guide exceeds its arithmetic budget.");
  return result === 0 ? 0 : result;
}
