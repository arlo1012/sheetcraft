import { describe, expect, test } from "vitest";
import { solveGrg } from "../../planning-grg.js";

describe("GRG nonlinear solver", () => {
  test("uses a one-sided derivative when starting at an upper bound", () => {
    const result = solveGrg(
      {
        bounds: [{ lower: 0, upper: 1 }],
        initial: [1],
        evaluate: ([x]) => ({ objective: (x! - 0.2) ** 2, equalities: [], inequalities: [] }),
      },
      { deadlineMs: Date.now() + 1_000 },
    );
    expect(result.status).toBe("feasible");
    expect(result.point?.[0]).toBeCloseTo(0.2, 3);
  });

  test("restores an equality manifold from an infeasible start", () => {
    const result = solveGrg(
      {
        bounds: [
          { lower: 0, upper: 1 },
          { lower: 0, upper: 1 },
        ],
        initial: [0, 0],
        evaluate: ([x, y]) => ({
          objective: (x! - 0.5) ** 2 + (y! - 0.5) ** 2,
          equalities: [x! + y! - 1],
          inequalities: [],
        }),
      },
      { deadlineMs: Date.now() + 1_000 },
    );
    expect(result.status).toBe("feasible");
    expect(result.point?.[0]).toBeCloseTo(0.5, 3);
    expect(result.point?.[1]).toBeCloseTo(0.5, 3);
  });

  test("restores the circle after each reduced-space step", () => {
    const result = solveGrg(
      {
        bounds: [
          { lower: -2, upper: 2 },
          { lower: -2, upper: 2 },
        ],
        initial: [1, 0],
        evaluate: ([x, y]) => ({
          objective: y!,
          equalities: [x! * x! + y! * y! - 1],
          inequalities: [],
        }),
      },
      { deadlineMs: Date.now() + 1_000, maxIterations: 500 },
    );
    expect(result.status).toBe("feasible");
    expect(result.point?.[0]).toBeCloseTo(0, 2);
    expect(result.point?.[1]).toBeCloseTo(-1, 2);
  });

  test("releases an active inequality when descent points inward", () => {
    const result = solveGrg(
      {
        bounds: [{ lower: -10, upper: 10 }],
        initial: [1],
        evaluate: ([x]) => ({ objective: (x! - 5) ** 2, equalities: [], inequalities: [1 - x!] }),
      },
      { deadlineMs: Date.now() + 1_000 },
    );
    expect(result.status).toBe("feasible");
    expect(result.point?.[0]).toBeCloseTo(5, 3);
  });
});
