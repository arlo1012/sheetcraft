import { describe, expect, test } from "vitest";
import { createSetCellContentCommand } from "../../commands/values.js";
import { createSetWorkbookCalculationCommand } from "../../commands/workbook-settings.js";
import { createDataTableCommand, previewDataTable } from "../../data-table.js";
import { createWorkbookCalculationSession } from "../../formula/calculation-session.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
  setCellContent,
  type CellAddress,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function putFormula(
  sheet: ReturnType<typeof getActiveSheet>,
  row: number,
  column: number,
  source: string,
) {
  setCellContent(sheet, { row, column }, { kind: "formula", formula: { source } });
}

function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
  setCellContent(sheet, { row: 0, column: 4 }, { kind: "literal", value: 3 });
  setCellContent(sheet, { row: 0, column: 5 }, { kind: "literal", value: 4 });
  putFormula(sheet, 1, 3, "=A1*2");
  const request = {
    sheetId: sheet.id,
    range: { start: { row: 0, column: 3 }, end: { row: 1, column: 5 } },
    rowInput: { sheetId: sheet.id, address: { row: 0, column: 0 } },
  };
  return { session, sheet, request };
}

function value(
  calculation: ReturnType<typeof createWorkbookCalculationSession>,
  sheetId: string,
  address: CellAddress,
) {
  return calculation.getEvaluator(sheetId).getComputedValue(address);
}

describe("Data Table runtime", () => {
  test("evaluates SIMTABLE outputs before formulas that consume them", () => {
    const { session, sheet, request } = fixture();
    executeWorkbookCommand(session, createDataTableCommand(session.workbook, request));
    putFormula(sheet, 1, 6, "=SUM(E2:F2)");

    expect(
      createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({ row: 1, column: 6 }),
    ).toBe(14);
  });

  test("automatically recalculates after header and source formula edits", () => {
    const { session, sheet, request } = fixture();
    executeWorkbookCommand(session, createDataTableCommand(session.workbook, request));
    const calculation = createWorkbookCalculationSession(session.workbook);
    const execute = (command: ReturnType<typeof createSetCellContentCommand>) => {
      calculation.prepareMutation();
      executeWorkbookCommand(session, command);
      calculation.invalidate();
    };

    expect(value(calculation, sheet.id, { row: 1, column: 4 })).toBe(6);
    execute(
      createSetCellContentCommand(sheet.id, { row: 0, column: 4 }, { kind: "literal", value: 5 }),
    );
    expect(value(calculation, sheet.id, { row: 1, column: 4 })).toBe(10);
    execute(
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 3 },
        { kind: "formula", formula: { source: "=A1*3" } },
      ),
    );
    expect(value(calculation, sheet.id, { row: 1, column: 4 })).toBe(15);
  });

  test("holds SIMTABLE results in manual mode until explicit recalculation", () => {
    const { session, sheet, request } = fixture();
    executeWorkbookCommand(session, createDataTableCommand(session.workbook, request));
    const calculation = createWorkbookCalculationSession(session.workbook);
    expect(value(calculation, sheet.id, { row: 1, column: 4 })).toBe(6);

    calculation.prepareMutation("manual");
    executeWorkbookCommand(
      session,
      createSetWorkbookCalculationCommand(session.workbook, { mode: "manual" }),
    );
    calculation.invalidate();
    calculation.prepareMutation();
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 0, column: 4 }, { kind: "literal", value: 5 }),
    );
    calculation.invalidate();

    expect(value(calculation, sheet.id, { row: 1, column: 4 })).toBe(6);
    calculation.recalculate();
    expect(value(calculation, sheet.id, { row: 1, column: 4 })).toBe(10);
  });

  test("round trips dynamic SIMTABLE sources through JSON", () => {
    const { session, request } = fixture();
    executeWorkbookCommand(session, createDataTableCommand(session.workbook, request));

    const restored = deserializeWorkbook(serializeWorkbook(session.workbook));
    const restoredSheet = getActiveSheet(restored);
    expect(getCellContent(restoredSheet, { row: 1, column: 4 })).toMatchObject({
      kind: "formula",
      formula: { source: "=SIMTABLE($D$2,$A$1,$E$1)" },
    });
    expect(
      createWorkbookEvaluator(restored, restoredSheet.id).getComputedValue({ row: 1, column: 4 }),
    ).toBe(6);
  });

  test("applies its generated cells atomically through undo and redo", () => {
    const { session, sheet, request } = fixture();
    const before = serializeWorkbook(session.workbook);
    expect(executeWorkbookCommand(session, createDataTableCommand(session.workbook, request))).toBe(
      true,
    );
    const applied = serializeWorkbook(session.workbook);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(applied);
    expect(getCellContent(sheet, { row: 1, column: 4 })?.kind).toBe("formula");
  });

  test("terminates a table cycle with a typed formula error", () => {
    const { session, sheet, request } = fixture();
    putFormula(sheet, 1, 3, "=E2+1");
    executeWorkbookCommand(session, createDataTableCommand(session.workbook, request));

    expect(
      createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({ row: 1, column: 4 }),
    ).toEqual({ kind: "formula-error", code: "CYCLE" });
  });

  test("uses the trial input when the base formula currently returns DIV0", () => {
    const { session, sheet, request } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 0 });
    setCellContent(sheet, { row: 0, column: 4 }, { kind: "literal", value: 2 });
    putFormula(sheet, 1, 3, "=10/A1");

    expect(
      createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({ row: 1, column: 3 }),
    ).toEqual({ kind: "formula-error", code: "DIV0" });
    expect(previewDataTable(session.workbook, request)).toMatchObject({
      ok: true,
      values: [[5, 2.5]],
    });
    executeWorkbookCommand(session, createDataTableCommand(session.workbook, request));
    expect(
      createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({ row: 1, column: 4 }),
    ).toBe(5);
  });
});
