/**
 * A small, deterministic generalized reduced-gradient implementation.
 *
 * It deliberately reports a local feasible solution only: GRG is a local
 * smooth optimizer and neither the reduced-gradient method nor its line
 * search can prove a global optimum for a general nonlinear workbook.
 */
export type GrgModel = Readonly<{
  bounds: readonly Readonly<{ lower: number; upper: number }>[];
  initial: readonly number[];
  evaluate: (point: readonly number[]) =>
    | Readonly<{
        objective: number;
        equalities: readonly number[];
        inequalities: readonly number[];
      }>
    | undefined;
}>;

export type GrgOptions = Readonly<{
  deadlineMs: number;
  tolerance?: number;
  maxIterations?: number;
}>;
export type GrgResult = Readonly<{
  status: "feasible" | "limit" | "infeasible" | "error";
  point?: readonly number[];
  objective?: number;
  iterations: number;
}>;

const DEFAULT_TOLERANCE = 1e-7;

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}
function finiteVector(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}
function violation(value: ReturnType<GrgModel["evaluate"]>): number {
  if (
    !value ||
    !Number.isFinite(value.objective) ||
    !finiteVector(value.equalities) ||
    !finiteVector(value.inequalities)
  )
    return Number.POSITIVE_INFINITY;
  return (
    value.equalities.reduce((total, entry) => total + entry * entry, 0) +
    value.inequalities.reduce((total, entry) => total + Math.max(0, entry) ** 2, 0)
  );
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | undefined {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]!]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1)
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row;
    if (Math.abs(augmented[pivot]![column]!) < 1e-12) return undefined;
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    const divisor = augmented[column]![column]!;
    for (let entry = column; entry <= size; entry += 1)
      augmented[column]![entry] = augmented[column]![entry]! / divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      for (let entry = column; entry <= size; entry += 1)
        augmented[row]![entry] = augmented[row]![entry]! - factor * augmented[column]![entry]!;
    }
  }
  return augmented.map((row) => row[size]!);
}

/** Find a feasible local point with an active-set reduced gradient and backtracking line search. */
export function solveGrg(model: GrgModel, options: GrgOptions): GrgResult {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = options.maxIterations ?? 500;
  if (!model.bounds.length || model.initial.length !== model.bounds.length)
    return { status: "error", iterations: 0 };
  if (
    model.bounds.some(
      (bound) =>
        !Number.isFinite(bound.lower) || !Number.isFinite(bound.upper) || bound.lower > bound.upper,
    )
  )
    return { status: "error", iterations: 0 };
  let point = model.initial.map((value, index) =>
    clamp(value, model.bounds[index]!.lower, model.bounds[index]!.upper),
  );
  let current = model.evaluate(point);
  if (!current) return { status: "error", iterations: 0 };
  // Restore the equality manifold before taking a reduced-gradient step.  A
  // penalty-only step can stall at a stationary, infeasible starting point.
  for (let restore = 0; restore < Math.max(4, point.length * 2); restore += 1) {
    if (Date.now() >= options.deadlineMs) return { status: "limit", iterations: restore };
    if (
      !current.equalities.length ||
      current.equalities.every((value) => Math.abs(value) <= tolerance)
    )
      break;
    const jacobian = current.equalities.map(() => Array.from({ length: point.length }, () => 0));
    for (let column = 0; column < point.length; column += 1) {
      const scale = 1e-6 * Math.max(1, Math.abs(point[column]!));
      const trial = [...point];
      trial[column] = clamp(
        point[column]! + scale,
        model.bounds[column]!.lower,
        model.bounds[column]!.upper,
      );
      if (Math.abs(trial[column]! - point[column]!) < 1e-14)
        trial[column] = clamp(
          point[column]! - scale,
          model.bounds[column]!.lower,
          model.bounds[column]!.upper,
        );
      const step = trial[column]! - point[column]!;
      if (Math.abs(step) < 1e-14) continue;
      const next = model.evaluate(trial);
      if (!next || next.equalities.length !== current.equalities.length)
        return { status: "error", iterations: restore };
      for (let row = 0; row < jacobian.length; row += 1)
        jacobian[row]![column] = (next.equalities[row]! - current.equalities[row]!) / step;
    }
    const gram = jacobian.map((row) =>
      jacobian.map((other) => row.reduce((sum, value, index) => sum + value * other[index]!, 0)),
    );
    const multipliers = solveLinearSystem(gram, [...current.equalities]);
    if (!multipliers) break;
    const delta = point.map(
      (_, column) =>
        -jacobian.reduce((sum, row, rowIndex) => sum + row[column]! * multipliers[rowIndex]!, 0),
    );
    let restored = false;
    const before = current.equalities.reduce((sum, value) => sum + value * value, 0);
    for (let step = 1; step >= 1 / 128; step *= 0.5) {
      const trial = point.map((value, column) =>
        clamp(
          value + step * delta[column]!,
          model.bounds[column]!.lower,
          model.bounds[column]!.upper,
        ),
      );
      const next = model.evaluate(trial);
      if (!next) continue;
      const after = next.equalities.reduce((sum, value) => sum + value * value, 0);
      if (after < before) {
        point = trial;
        current = next;
        restored = true;
        break;
      }
    }
    if (!restored) break;
  }
  let bestFeasible: { point: number[]; objective: number } | undefined;
  /** Newton correction back to the equality manifold after each tangent move. */
  const restoreEqualities = (
    start: number[],
    startValue: NonNullable<typeof current>,
  ): { point: number[]; value: NonNullable<typeof current> } | undefined => {
    let candidate = start;
    let value = startValue;
    for (let pass = 0; pass < Math.max(3, candidate.length); pass += 1) {
      if (
        !value.equalities.length ||
        value.equalities.every((entry) => Math.abs(entry) <= tolerance)
      )
        return { point: candidate, value };
      const jacobian = value.equalities.map(() =>
        Array.from({ length: candidate.length }, () => 0),
      );
      for (let column = 0; column < candidate.length; column += 1) {
        const delta = 1e-6 * Math.max(1, Math.abs(candidate[column]!));
        const probe = [...candidate];
        probe[column] = clamp(
          candidate[column]! + delta,
          model.bounds[column]!.lower,
          model.bounds[column]!.upper,
        );
        if (probe[column] === candidate[column])
          probe[column] = clamp(
            candidate[column]! - delta,
            model.bounds[column]!.lower,
            model.bounds[column]!.upper,
          );
        const step = probe[column]! - candidate[column]!;
        if (!step) continue;
        const next = model.evaluate(probe);
        if (!next) return undefined;
        for (let row = 0; row < jacobian.length; row += 1)
          jacobian[row]![column] = (next.equalities[row]! - value.equalities[row]!) / step;
      }
      const gram = jacobian.map((row) =>
        jacobian.map((other) => row.reduce((sum, item, index) => sum + item * other[index]!, 0)),
      );
      const multipliers = solveLinearSystem(gram, [...value.equalities]);
      if (!multipliers) return { point: candidate, value };
      const correction = candidate.map(
        (_, column) =>
          -jacobian.reduce((sum, row, index) => sum + row[column]! * multipliers[index]!, 0),
      );
      let accepted: { point: number[]; value: NonNullable<typeof current> } | undefined;
      const before = value.equalities.reduce((sum, entry) => sum + entry * entry, 0);
      for (let step = 1; step >= 1 / 128; step *= 0.5) {
        const nextPoint = candidate.map((item, column) =>
          clamp(
            item + step * correction[column]!,
            model.bounds[column]!.lower,
            model.bounds[column]!.upper,
          ),
        );
        const next = model.evaluate(nextPoint);
        if (next && next.equalities.reduce((sum, entry) => sum + entry * entry, 0) < before)
          accepted = { point: nextPoint, value: next };
        if (accepted) break;
      }
      if (!accepted) return { point: candidate, value };
      candidate = accepted.point;
      value = accepted.value;
    }
    return { point: candidate, value };
  };
  const isFeasible = (value: NonNullable<typeof current>) =>
    violation(value) <= tolerance * tolerance;
  if (isFeasible(current)) bestFeasible = { point: [...point], objective: current.objective };

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (Date.now() >= options.deadlineMs)
      return bestFeasible
        ? {
            status: "limit",
            point: bestFeasible.point,
            objective: bestFeasible.objective,
            iterations: iteration,
          }
        : { status: "limit", iterations: iteration };
    if (!current) return { status: "error", iterations: iteration };
    const base = current;
    const baseViolation = violation(base);
    const penalty = bestFeasible ? 1e5 : 1e7;
    const merit = base.objective + penalty * baseViolation;
    const dimension = point.length;
    const objectiveGradient = Array.from({ length: dimension }, () => 0);
    const onFeasibleManifold = baseViolation <= tolerance * tolerance;
    // Equalities define the reduced space.  Inequalities stay in the merit
    // line search so an active bound can be released when descent goes inward.
    const active = onFeasibleManifold ? [...base.equalities] : [];
    const jacobian = active.map(() => Array.from({ length: dimension }, () => 0));
    for (let index = 0; index < dimension; index += 1) {
      const scale = 1e-6 * Math.max(1, Math.abs(point[index]!));
      const trial = [...point];
      trial[index] = clamp(
        point[index]! + scale,
        model.bounds[index]!.lower,
        model.bounds[index]!.upper,
      );
      if (Math.abs(trial[index]! - point[index]!) < 1e-14)
        trial[index] = clamp(
          point[index]! - scale,
          model.bounds[index]!.lower,
          model.bounds[index]!.upper,
        );
      const step = trial[index]! - point[index]!;
      if (Math.abs(step) < 1e-14) continue;
      const evaluated = model.evaluate(trial);
      if (!evaluated) return { status: "error", iterations: iteration };
      const trialMerit = evaluated.objective + penalty * violation(evaluated);
      objectiveGradient[index] = (trialMerit - merit) / step;
      const trialActive = onFeasibleManifold ? [...evaluated.equalities] : [];
      for (let row = 0; row < active.length; row += 1)
        jacobian[row]![index] = (trialActive[row]! - active[row]!) / step;
    }
    // Project objective gradient onto the tangent space of active constraints:
    // d = -(I - Jᵀ(JJᵀ)⁻¹J)∇f. This is the reduced-gradient step.
    let direction = objectiveGradient.map((entry) => -entry);
    if (active.length) {
      const gram = jacobian.map((row) =>
        jacobian.map((other) => row.reduce((sum, value, index) => sum + value * other[index]!, 0)),
      );
      const rhs = jacobian.map((row) =>
        row.reduce((sum, value, index) => sum + value * objectiveGradient[index]!, 0),
      );
      const multipliers = solveLinearSystem(gram, rhs);
      if (multipliers)
        direction = direction.map(
          (entry, index) =>
            entry +
            jacobian.reduce((sum, row, rowIndex) => sum + row[index]! * multipliers[rowIndex]!, 0),
        );
    }
    const norm = Math.hypot(...direction);
    if (!Number.isFinite(norm)) return { status: "error", iterations: iteration };
    if (norm < tolerance) {
      if (bestFeasible)
        return {
          status: "feasible",
          point: bestFeasible.point,
          objective: bestFeasible.objective,
          iterations: iteration,
        };
      // A stationary infeasible point cannot be repaired by this local method.
      return { status: "limit", iterations: iteration };
    }
    direction = direction.map((entry) => entry / norm);
    let accepted = false;
    for (let step = 1; step >= 1e-8; step *= 0.5) {
      const trial = point.map((value, index) =>
        clamp(
          value + step * direction[index]!,
          model.bounds[index]!.lower,
          model.bounds[index]!.upper,
        ),
      );
      if (trial.every((value, index) => Math.abs(value - point[index]!) < 1e-14)) continue;
      const evaluated = model.evaluate(trial);
      if (!evaluated) continue;
      const restored = restoreEqualities(trial, evaluated);
      if (!restored) continue;
      const restoredTrial = restored.point;
      const restoredValue = restored.value;
      const trialViolation = violation(restoredValue);
      const trialMerit = restoredValue.objective + penalty * trialViolation;
      if (trialMerit < merit - 1e-10 * Math.max(1, Math.abs(merit))) {
        point = restoredTrial;
        current = restoredValue;
        if (
          isFeasible(restoredValue) &&
          (!bestFeasible || restoredValue.objective < bestFeasible.objective)
        )
          bestFeasible = { point: [...restoredTrial], objective: restoredValue.objective };
        accepted = true;
        break;
      }
    }
    if (!accepted) {
      if (bestFeasible)
        return {
          status: "feasible",
          point: bestFeasible.point,
          objective: bestFeasible.objective,
          iterations: iteration + 1,
        };
      return { status: "limit", iterations: iteration + 1 };
    }
  }
  return bestFeasible
    ? {
        status: "limit",
        point: bestFeasible.point,
        objective: bestFeasible.objective,
        iterations: maxIterations,
      }
    : { status: "limit", iterations: maxIterations };
}
