import { describe, expect, test } from "vitest";
import { solveMixedGrg } from "../../planning-grg-discrete.js";

describe("mixed GRG planning", () => {
  test("branches a fractional relaxation and retains a bounded integer result", () => {
    const result = solveMixedGrg(
      {
        bounds: [{ lower: 0, upper: 3 }],
        initial: [0.4],
        evaluate: ([value]) => ({
          objective: (value! - 1.5) ** 2,
          equalities: [],
          inequalities: [],
        }),
      },
      ["integer"],
      { deadlineMs: Date.now() + 1_000, maxNodes: 16 },
    );

    expect(result.status).toBe("feasible");
    expect(result.point?.[0]).toSatisfy((value: number) => value === 1 || value === 2);
    expect(result.objective).toBeCloseTo(0.25, 6);
  });

  test("branches a binary relaxation and chooses an allowed endpoint", () => {
    const result = solveMixedGrg(
      {
        bounds: [{ lower: 0, upper: 1 }],
        initial: [0.4],
        evaluate: ([value]) => ({
          objective: (value! - 0.8) ** 2,
          equalities: [],
          inequalities: [],
        }),
      },
      ["binary"],
      { deadlineMs: Date.now() + 1_000, maxNodes: 16 },
    );

    expect(result.status).toBe("feasible");
    expect(result.point).toEqual([1]);
  });

  test("proves an empty discrete domain before calling a local optimiser", () => {
    const result = solveMixedGrg(
      {
        bounds: [{ lower: 0.2, upper: 0.8 }],
        initial: [0.5],
        evaluate: () => ({ objective: 0, equalities: [], inequalities: [] }),
      },
      ["binary"],
      { deadlineMs: Date.now() + 1_000 },
    );

    expect(result).toEqual({ status: "infeasible", iterations: 0, nodes: 0 });
  });

  test("honours the inherited shared deadline", () => {
    const result = solveMixedGrg(
      {
        bounds: [{ lower: 0, upper: 2 }],
        initial: [0.4],
        evaluate: ([value]) => ({ objective: value! * value!, equalities: [], inequalities: [] }),
      },
      ["integer"],
      { deadlineMs: Date.now() - 1 },
    );

    expect(result).toEqual({ status: "limit", iterations: 0, nodes: 0 });
  });
});
