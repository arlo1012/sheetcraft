// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";

describe("Equation print source safety", () => {
  test("never silently print a blank page when a mathematical consumer is unavailable", () => {
    const sheet = createSheet("Equation only", "sheet");
    sheet.drawings = [
      createGraphicDrawing("equation", "equation", "Equation", { row: 50, column: 20 }),
    ];
    const before = JSON.stringify(sheet.drawings);
    expect(() =>
      createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) }),
    ).toThrow(/equation/i);
    expect(JSON.stringify(sheet.drawings)).toBe(before);
  });
  test("a workbook without equations retains its print path", () => {
    const sheet = createSheet("Empty", "sheet");
    expect(
      createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) }).pages.length,
    ).toBeGreaterThan(0);
  });
});
