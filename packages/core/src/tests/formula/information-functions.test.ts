import { describe, expect, test } from "vitest";
import { createFormulaError, evaluateFormula } from "../../formula/index.js";

const resolver = { resolveCell: () => null, resolveRange: () => [] };

describe("information parity functions", () => {
  test("truncates numbers but rejects text", () => {
    expect(evaluateFormula("=ISEVEN(2.9)", resolver)).toBe(true);
    expect(evaluateFormula("=ISODD(-3.9)", resolver)).toBe(true);
    expect(evaluateFormula('=ISEVEN("x")', resolver)).toEqual(createFormulaError("VALUE"));
    expect(evaluateFormula('=ISODD("x")', resolver)).toEqual(createFormulaError("VALUE"));
  });
});
