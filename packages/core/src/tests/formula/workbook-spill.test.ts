import { describe, expect, test } from "vitest";
import {
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  type Sheet,
} from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

const formula = (sheet: Sheet, row: number, column: number, source: string) =>
  setCellContent(sheet, { row, column }, { kind: "formula", formula: { source } });

describe("workbook spill references", () => {
  test("rejects circular dependencies on the formula's own projected cells", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    formula(sheet, 0, 0, "=SEQUENCE(2)+A2");
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 0, column: 0 })).toMatchObject({ code: "CYCLE" });
    expect(evaluator.getRuntimeValue!({ row: 0, column: 0 })).toMatchObject({ code: "CYCLE" });
    expect(evaluator.getComputedValue({ row: 1, column: 0 })).toBeNull();
  });
  test("includes projected cells in ranges and spill references regardless of read order", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    formula(sheet, 0, 0, "=SEQUENCE(3)");
    formula(sheet, 0, 2, "=SUM(A1:A3)");
    formula(sheet, 1, 2, "=SUM(A1#)");
    formula(sheet, 2, 2, "=SUM(A2:A3)");
    for (const row of [2, 1, 0])
      expect(createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row, column: 2 })).toBe(
        row === 2 ? 5 : 6,
      );
  });

  test("includes multiple array roots in a range and whole column", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    formula(sheet, 0, 0, "=SEQUENCE(2)");
    formula(sheet, 2, 1, "=SEQUENCE(2,,10)");
    formula(sheet, 0, 3, "=SUM(A1:B4)");
    formula(sheet, 1, 3, "=SUM(B:B)");
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 0, column: 3 })).toBe(24);
    expect(evaluator.getComputedValue({ row: 1, column: 3 })).toBe(21);
  });

  test("schedules both branches of mixed array conditions", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    formula(sheet, 0, 1, "=10+1");
    formula(sheet, 0, 2, "=20+2");
    formula(sheet, 0, 0, "=IF({TRUE;FALSE},B1,C1)");
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 0, column: 0 })).toBe(11);
    expect(evaluator.getComputedValue({ row: 1, column: 0 })).toBe(22);
  });

  test("reports blocked and merged spills through both scalar and runtime access", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    formula(sheet, 0, 0, "=SEQUENCE(2)");
    formula(sheet, 0, 2, "=SUM(A1#)");
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 9 });
    let evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 0, column: 2 })).toMatchObject({ code: "SPILL" });
    expect(evaluator.getRuntimeValue!({ row: 0, column: 0 })).toMatchObject({ code: "SPILL" });
    setCellContent(sheet, { row: 1, column: 0 }, null);
    sheet.mergedCells.push({ start: { row: 1, column: 0 }, end: { row: 1, column: 1 } });
    evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 0, column: 0 })).toMatchObject({ code: "SPILL" });
  });
});
