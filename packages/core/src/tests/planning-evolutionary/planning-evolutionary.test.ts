import { describe, expect, test } from "vitest";
import { solveEvolutionary } from "../../planning-evolutionary.js";

describe("evolutionary planning", () => {
  test("finds a feasible mixed-variable solution for a nonsmooth objective", () => {
    const result = solveEvolutionary(
      {
        bounds: [
          { lower: 0, upper: 1, kind: "continuous" },
          { lower: 0, upper: 4, kind: "integer" },
          { lower: 0, upper: 1, kind: "binary" },
        ],
        initial: [0.2, 3, 1],
        evaluate: ([x, count, enabled]) => ({
          // A deliberately nonsmooth cost, like an IF/LOOKUP-driven workbook calculation.
          objective: Math.abs(x! - 0.73) + (count === 3 ? 0 : 3) + (enabled === 1 ? 0 : 3),
          equalities: [count! + enabled! - 4],
          inequalities: [x! - 0.8],
        }),
      },
      { seed: 42, maxEvaluations: 3_000 },
    );

    expect(result.status).toBe("feasible");
    expect(result.vector?.[1]).toBe(3);
    expect(result.vector?.[2]).toBe(1);
    expect(result.vector?.[0]).toBeLessThanOrEqual(0.8);
    expect(result.objective).toBeLessThan(0.03);
  });

  test("is repeatable with a fixed seed", () => {
    const model = {
      bounds: [{ lower: -2, upper: 2, kind: "continuous" as const }],
      evaluate: ([x]: readonly number[]) => ({
        objective: Math.abs(x! - 0.314),
        inequalities: [x! - 1],
      }),
    };
    const first = solveEvolutionary(model, { seed: 7, maxEvaluations: 1_000 });
    const second = solveEvolutionary(model, { seed: 7, maxEvaluations: 1_000 });

    expect(second).toEqual(first);
  });

  test("uses the evaluation budget and does not call an unsatisfied model infeasible", () => {
    const result = solveEvolutionary(
      {
        bounds: [{ lower: 0, upper: 1, kind: "continuous" }],
        evaluate: ([x]) => ({ objective: x! * x!, inequalities: [1] }),
      },
      { seed: 3, maxEvaluations: 30 },
    );

    expect(result.status).toBe("limit");
    expect(result.evaluations).toBe(30);
  });

  test("requires explicit finite bounds", () => {
    const result = solveEvolutionary({
      bounds: [{ lower: 0, upper: Number.POSITIVE_INFINITY, kind: "continuous" }],
      evaluate: () => ({ objective: 0 }),
    });

    expect(result).toEqual({ status: "error", evaluations: 0 });
  });

  test("keeps integer and binary values inside non-integral declared bounds", () => {
    const result = solveEvolutionary(
      {
        bounds: [
          { lower: 1.2, upper: 2.8, kind: "integer" },
          { lower: 0.2, upper: 1.4, kind: "binary" },
        ],
        initial: [1.2, 0.2],
        evaluate: ([integer, binary]) => ({
          objective: Math.abs(integer! - 2) + Math.abs(binary! - 1),
        }),
      },
      { maxEvaluations: 100, seed: 4 },
    );

    expect(result.status).toBe("feasible");
    expect(result.vector).toEqual([2, 1]);
  });

  test("rejects a binary interval that includes neither allowed binary value", () => {
    const result = solveEvolutionary({
      bounds: [{ lower: 0.2, upper: 0.8, kind: "binary" }],
      evaluate: () => ({ objective: 0 }),
    });

    expect(result).toEqual({ status: "error", evaluations: 0 });
  });

  test("samples finite candidates even when finite endpoints have an overflowing difference", () => {
    const seen: number[] = [];
    solveEvolutionary(
      {
        bounds: [{ lower: -Number.MAX_VALUE, upper: Number.MAX_VALUE, kind: "continuous" }],
        evaluate: ([value]) => {
          seen.push(value!);
          return { objective: Math.abs(value!) };
        },
      },
      { maxEvaluations: 30, seed: 9 },
    );

    expect(seen).not.toHaveLength(0);
    expect(seen.every(Number.isFinite)).toBe(true);
  });
});
