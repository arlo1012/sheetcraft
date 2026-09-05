import { describe, expect, test } from "vitest";
import {
  createFormulaError,
  FORMULA_ERROR_TOKENS,
  formulaErrorCodeFromToken,
  isFormulaError,
  isFormulaErrorCode,
  type FormulaErrorCode,
} from "../../../formula/types.js";
import { evaluateFormula } from "../../../formula/evaluate.js";
import {
  formatCellContentForInput,
  formatComputedValueForDisplay,
  parseCellContent,
} from "../../../input.js";
import { createTestSheet } from "../../helpers.js";
import {
  getCellComputedValue,
  getCellContent,
  setCellContent,
  setCellValue,
} from "../../../workbook.js";
import { translateCellContentForCopy } from "../../../clipboard.js";

describe("formula value foundation", () => {
  test.each(Object.entries(FORMULA_ERROR_TOKENS))(
    "round-trips the %s error token independently of text",
    (code, token) => {
      const error = createFormulaError(code as FormulaErrorCode);
      const content = { kind: "error" as const, error };
      expect(formulaErrorCodeFromToken(token.toLowerCase())).toBe(code);
      expect(formatComputedValueForDisplay(error)).toBe(token);
      expect(parseCellContent(formatCellContentForInput(content))).toEqual(content);
      const literal = { kind: "literal" as const, value: token };
      expect(parseCellContent(formatCellContentForInput(literal))).toEqual(literal);
      const resolver = { resolveCell: () => null, resolveRange: () => [] };
      expect(evaluateFormula(`=${token}`, resolver)).toEqual(error);
      expect(evaluateFormula(`=SUM(1,${token})`, resolver)).toEqual(error);
    },
  );

  test("does not confuse null, explicit empty text, false, zero, or error-looking text", () => {
    const sheet = createTestSheet();
    const cases = [
      null,
      { kind: "literal", value: "" },
      { kind: "literal", value: false },
      { kind: "literal", value: 0 },
      { kind: "literal", value: "#N/A" },
      { kind: "error", error: createFormulaError("NA") },
    ] as const;
    cases.forEach((content, column) => {
      setCellContent(sheet, { row: 0, column }, content);
      expect(getCellContent(sheet, { row: 0, column })).toEqual(content);
      expect(parseCellContent(formatCellContentForInput(content))).toEqual(content);
    });
    expect(sheet.cells.size).toBe(5);
    expect(getCellComputedValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellComputedValue(sheet, { row: 0, column: 1 })).toBe("");
    // Legacy value API and an empty editor input still clear a cell.
    setCellValue(sheet, { row: 0, column: 1 }, "");
    expect(getCellContent(sheet, { row: 0, column: 1 })).toBeNull();
    expect(parseCellContent("")).toBeNull();
  });

  test("propagates and deep-clones typed errors through references and rich copy", () => {
    const sheet = createTestSheet();
    const content = { kind: "error" as const, error: createFormulaError("NUM") };
    setCellContent(sheet, { row: 0, column: 0 }, content);
    content.error.code = "NA";
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1+1" } });
    expect(getCellComputedValue(sheet, { row: 0, column: 1 })).toEqual(createFormulaError("NUM"));
    const copied = translateCellContentForCopy(
      getCellContent(sheet, { row: 0, column: 0 }),
      { row: 0, column: 0 },
      { row: 2, column: 3 },
    );
    expect(copied).toEqual({ kind: "error", error: createFormulaError("NUM") });
    if (copied?.kind === "error") copied.error.code = "REF";
    expect(getCellComputedValue(sheet, { row: 0, column: 0 })).toEqual(createFormulaError("NUM"));
  });

  test("rejects malformed error values and does not treat prototype names as codes", () => {
    for (const code of ["UNKNOWN", "toString", "__proto__", 0, null]) {
      expect(isFormulaErrorCode(code)).toBe(false);
      expect(isFormulaError({ kind: "formula-error", code })).toBe(false);
    }
    expect(isFormulaError({ kind: "formula-error" })).toBe(false);
    expect(formulaErrorCodeFromToken("#NAME!")).toBeNull();
    expect(formulaErrorCodeFromToken("#N/A!")).toBeNull();
    expect(() => createFormulaError("UNKNOWN" as FormulaErrorCode)).toThrow(TypeError);
  });
});
