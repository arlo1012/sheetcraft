import { describe, expect, test } from "vitest";
import { createDataTableCommand, previewDataTable } from "../../data-table.js";
import { applyWorkbookCommand } from "../../commands/apply.js";
import { isFormulaError } from "../../formula/types.js";
import { getActiveSheet, createWorkbookEvaluator, setCellContent } from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

function put(
  sheet: ReturnType<typeof getActiveSheet>,
  row: number,
  column: number,
  source: string,
) {
  setCellContent(sheet, { row, column }, { kind: "formula", formula: { source } });
}
function number(
  sheet: ReturnType<typeof getActiveSheet>,
  row: number,
  column: number,
  value: number,
) {
  setCellContent(sheet, { row, column }, { kind: "literal", value });
}

describe("What-If Data Table", () => {
  test("persists a one-input table as sparse formulas and evaluates helpers in each shadow", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    number(sheet, 0, 0, 1); // A1 input
    put(sheet, 0, 1, "=A1*2"); // B1 helper
    put(sheet, 0, 2, "=B1+1"); // C1 target
    number(sheet, 0, 5, 2); // F1 trial
    number(sheet, 0, 6, 4); // G1 trial
    put(sheet, 1, 4, "=C1"); // E2 result formula
    const request = {
      sheetId: sheet.id,
      range: { start: { row: 0, column: 4 }, end: { row: 1, column: 6 } },
      rowInput: { sheetId: sheet.id, address: { row: 0, column: 0 } },
    };

    const command = createDataTableCommand(workbook, request);
    expect(command.changes).toHaveLength(2);
    expect(command.changes[0]?.content).toEqual({
      kind: "formula",
      formula: { source: "=SIMTABLE($E$2,$A$1,$F$1)" },
    });
    expect(applyWorkbookCommand(workbook, command)).not.toBeNull();
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 1, column: 5 })).toBe(5);
    expect(evaluator.getComputedValue({ row: 1, column: 6 })).toBe(9);
    put(sheet, 1, 7, "=SUM(F2:G2)");
    expect(
      createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 1, column: 7 }),
    ).toBe(14);
    expect(previewDataTable(workbook, request)).toMatchObject({ ok: true, values: [[5, 9]] });
  });

  test("substitutes both inputs without mutating the source workbook", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    number(sheet, 0, 0, 1); // A1 row input
    number(sheet, 1, 0, 10); // A2 column input
    put(sheet, 0, 1, "=A1+A2"); // B1 target
    number(sheet, 3, 5, 2);
    number(sheet, 3, 6, 3);
    number(sheet, 4, 4, 100);
    number(sheet, 5, 4, 200);
    put(sheet, 3, 4, "=B1");
    const request = {
      sheetId: sheet.id,
      range: { start: { row: 3, column: 4 }, end: { row: 5, column: 6 } },
      rowInput: { sheetId: sheet.id, address: { row: 0, column: 0 } },
      columnInput: { sheetId: sheet.id, address: { row: 1, column: 0 } },
    };
    const command = createDataTableCommand(workbook, request);
    applyWorkbookCommand(workbook, command);
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 4, column: 5 })).toBe(102);
    expect(evaluator.getComputedValue({ row: 5, column: 6 })).toBe(203);
    expect(evaluator.getComputedValue({ row: 0, column: 0 })).toBe(1);
    expect(evaluator.getComputedValue({ row: 1, column: 0 })).toBe(10);
  });

  test("supports column-input tables with several target formulas and recalculates after a source edit", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    number(sheet, 0, 0, 1); // A1 input
    put(sheet, 0, 4, "=A1+1"); // E1 first target
    put(sheet, 0, 5, "=A1*10"); // F1 second target
    number(sheet, 1, 3, 2); // D2 trial
    number(sheet, 2, 3, 3); // D3 trial
    const request = {
      sheetId: sheet.id,
      range: { start: { row: 0, column: 3 }, end: { row: 2, column: 5 } },
      columnInput: { sheetId: sheet.id, address: { row: 0, column: 0 } },
    };
    applyWorkbookCommand(workbook, createDataTableCommand(workbook, request));
    expect(
      createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 2, column: 5 }),
    ).toBe(30);
    put(sheet, 0, 5, "=A1*100");
    expect(
      createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 2, column: 5 }),
    ).toBe(300);
  });

  test("calculates trial values even when the base input makes the source formula error", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    number(sheet, 0, 0, 0);
    put(sheet, 0, 1, "=1/A1");
    number(sheet, 0, 5, 2);
    put(sheet, 1, 4, "=B1");
    const request = {
      sheetId: sheet.id,
      range: { start: { row: 0, column: 4 }, end: { row: 1, column: 5 } },
      rowInput: { sheetId: sheet.id, address: { row: 0, column: 0 } },
    };
    applyWorkbookCommand(workbook, createDataTableCommand(workbook, request));
    expect(
      createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 1, column: 5 }),
    ).toBe(0.5);
  });

  test("keeps a broken internal reference as #REF instead of treating it as an unknown function", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    put(sheet, 0, 0, "=SIMTABLE(#REF!,$B$1,$C$1)");
    const value = createWorkbookEvaluator(workbook, sheet.id).getComputedValue({
      row: 0,
      column: 0,
    });
    expect(isFormulaError(value) && value.code).toBe("REF");
  });
});
