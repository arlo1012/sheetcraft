import { describe, expect, test } from "vitest";
import {
  createFormulaError,
  evaluateFormula,
  type FormulaEvaluationResolver,
} from "../../formula/index.js";

const resolver: FormulaEvaluationResolver = {
  resolveCell: () => null,
  resolveRange: () => [],
};

describe("date function bounds", () => {
  test("returns formula errors for invalid normalized dates and time overflow", () => {
    expect(evaluateFormula("=DATE(10000,1,1)", resolver)).toEqual(createFormulaError("NUM"));
    expect(evaluateFormula("=DATE(9999,12,100000000000)", resolver)).toEqual(
      createFormulaError("NUM"),
    );
    expect(evaluateFormula("=TIME(-1,0,0)", resolver)).toEqual(createFormulaError("NUM"));
    expect(evaluateFormula("=TIME(1e308,0,0)", resolver)).toEqual(createFormulaError("NUM"));
    expect(evaluateFormula("=TIME(32768,0,0)", resolver)).toEqual(createFormulaError("NUM"));
  });

  test("rejects month shifts outside the workbook date range", () => {
    expect(evaluateFormula("=EDATE(DATE(9999,12,1),1)", resolver)).toEqual(
      createFormulaError("NUM"),
    );
    expect(evaluateFormula("=EOMONTH(DATE(1900,1,1),-2)", resolver)).toEqual(
      createFormulaError("NUM"),
    );
  });
});
