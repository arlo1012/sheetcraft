import { describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSheet,
  createWorkbook,
  getCellContent,
  getActiveSheet,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { previewFormulaInput } from "../../../modules/formula-tools/formula-value-preview";

function createPreviewWorkbook() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  const inputs = createSheet("Inputs", "inputs", createSequentialIdFactory());
  workbook.sheets.set(inputs.id, inputs);
  return { workbook, sheet, inputs };
}

describe("previewFormulaInput", () => {
  test("evaluates a draft against cells on another worksheet", () => {
    const { workbook, sheet, inputs } = createPreviewWorkbook();
    setCellContent(inputs, { row: 0, column: 0 }, { kind: "literal", value: 40 });

    expect(previewFormulaInput(workbook, sheet.id, { row: 0, column: 1 }, "=Inputs!A1+2")).toBe(
      "42",
    );
  });

  test("overrides the target cell only in the preview shadow", () => {
    const { workbook, sheet } = createPreviewWorkbook();
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, { kind: "literal", value: 7 });

    expect(previewFormulaInput(workbook, sheet.id, address, "=1+2")).toBe("3");
    expect(getCellContent(sheet, address)).toEqual({
      kind: "literal",
      value: 7,
    });
  });

  test("reports a self reference and previews literals without mutating the workbook", () => {
    const { workbook, sheet } = createPreviewWorkbook();
    const address = { row: 0, column: 0 };

    expect(previewFormulaInput(workbook, sheet.id, address, "=A1")).toBe("#CYCLE!");
    expect(previewFormulaInput(workbook, sheet.id, address, "line one\nline two")).toBe(
      "line one\nline two",
    );
    expect(getCellContent(sheet, address)).toBeNull();
  });

  test("uses the target cell's text format just like the commit pipeline", () => {
    const { workbook, sheet } = createPreviewWorkbook();
    const address = { row: 0, column: 0 };
    setCellStyle(sheet, address, { numberFormat: { kind: "text" } });

    expect(previewFormulaInput(workbook, sheet.id, address, "=1+2")).toBe("=1+2");
    expect(getCellContent(sheet, address)).toBeNull();
  });
});
