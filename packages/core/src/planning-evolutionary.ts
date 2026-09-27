/**
 * A bounded, mixed-variable differential-evolution optimiser.
 *
 * This module deliberately knows nothing about workbooks.  Callers supply a
 * pure minimisation function and perform their own final domain validation.
 * Evolutionary search cannot prove a general nonlinear model infeasible, so
 * exhausting its budget is reported as `limit`, never as `infeasible`.
 */
export type EvolutionaryVariable = Readonly<{
  lower: number;
  upper: number;
  kind: "continuous" | "integer" | "binary";
}>;

export type EvolutionaryEvaluation = Readonly<{
  /** A finite value to minimise. */
  objective: number;
  /** Values whose absolute value must be within tolerance. */
  equalities?: readonly number[];
  /** Values that must be less than or equal to tolerance. */
  inequalities?: readonly number[];
}>;

export type EvolutionaryModel = Readonly<{
  bounds: readonly EvolutionaryVariable[];
  initial?: readonly number[];
  evaluate(vector: readonly number[]): EvolutionaryEvaluation;
}>;

export type EvolutionaryOptions = Readonly<{
  /** Absolute deadline in the same clock as Date.now(). */
  deadlineMs?: number;
  /** Repeatable seed used for all random choices. */
  seed?: number;
  /** Constraint tolerance. Defaults to 1e-7. */
  tolerance?: number;
  /** Hard cap on model evaluations. Defaults to 10,000. */
  maxEvaluations?: number;
}>;

export type EvolutionaryResult = Readonly<{
  status: "feasible" | "limit" | "infeasible" | "error";
  vector?: readonly number[];
  objective?: number;
  evaluations: number;
}>;

type Candidate = Readonly<{
  vector: readonly number[];
  objective: number;
  violation: number;
  feasible: boolean;
}>;

const DEFAULT_TOLERANCE = 1e-7;
const DEFAULT_MAX_EVALUATIONS = 10_000;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function project(value: number, bound: EvolutionaryVariable): number {
  // Do not use lower + r * (upper - lower): finite endpoints can have an
  // overflowing difference.  Mutation can overflow too, so force NaN to a
  // finite midpoint and infinities to their respective endpoint.
  const midpoint = bound.lower / 2 + bound.upper / 2;
  const limited = Number.isNaN(value)
    ? midpoint
    : value <= bound.lower
      ? bound.lower
      : value >= bound.upper
        ? bound.upper
        : value;
  if (bound.kind === "binary") {
    const zeroAllowed = bound.lower <= 0 && bound.upper >= 0;
    const oneAllowed = bound.lower <= 1 && bound.upper >= 1;
    if (!zeroAllowed) return 1;
    if (!oneAllowed) return 0;
    return limited >= 0.5 ? 1 : 0;
  }
  if (bound.kind === "integer")
    return Math.min(Math.floor(bound.upper), Math.max(Math.ceil(bound.lower), Math.round(limited)));
  return limited;
}

function validate(model: EvolutionaryModel, options: EvolutionaryOptions): string | undefined {
  if (
    !Number.isFinite(options.tolerance ?? DEFAULT_TOLERANCE) ||
    (options.tolerance ?? DEFAULT_TOLERANCE) < 0
  )
    return "The evolutionary constraint tolerance must be a non-negative finite number.";
  if (
    !Number.isInteger(options.maxEvaluations ?? DEFAULT_MAX_EVALUATIONS) ||
    (options.maxEvaluations ?? DEFAULT_MAX_EVALUATIONS) <= 0
  )
    return "The evolutionary evaluation limit must be a positive integer.";
  if (model.initial && model.initial.length !== model.bounds.length)
    return "The evolutionary initial point does not match the variable count.";
  for (const bound of model.bounds) {
    if (!Number.isFinite(bound.lower) || !Number.isFinite(bound.upper))
      return "Evolutionary planning requires finite lower and upper bounds for every variable.";
    if (bound.lower > bound.upper)
      return "An evolutionary variable has lower bound above upper bound.";
    if (
      bound.kind === "binary" &&
      !(bound.lower <= 0 && bound.upper >= 0) &&
      !(bound.lower <= 1 && bound.upper >= 1)
    )
      return "A binary evolutionary variable must allow zero or one.";
    if (bound.kind === "integer" && Math.ceil(bound.lower) > Math.floor(bound.upper))
      return "An integer evolutionary variable has no integral value in its bounds.";
  }
  return undefined;
}

function compare(left: Candidate, right: Candidate): number {
  if (left.feasible !== right.feasible) return left.feasible ? -1 : 1;
  if (!left.feasible && left.violation !== right.violation) return left.violation - right.violation;
  return left.objective - right.objective;
}

function isWithinBudget(
  deadlineMs: number | undefined,
  evaluations: number,
  maxEvaluations: number,
): boolean {
  return evaluations < maxEvaluations && (deadlineMs === undefined || Date.now() < deadlineMs);
}

/**
 * Searches a finite box using DE/rand/1/bin with feasibility-first selection.
 * It returns a point only when the supplied constraints are numerically
 * feasible; workbook callers must still re-evaluate and validate that point.
 */
export function solveEvolutionary(
  model: EvolutionaryModel,
  options: EvolutionaryOptions = {},
): EvolutionaryResult {
  const problem = validate(model, options);
  if (problem) return { status: "error", evaluations: 0 };

  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const maxEvaluations = options.maxEvaluations ?? DEFAULT_MAX_EVALUATIONS;
  const random = mulberry32(options.seed ?? 0x9e3779b9);
  const count = model.bounds.length;
  let evaluations = 0;

  const evaluate = (vector: readonly number[]): Candidate | undefined => {
    if (!isWithinBudget(options.deadlineMs, evaluations, maxEvaluations)) return undefined;
    evaluations += 1;
    try {
      const result = model.evaluate(vector);
      if (!Number.isFinite(result.objective))
        return {
          vector,
          objective: Number.POSITIVE_INFINITY,
          violation: Number.POSITIVE_INFINITY,
          feasible: false,
        };
      let violation = 0;
      for (const residual of result.equalities ?? []) {
        if (!Number.isFinite(residual))
          return {
            vector,
            objective: result.objective,
            violation: Number.POSITIVE_INFINITY,
            feasible: false,
          };
        violation += Math.max(0, Math.abs(residual) - tolerance) / Math.max(1, Math.abs(residual));
      }
      for (const residual of result.inequalities ?? []) {
        if (!Number.isFinite(residual))
          return {
            vector,
            objective: result.objective,
            violation: Number.POSITIVE_INFINITY,
            feasible: false,
          };
        violation += Math.max(0, residual - tolerance) / Math.max(1, Math.abs(residual));
      }
      return { vector, objective: result.objective, violation, feasible: violation === 0 };
    } catch {
      return {
        vector,
        objective: Number.POSITIVE_INFINITY,
        violation: Number.POSITIVE_INFINITY,
        feasible: false,
      };
    }
  };

  // A zero-dimensional model has exactly one candidate, so infeasibility is proven.
  if (count === 0) {
    const candidate = evaluate([]);
    if (!candidate) return { status: "limit", evaluations };
    return candidate.feasible
      ? {
          status: "feasible",
          vector: candidate.vector,
          objective: candidate.objective,
          evaluations,
        }
      : { status: "infeasible", evaluations };
  }

  const populationSize = Math.min(120, Math.max(24, count * 12));
  const population: Candidate[] = [];
  const makeRandom = (): number[] =>
    model.bounds.map((bound) =>
      project(bound.lower * (1 - random()) + bound.upper * random(), bound),
    );
  const initial = model.initial?.map((value, index) => project(value, model.bounds[index]!));
  if (initial) {
    const candidate = evaluate(initial);
    if (candidate) population.push(candidate);
  }
  while (population.length < populationSize) {
    const candidate = evaluate(makeRandom());
    if (!candidate) break;
    population.push(candidate);
  }
  if (population.length === 0) return { status: "limit", evaluations };

  // DE needs four distinct population members. With the minimum size above that is guaranteed.
  while (isWithinBudget(options.deadlineMs, evaluations, maxEvaluations)) {
    for (let target = 0; target < population.length; target += 1) {
      if (!isWithinBudget(options.deadlineMs, evaluations, maxEvaluations)) break;
      let a: number;
      let b: number;
      let c: number;
      do a = Math.floor(random() * population.length);
      while (a === target);
      do b = Math.floor(random() * population.length);
      while (b === target || b === a);
      do c = Math.floor(random() * population.length);
      while (c === target || c === a || c === b);
      const forced = Math.floor(random() * count);
      const factor = 0.45 + random() * 0.45;
      const crossover = 0.8;
      const trial = population[target]!.vector.map((value, index) => {
        if (index !== forced && random() >= crossover) return value;
        const donor =
          population[a]!.vector[index]! +
          factor * (population[b]!.vector[index]! - population[c]!.vector[index]!);
        return project(donor, model.bounds[index]!);
      });
      const candidate = evaluate(trial);
      if (candidate && compare(candidate, population[target]!) <= 0) population[target] = candidate;
    }
  }
  const best = population.reduce((candidate, current) =>
    compare(current, candidate) < 0 ? current : candidate,
  );
  return best.feasible
    ? { status: "feasible", vector: best.vector, objective: best.objective, evaluations }
    : { status: "limit", evaluations };
}
