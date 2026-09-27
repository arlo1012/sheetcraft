import { describe, expect, test } from "vitest";
import { createWorkbookSession } from "../../history.js";
import { createSequentialIdFactory } from "../../runtime.js";
import {
  createApplyPlanningCommand,
  solvePlanning,
  type PlanningRequest,
} from "../../planning-solver.js";
import { getActiveSheet, setCellContent } from "../../workbook.js";

function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  return { session, sheet: getActiveSheet(session.workbook) };
}
function cell(row: number, column: number) {
  return { sheetId: "sheet-1", address: { row, column } };
}
function formula(source: string) {
  return { kind: "formula" as const, formula: { source } };
}
function literal(value: number) {
  return { kind: "literal" as const, value };
}
function request(overrides: Partial<PlanningRequest> = {}): PlanningRequest {
  return {
    objective: cell(0, 2),
    direction: "maximize",
    variables: [
      { cell: cell(0, 0), kind: "continuous", lower: 0 },
      { cell: cell(0, 1), kind: "continuous", lower: 0 },
    ],
    constraints: [
      { left: cell(1, 2), relation: "lte", right: 8 },
      { left: cell(2, 2), relation: "lte", right: 5 },
    ],
    ...overrides,
  };
}

describe("planning solver", () => {
  test("maximizes a proven affine workbook model without mutating it", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 1 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1*5+B1*3"));
    setCellContent(sheet, { row: 1, column: 2 }, formula("=A1+2*B1"));
    setCellContent(sheet, { row: 2, column: 2 }, formula("=A1+B1"));

    const result = solvePlanning(session.workbook, request());

    expect(result.status).toBe("optimal");
    expect(result.objectiveValue).toBeCloseTo(25);
    expect(result.changes).toEqual([
      { sheetId: sheet.id, address: { row: 0, column: 0 }, value: 5 },
      { sheetId: sheet.id, address: { row: 0, column: 1 }, value: 0 },
    ]);
    expect(sheet.cells.get("0:0")?.content).toEqual(literal(0));
  });

  test("returns a verified feasible integer solution without claiming global optimality", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 1 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1+10*B1"));
    setCellContent(sheet, { row: 1, column: 2 }, formula("=A1"));
    setCellContent(sheet, { row: 2, column: 2 }, formula("=A1+B1"));
    const result = solvePlanning(
      session.workbook,
      request({
        variables: [
          { cell: cell(0, 0), kind: "integer", lower: 0 },
          { cell: cell(0, 1), kind: "binary" },
        ],
        constraints: [
          { left: cell(1, 2), relation: "lte", right: 2 },
          { left: cell(2, 2), relation: "lte", right: 3 },
        ],
      }),
    );

    expect(result.status).toBe("feasible");
    expect(result.changes).toEqual([
      { sheetId: sheet.id, address: { row: 0, column: 0 }, value: 2 },
      { sheetId: sheet.id, address: { row: 0, column: 1 }, value: 1 },
    ]);
  });

  test("uses an equality constraint for a requested target objective", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1*2"));
    const result = solvePlanning(
      session.workbook,
      request({
        direction: "target",
        targetValue: 6,
        variables: [{ cell: cell(0, 0), kind: "continuous" }],
        constraints: [],
      }),
    );

    expect(result.status).toBe("optimal");
    expect(result.changes[0]?.value).toBeCloseTo(3);
    expect(result.targetResidual).toBeCloseTo(0);
  });

  test("rejects nonlinear formulas instead of producing an approximate plan", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 1 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1*B1"));

    const result = solvePlanning(session.workbook, request({ constraints: [] }));

    expect(result.status).toBe("unsupported");
    expect(result.diagnostics[0]?.message).toContain("products of changing values");
  });

  test("dispatches bounded binary nonlinear planning to the evolutionary solver", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1*A1"));
    const planning = request({
      method: "evolutionary",
      variables: [{ cell: cell(0, 0), kind: "binary" }],
      constraints: [],
    });
    const result = solvePlanning(session.workbook, planning);
    expect(result).toMatchObject({ status: "feasible", objectiveValue: 1 });
    expect(result.changes).toEqual([
      { sheetId: sheet.id, address: { row: 0, column: 0 }, value: 1 },
    ]);
    expect(createApplyPlanningCommand(session.workbook, planning, result).ok).toBe(true);
  });

  test("requires explicit finite bounds for non-binary nonlinear variables", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1*A1"));
    const result = solvePlanning(
      session.workbook,
      request({
        method: "evolutionary",
        variables: [{ cell: cell(0, 0), kind: "continuous" }],
        constraints: [],
      }),
    );
    expect(result).toMatchObject({ status: "invalid" });
    expect(result.diagnostics[0]?.code).toBe("finite-bounds-required");
  });

  test("rejects volatile nonlinear models before any trial evaluation", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1+RAND()"));
    const result = solvePlanning(
      session.workbook,
      request({
        method: "grg",
        variables: [{ cell: cell(0, 0), kind: "continuous", lower: 0, upper: 1 }],
        constraints: [],
      }),
    );
    expect(result).toMatchObject({ status: "unsupported" });
  });

  test("dispatches a nonlinear equality model to GRG and applies only the verified result", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 1 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=(A1-0.5)*(A1-0.5)+(B1-0.5)*(B1-0.5)"));
    setCellContent(sheet, { row: 1, column: 2 }, formula("=A1+B1"));
    const planning = request({
      method: "grg",
      direction: "minimize",
      variables: [
        { cell: cell(0, 0), kind: "continuous", lower: 0, upper: 1 },
        { cell: cell(0, 1), kind: "continuous", lower: 0, upper: 1 },
      ],
      constraints: [{ left: cell(1, 2), relation: "eq", right: 1 }],
    });
    const result = solvePlanning(session.workbook, planning);
    expect(result.status).toBe("feasible");
    expect(result.changes[0]?.value).toBeCloseTo(0.5, 3);
    expect(result.changes[1]?.value).toBeCloseTo(0.5, 3);
    expect(createApplyPlanningCommand(session.workbook, planning, result).ok).toBe(true);
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1*A1+B1*B1"));
    expect(createApplyPlanningCommand(session.workbook, planning, result)).toMatchObject({
      ok: false,
      reason: "stale-solution",
    });
  });

  test("does not apply an unreachable nonlinear target", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1*A1"));
    const result = solvePlanning(
      session.workbook,
      request({
        method: "evolutionary",
        direction: "target",
        targetValue: 0.5,
        variables: [{ cell: cell(0, 0), kind: "binary" }],
        constraints: [],
        timeLimitMs: 100,
      }),
    );
    expect(result.status).toBe("limit");
    expect(
      createApplyPlanningCommand(
        session.workbook,
        request({
          method: "evolutionary",
          direction: "target",
          targetValue: 0.5,
          variables: [{ cell: cell(0, 0), kind: "binary" }],
          constraints: [],
          timeLimitMs: 100,
        }),
        result,
      ),
    ).toMatchObject({ ok: false, reason: "not-solved" });
  });

  test("evaluates constant functions through constant cell references", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 1 }, literal(-5));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=ABS(B1)+A1"));

    const result = solvePlanning(
      session.workbook,
      request({
        direction: "target",
        targetValue: 8,
        variables: [{ cell: cell(0, 0), kind: "continuous" }],
        constraints: [],
      }),
    );

    expect(result.status).toBe("optimal");
    expect(result.changes[0]?.value).toBeCloseTo(3);
  });

  test("preserves tiny but meaningful affine coefficients", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1*0.000000001"));

    const result = solvePlanning(
      session.workbook,
      request({
        direction: "target",
        targetValue: 10,
        variables: [{ cell: cell(0, 0), kind: "continuous" }],
        constraints: [],
      }),
    );

    expect(result.status).toBe("optimal");
    expect(result.changes[0]?.value).toBeCloseTo(10_000_000_000);
  });

  test("allows a negative bounded variable instead of retaining the solver default nonnegative bound", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(-5));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1"));

    const result = solvePlanning(
      session.workbook,
      request({
        variables: [{ cell: cell(0, 0), kind: "continuous", lower: -10, upper: -2 }],
        constraints: [],
      }),
    );

    expect(result.status).toBe("optimal");
    expect(result.changes[0]?.value).toBeCloseTo(-2);
  });

  test("rejects volatile and spill-result changing cells before solving", () => {
    const volatile = fixture();
    setCellContent(volatile.sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(volatile.sheet, { row: 0, column: 2 }, formula("=RAND()+A1"));
    expect(
      solvePlanning(
        volatile.session.workbook,
        request({ variables: [{ cell: cell(0, 0), kind: "continuous" }], constraints: [] }),
      ),
    ).toMatchObject({ status: "unsupported" });

    const spill = fixture();
    setCellContent(spill.sheet, { row: 0, column: 0 }, formula("=SEQUENCE(1,2)"));
    setCellContent(spill.sheet, { row: 0, column: 2 }, formula("=B1"));
    expect(
      solvePlanning(
        spill.session.workbook,
        request({
          variables: [{ cell: cell(0, 1), kind: "continuous" }],
          constraints: [],
        }),
      ),
    ).toMatchObject({ status: "invalid" });
  });

  test("creates a final command only for the unchanged, validated solution", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, literal(0));
    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1*2"));
    const planning = request({
      direction: "target",
      targetValue: 6,
      variables: [{ cell: cell(0, 0), kind: "continuous" }],
      constraints: [],
    });
    const result = solvePlanning(session.workbook, planning);
    const applicable = createApplyPlanningCommand(session.workbook, planning, result);
    expect(applicable.ok).toBe(true);

    setCellContent(sheet, { row: 0, column: 2 }, formula("=A1*3"));
    const stale = createApplyPlanningCommand(session.workbook, planning, result);
    expect(stale).toMatchObject({ ok: false, reason: "stale-solution" });
  });
});
