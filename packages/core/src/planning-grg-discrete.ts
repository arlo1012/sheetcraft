import { solveGrg, type GrgModel, type GrgOptions } from "./planning-grg.js";

export type MixedGrgVariableKind = "continuous" | "integer" | "binary";
export type MixedGrgOptions = GrgOptions & Readonly<{ maxNodes?: number }>;
export type MixedGrgResult = Readonly<{
  status: "feasible" | "limit" | "infeasible" | "error";
  point?: readonly number[];
  objective?: number;
  iterations: number;
  nodes: number;
  /** True when a valid local integer point was retained but search hit a budget. */
  limited?: boolean;
}>;

type Bounds = Readonly<{ lower: number; upper: number }>;
type Node = Readonly<{ bounds: readonly Bounds[]; initial: readonly number[] }>;

const DEFAULT_MAX_NODES = 64;
const DEFAULT_TOLERANCE = 1e-7;

function clamp(value: number, bound: Bounds): number {
  return Math.min(bound.upper, Math.max(bound.lower, value));
}

function discreteBounds(bound: Bounds, kind: MixedGrgVariableKind): Bounds | undefined {
  if (kind === "continuous") return bound;
  if (kind === "integer") {
    const lower = Math.ceil(bound.lower);
    const upper = Math.floor(bound.upper);
    return lower <= upper ? { lower, upper } : undefined;
  }
  const allowsZero = bound.lower <= 0 && bound.upper >= 0;
  const allowsOne = bound.lower <= 1 && bound.upper >= 1;
  if (!allowsZero && !allowsOne) return undefined;
  return { lower: allowsZero ? 0 : 1, upper: allowsOne ? 1 : 0 };
}

function isFeasible(
  model: GrgModel,
  point: readonly number[],
  tolerance: number,
): number | undefined {
  const value = model.evaluate(point);
  if (!value || !Number.isFinite(value.objective)) return undefined;
  if (value.equalities.some((entry) => !Number.isFinite(entry) || Math.abs(entry) > tolerance))
    return undefined;
  if (value.inequalities.some((entry) => !Number.isFinite(entry) || entry > tolerance))
    return undefined;
  return value.objective;
}

function integralPoint(
  point: readonly number[],
  bounds: readonly Bounds[],
  kinds: readonly MixedGrgVariableKind[],
  tolerance: number,
): number[] | undefined {
  const projected = point.map((value, index) => {
    const kind = kinds[index]!;
    if (kind === "continuous") return value;
    const rounded = Math.round(value);
    return Math.abs(value - rounded) <= tolerance ? rounded : Number.NaN;
  });
  if (
    projected.some(
      (value, index) =>
        !Number.isFinite(value) || value < bounds[index]!.lower || value > bounds[index]!.upper,
    )
  )
    return undefined;
  return projected;
}

/**
 * Branches a bounded continuous GRG relaxation on fractional integer/binary
 * variables. This is deliberately a local mixed-integer search: it retains
 * verified feasible points but never treats a local GRG failure as proof that
 * a nonlinear model is globally infeasible or optimal.
 */
export function solveMixedGrg(
  model: GrgModel,
  kinds: readonly MixedGrgVariableKind[],
  options: MixedGrgOptions,
): MixedGrgResult {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  if (
    model.bounds.length === 0 ||
    model.initial.length !== model.bounds.length ||
    kinds.length !== model.bounds.length ||
    !Number.isInteger(maxNodes) ||
    maxNodes <= 0 ||
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    model.bounds.some(
      (bound) =>
        !Number.isFinite(bound.lower) || !Number.isFinite(bound.upper) || bound.lower > bound.upper,
    )
  )
    return { status: "error", iterations: 0, nodes: 0 };

  const rootBounds: Bounds[] = [];
  for (let index = 0; index < model.bounds.length; index += 1) {
    const bound = discreteBounds(model.bounds[index]!, kinds[index]!);
    if (!bound) return { status: "infeasible", iterations: 0, nodes: 0 };
    rootBounds.push(bound);
  }

  const queue: Node[] = [
    {
      bounds: rootBounds,
      initial: model.initial.map((value, index) => clamp(value, rootBounds[index]!)),
    },
  ];
  let iterations = 0;
  let nodes = 0;
  let limited = false;
  let best: { point: readonly number[]; objective: number } | undefined;

  while (queue.length > 0 && nodes < maxNodes) {
    if (Date.now() >= options.deadlineMs) {
      limited = true;
      break;
    }
    const node = queue.pop()!;
    nodes += 1;
    const relaxed = solveGrg(
      { bounds: node.bounds, initial: node.initial, evaluate: model.evaluate },
      options,
    );
    iterations += relaxed.iterations;
    if (relaxed.status === "error") return { status: "error", iterations, nodes };
    if (relaxed.status === "limit") limited = true;
    if (!relaxed.point) continue;

    const integral = integralPoint(relaxed.point, node.bounds, kinds, tolerance);
    if (integral) {
      const objective = isFeasible(model, integral, tolerance);
      if (objective !== undefined && (!best || objective < best.objective))
        best = { point: integral, objective };
      continue;
    }

    // Branch on the first fractional discrete coordinate. No local objective
    // value is used to prune siblings: it is not a global nonlinear bound.
    const branchIndex = relaxed.point.findIndex((value, index) => {
      if (kinds[index] === "continuous") return false;
      return Math.abs(value - Math.round(value)) > tolerance;
    });
    if (branchIndex < 0) continue;
    const value = relaxed.point[branchIndex]!;
    const lower = node.bounds[branchIndex]!.lower;
    const upper = node.bounds[branchIndex]!.upper;
    const floor = Math.floor(value);
    const ceil = Math.ceil(value);
    const branches: Bounds[] = [];
    if (floor >= lower) branches.push({ lower, upper: Math.min(upper, floor) });
    if (ceil <= upper) branches.push({ lower: Math.max(lower, ceil), upper });
    for (const branch of branches) {
      if (branch.lower > branch.upper) continue;
      const bounds = node.bounds.map((bound, index) => (index === branchIndex ? branch : bound));
      queue.push({
        bounds,
        initial: relaxed.point.map((entry, index) => clamp(entry, bounds[index]!)),
      });
    }
  }
  if (queue.length > 0) limited = true;
  if (best)
    return {
      status: "feasible",
      point: best.point,
      objective: best.objective,
      iterations,
      nodes,
      ...(limited ? { limited: true } : {}),
    };
  return { status: "limit", iterations, nodes };
}
