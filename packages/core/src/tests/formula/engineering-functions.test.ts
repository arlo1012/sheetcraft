import { describe, expect, test } from "vitest";
import {
  createFormulaError,
  evaluateFormula,
  type FormulaEvaluationResolver,
} from "../../formula/index.js";

const resolver: FormulaEvaluationResolver = { resolveCell: () => null, resolveRange: () => [] };

describe("engineering bit functions", () => {
  test("uses Excel's 48-bit unsigned integer domain", () => {
    expect(evaluateFormula("=BITAND(13,25)", resolver)).toBe(9);
    expect(evaluateFormula("=BITOR(13,25)", resolver)).toBe(29);
    expect(evaluateFormula("=BITXOR(13,25)", resolver)).toBe(20);
    expect(evaluateFormula("=BITLSHIFT(3,2)", resolver)).toBe(12);
    expect(evaluateFormula("=BITRSHIFT(12,2)", resolver)).toBe(3);
    expect(evaluateFormula("=BITAND(-1,1)", resolver)).toEqual(createFormulaError("NUM"));
  });

  test("compares engineering threshold helpers", () => {
    expect(evaluateFormula("=DELTA(2,2)", resolver)).toBe(1);
    expect(evaluateFormula("=GESTEP(2,3)", resolver)).toBe(0);
  });

  test("converts common compatible measurement units", () => {
    expect(evaluateFormula('=CONVERT(1,"km","m")', resolver)).toBe(1000);
    expect(evaluateFormula('=CONVERT(32,"F","C")', resolver)).toBeCloseTo(0, 10);
    expect(evaluateFormula('=CONVERT(1,"m","kg")', resolver)).toEqual(createFormulaError("NA"));
  });
});
