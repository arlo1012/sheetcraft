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

describe("financial function payment type", () => {
  test.each(["FV", "PV", "PMT", "NPER"])("propagates an error in %s type", (name) => {
    const argumentsByFunction: Record<string, string> = {
      FV: "1%,12,-100,0,#N/A",
      PV: "1%,12,-100,0,#N/A",
      PMT: "1%,12,100,0,#N/A",
      NPER: "1%,-100,100,0,#N/A",
    };
    expect(evaluateFormula(`=${name}(${argumentsByFunction[name]})`, resolver)).toEqual(
      createFormulaError("NA"),
    );
  });

  test("keeps a non-0-or-1 payment type as a numeric error", () => {
    expect(evaluateFormula("=PMT(1%,12,100,0,2)", resolver)).toEqual(createFormulaError("NUM"));
  });
});
