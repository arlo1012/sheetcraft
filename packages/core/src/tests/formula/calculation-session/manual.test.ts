import { describe, expect, test } from "vitest";
import { createWorkbookCalculationSession } from "../../../formula/calculation-session.js";
import { createSetWorkbookCalculationCommand } from "../../../commands/workbook-settings.js";
import { createSetCellContentCommand } from "../../../commands/values.js";
import { applyWorkbookCommand } from "../../../commands/apply.js";
import type { WorkbookCommand } from "../../../commands/contracts.js";
import {
  createSheet,
  getActiveSheet,
  setCellContent,
  type CellAddress,
} from "../../../workbook.js";
import { createTestWorkbook } from "../../helpers.js";

function fixture() {
  const workbook = createTestWorkbook();
  const sheet = getActiveSheet(workbook);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
  setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1*3" } });
  const calculation = createWorkbookCalculationSession(workbook);
  const execute = (command: WorkbookCommand) => {
    calculation.prepareMutation(
      command.type === "setWorkbookCalculation" ? command.calculation.mode : undefined,
    );
    const inverse = applyWorkbookCommand(workbook, command);
    calculation.invalidate();
    return inverse;
  };
  const value = (address: CellAddress) =>
    calculation.getEvaluator(sheet.id).getComputedValue(address);
  return { workbook, sheet, calculation, execute, value };
}

describe("manual workbook calculation", () => {
  test("shows live literals but keeps previous formula values until recalculation", () => {
    const { workbook, sheet, calculation, execute, value } = fixture();
    expect(value({ row: 0, column: 1 })).toBe(6);
    execute(createSetWorkbookCalculationCommand(workbook, { mode: "manual" }));
    execute(
      createSetCellContentCommand(sheet.id, { row: 0, column: 0 }, { kind: "literal", value: 4 }),
    );
    expect(value({ row: 0, column: 0 })).toBe(4);
    expect(value({ row: 0, column: 1 })).toBe(6);
    calculation.recalculate();
    expect(value({ row: 0, column: 1 })).toBe(12);
    execute(
      createSetCellContentCommand(sheet.id, { row: 0, column: 0 }, { kind: "literal", value: 5 }),
    );
    expect(value({ row: 0, column: 1 })).toBe(12);
    execute(createSetWorkbookCalculationCommand(workbook, { mode: "automatic" }));
    expect(value({ row: 0, column: 1 })).toBe(15);
  });

  test("freezes unvisited cross-sheet formulas and evaluates new formulas against cached dependencies", () => {
    const { workbook, sheet, calculation, execute, value } = fixture();
    const other = createSheet("Data", "other");
    workbook.sheets.set(other.id, other);
    setCellContent(
      other,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: `='${sheet.name}'!B1+1` } },
    );
    execute(createSetWorkbookCalculationCommand(workbook, { mode: "manual" }));
    execute(
      createSetCellContentCommand(sheet.id, { row: 0, column: 0 }, { kind: "literal", value: 10 }),
    );
    expect(calculation.getEvaluator(other.id).getComputedValue({ row: 0, column: 0 })).toBe(7);
    execute(
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 2 },
        { kind: "formula", formula: { source: "=B1+Data!A1" } },
      ),
    );
    expect(value({ row: 0, column: 2 })).toBe(13);
    calculation.recalculate();
    expect(value({ row: 0, column: 2 })).toBe(61);
  });

  test("retains dynamic array shapes across manual edits and refreshes their spill values", () => {
    const { workbook, sheet, calculation, execute, value } = fixture();
    setCellContent(
      sheet,
      { row: 2, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(A1)" } },
    );
    execute(createSetWorkbookCalculationCommand(workbook, { mode: "manual" }));
    execute(
      createSetCellContentCommand(sheet.id, { row: 0, column: 0 }, { kind: "literal", value: 3 }),
    );
    expect(value({ row: 3, column: 0 })).toBe(2);
    expect(value({ row: 4, column: 0 })).toBeNull();
    calculation.recalculate();
    expect(value({ row: 4, column: 0 })).toBe(3);
    expect(sheet.cells.has("4:0")).toBe(false);
  });
});
