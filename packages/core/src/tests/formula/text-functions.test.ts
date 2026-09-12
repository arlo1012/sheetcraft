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

describe("FIND and SEARCH character positions", () => {
  test("uses character coordinates consistently around astral Unicode characters", () => {
    expect(evaluateFormula('=FIND("a","🙂a",2)', resolver)).toBe(2);
    expect(evaluateFormula('=SEARCH("A","🙂a",2)', resolver)).toBe(2);
    expect(evaluateFormula('=FIND("a","🙂a",3)', resolver)).toEqual(createFormulaError("VALUE"));
    expect(evaluateFormula('=SEARCH("a","🙂a",3)', resolver)).toEqual(createFormulaError("VALUE"));
    expect(evaluateFormula('=FIND("🙂","a🙂",2)', resolver)).toBe(2);
  });

  test("propagates text errors and rejects positions outside the text", () => {
    expect(evaluateFormula('=FIND(#N/A,"value")', resolver)).toEqual(createFormulaError("NA"));
    expect(evaluateFormula('=SEARCH("a",#N/A)', resolver)).toEqual(createFormulaError("NA"));
    expect(evaluateFormula('=FIND("a","abc",4)', resolver)).toEqual(createFormulaError("VALUE"));
  });
});
