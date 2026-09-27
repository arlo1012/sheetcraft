import { describe, expect, test } from "vitest";
import { executeWorkbookCommand, createWorkbookSession } from "../../history.js";
import {
  createWorkbookEvaluator,
  createSheet,
  getActiveSheet,
  setCellContent,
  setCellValue,
} from "../../workbook.js";
import { createSequentialIdFactory } from "../../runtime.js";
import {
  createApplyGoalSeekCommand,
  solveGoalSeek,
  type GoalSeekRequest,
} from "../../goal-seek.js";

function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  setCellValue(sheet, { row: 0, column: 0 }, 2);
  setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1*A1" } });
  const request: GoalSeekRequest = {
    variable: { sheetId: sheet.id, address: { row: 0, column: 0 } },
    target: { sheetId: sheet.id, address: { row: 0, column: 1 } },
    targetValue: 81,
  };
  return { session, sheet, request };
}

describe("goal seek", () => {
  test("finds a root from a detached workbook and only applies it through one command", () => {
    const f = fixture();
    const solved = solveGoalSeek(f.session.workbook, f.request);
    expect(solved.status).toBe("success");
    if (solved.status !== "success") return;
    expect(solved.value).toBeCloseTo(9, 7);
    expect(f.sheet.cells.get("0:1")?.content).toMatchObject({
      kind: "formula",
      formula: { source: "=A1*A1" },
    });
    expect(
      createWorkbookEvaluator(f.session.workbook, f.sheet.id).getComputedValue({
        row: 0,
        column: 1,
      }),
    ).toBe(4);

    expect(
      executeWorkbookCommand(
        f.session,
        createApplyGoalSeekCommand(f.session.workbook, f.request, solved),
      ),
    ).toBe(true);
    expect(
      createWorkbookEvaluator(f.session.workbook, f.sheet.id).getComputedValue({
        row: 0,
        column: 1,
      }),
    ).toBeCloseTo(81, 7);
  });

  test("accepts a blank variable as zero and reports an unreachable target without a fake success", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 0, column: 0 }, null);
    const solved = solveGoalSeek(f.session.workbook, { ...f.request, targetValue: 25 });
    expect(solved).toMatchObject({ status: "success", achievedValue: 25 });

    setCellContent(f.sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=1" } });
    expect(solveGoalSeek(f.session.workbook, f.request).status).not.toBe("success");
  });

  test("rejects invalid variable and nondeterministic target dependencies", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source: "=1" } });
    expect(solveGoalSeek(f.session.workbook, f.request)).toMatchObject({ status: "invalid-input" });

    setCellValue(f.sheet, { row: 0, column: 0 }, 1);
    setCellContent(
      f.sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=A1+RAND()" } },
    );
    expect(solveGoalSeek(f.session.workbook, f.request)).toMatchObject({
      status: "nondeterministic",
    });

    setCellContent(
      f.sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=SUM(C1:C2)+A1" } },
    );
    setCellContent(
      f.sheet,
      { row: 0, column: 2 },
      { kind: "formula", formula: { source: "=RAND()" } },
    );
    expect(solveGoalSeek(f.session.workbook, f.request)).toMatchObject({
      status: "nondeterministic",
    });

    f.session.workbook.definedNames.set("volatile-name", {
      id: "volatile-name",
      name: "VolatileValue",
      reference: {
        sheetId: f.sheet.id,
        start: { row: 0, column: 2 },
        end: { row: 0, column: 2 },
      },
    });
    setCellContent(
      f.sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=VolatileValue+A1" } },
    );
    expect(solveGoalSeek(f.session.workbook, f.request)).toMatchObject({
      status: "nondeterministic",
    });

    f.session.workbook.definedNames.clear();
    setCellContent(
      f.sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=SUM(C:C)+A1" } },
    );
    setCellContent(
      f.sheet,
      { row: 9, column: 2 },
      { kind: "formula", formula: { source: "=RAND()" } },
    );
    expect(solveGoalSeek(f.session.workbook, f.request)).toMatchObject({
      status: "nondeterministic",
    });

    setCellContent(f.sheet, { row: 9, column: 2 }, null);
    setCellContent(
      f.sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: '=A1+"RAND("' } },
    );
    expect(solveGoalSeek(f.session.workbook, f.request).status).not.toBe("nondeterministic");
  });

  test("uses a bounded secant fallback for an even-multiplicity root", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 0, column: 0 }, 0);
    setCellContent(
      f.sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=(A1-3)^2" } },
    );
    const solved = solveGoalSeek(f.session.workbook, { ...f.request, targetValue: 0 });
    expect(solved.status).toBe("success");
    if (solved.status === "success") expect(solved.achievedValue).toBeCloseTo(0, 8);
  });

  test("re-evaluates cross-sheet formulas even when workbook calculation is manual", () => {
    const f = fixture();
    const data = createSheet("Inputs", "inputs");
    f.session.workbook.sheets.set(data.id, data);
    f.session.workbook.calculation.mode = "manual";
    setCellValue(data, { row: 0, column: 0 }, 2);
    setCellContent(
      f.sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=Inputs!A1*2" } },
    );
    const solved = solveGoalSeek(f.session.workbook, {
      target: { sheetId: f.sheet.id, address: { row: 0, column: 1 } },
      variable: { sheetId: data.id, address: { row: 0, column: 0 } },
      targetValue: 18,
    });
    expect(solved).toMatchObject({ status: "success", achievedValue: 18 });
  });

  test("rejects stale results and applies ordinary validation checks before returning a command", () => {
    const f = fixture();
    const solved = solveGoalSeek(f.session.workbook, f.request);
    expect(solved.status).toBe("success");
    if (solved.status !== "success") return;
    setCellContent(
      f.sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=A1*A1+1" } },
    );
    expect(() => createApplyGoalSeekCommand(f.session.workbook, f.request, solved)).toThrow();

    setCellContent(
      f.sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=A1*A1" } },
    );
    f.sheet.dataValidations = [
      {
        id: "limit",
        range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        type: "whole",
        operator: "between",
        formula1: "1",
        formula2: "8",
        allowBlank: false,
        showError: true,
      },
    ];
    expect(() => createApplyGoalSeekCommand(f.session.workbook, f.request, solved)).toThrow();

    f.sheet.dataValidations = [];
    setCellValue(f.sheet, { row: 1, column: 0 }, solved.value);
    f.sheet.duplicateRules = [
      {
        id: "unique",
        kind: "reject",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      },
    ];
    expect(() => createApplyGoalSeekCommand(f.session.workbook, f.request, solved)).toThrow();
  });

  test("rejects protected and merged variable cells", () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    expect(solveGoalSeek(f.session.workbook, f.request)).toMatchObject({ status: "invalid-input" });
    f.sheet.properties.protected = false;
    f.sheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 0, column: 1 } }];
    expect(solveGoalSeek(f.session.workbook, f.request)).toMatchObject({ status: "invalid-input" });
  });
});
