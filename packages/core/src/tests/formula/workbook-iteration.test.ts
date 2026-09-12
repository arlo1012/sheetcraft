import { describe, expect, test } from "vitest";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
  type Sheet,
} from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

const formula = (sheet: Sheet, row: number, column: number, source: string) =>
  setCellContent(sheet, { row, column }, { kind: "formula", formula: { source } });

describe("workbook iterative calculation", () => {
  test("retains cycle errors unless iteration is enabled", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    formula(sheet, 0, 0, "=(A1+10)/2");
    expect(
      createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 0, column: 0 }),
    ).toMatchObject({ code: "CYCLE" });
    workbook.calculation = { ...workbook.calculation, iterative: true, maxChange: 0.000001 };
    expect(
      createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 0, column: 0 }),
    ).toBeCloseTo(10, 5);
  });

  test("recalculates dependent formulas and acyclic bridges between cycles", () => {
    const workbook = createTestWorkbook();
    workbook.calculation = { ...workbook.calculation, iterative: true, maxChange: 0.000001 };
    const sheet = getActiveSheet(workbook);
    formula(sheet, 0, 0, "=(A1+10)/2");
    formula(sheet, 0, 1, "=A1+1");
    formula(sheet, 0, 2, "=(C1+B1)/2");
    formula(sheet, 0, 3, "=C1*2");
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 0, column: 3 })).toBeCloseTo(22, 4);
    expect(evaluator.getComputedValue({ row: 0, column: 1 })).toBeCloseTo(11, 5);
  });

  test("iterates across sheets and resolves ranges and names in each pass", () => {
    const workbook = createTestWorkbook();
    workbook.calculation = { ...workbook.calculation, iterative: true, maxChange: 0.000001 };
    const sheet = getActiveSheet(workbook),
      data = createSheet("Data", "data");
    insertSheet(workbook, data);
    workbook.definedNames.set("total", {
      id: "total",
      name: "Total",
      reference: { sheetId: sheet.id, start: { row: 0, column: 0 }, end: { row: 0, column: 1 } },
    });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: 10 });
    formula(sheet, 0, 0, "=Data!A1");
    formula(data, 0, 0, "=SUM(Total)/2");
    expect(
      createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 0, column: 0 }),
    ).toBeCloseTo(10, 5);
  });

  test("stops at the iteration cap and keeps lazy conditions", () => {
    const workbook = createTestWorkbook();
    workbook.calculation = { ...workbook.calculation, iterative: true, maxIterations: 3 };
    const sheet = getActiveSheet(workbook);
    formula(sheet, 0, 0, "=A1+1");
    formula(sheet, 0, 1, "=IF(FALSE,B1,7)");
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 0, column: 0 })).toBe(3);
    expect(evaluator.getComputedValue({ row: 0, column: 1 })).toBe(7);
  });
});
