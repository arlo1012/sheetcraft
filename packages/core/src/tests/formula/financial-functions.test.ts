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

describe("expanded financial functions", () => {
  test("solves rates and separates interest and principal payments", () => {
    expect(evaluateFormula("=RATE(12,-100,1000)", resolver)).toBeCloseTo(0.0292285, 6);
    expect(evaluateFormula("=IPMT(1%,1,12,1000)", resolver)).toBeCloseTo(-10, 8);
    expect(evaluateFormula("=PPMT(1%,1,12,1000)", resolver)).toBeCloseTo(-78.8488, 3);
  });

  test("solves the zero-rate limit and rejects unsolvable rates", () => {
    expect(evaluateFormula("=RATE(10,-100,1000)", resolver)).toBeCloseTo(0, 10);
    expect(evaluateFormula("=RATE(10,-100,1000,0,0,0)", resolver)).toBe(0);
    expect(evaluateFormula("=RATE(10,-110,1000)>0", resolver)).toBe(true);
    expect(evaluateFormula("=RATE(10,-90,1000)<0", resolver)).toBe(true);
    expect(evaluateFormula("=RATE(10,0,1000,1000)", resolver)).toEqual(createFormulaError("NUM"));
  });

  test("calculates periodic-return functions", () => {
    const cashflowResolver: FormulaEvaluationResolver = {
      resolveCell: ({ column }) => [-100, 60, 60][column] ?? null,
      resolveRange: () => [-100, 60, 60],
    };
    expect(evaluateFormula("=IRR(A1:C1)", cashflowResolver)).toBeCloseTo(0.130662, 5);
    expect(evaluateFormula("=MIRR(A1:C1,10%,12%)", cashflowResolver)).toBeCloseTo(0.12783, 4);
  });

  test("discounts dated cash flows", () => {
    const datedCashflowResolver: FormulaEvaluationResolver = {
      resolveCell: () => null,
      resolveRange: ({ start }) => (start.row === 0 ? [-1_000, 1_100] : [45292, 45657]),
    };
    expect(evaluateFormula("=XNPV(10%,A1:B1,A2:B2)", datedCashflowResolver)).toBeCloseTo(0, 8);
    expect(evaluateFormula("=XIRR(A1:B1,A2:B2)", datedCashflowResolver)).toBeCloseTo(0.1, 8);
  });

  test("normalizes valid date serials and rejects invalid dated cash flows", () => {
    const invalidDateResolver: FormulaEvaluationResolver = {
      resolveCell: () => null,
      resolveRange: ({ start }) => (start.row === 0 ? [-100, 110] : [10.9, 9.1]),
    };
    expect(evaluateFormula("=XNPV(10%,A1:B1,A2:B2)", invalidDateResolver)).toEqual(
      createFormulaError("NUM"),
    );
    expect(evaluateFormula("=XIRR(A1:B1,A2:B2)", invalidDateResolver)).toEqual(
      createFormulaError("NUM"),
    );
    const outOfRangeDateResolver: FormulaEvaluationResolver = {
      resolveCell: () => null,
      resolveRange: ({ start }) => (start.row === 0 ? [-100, 110] : [-1, 1]),
    };
    expect(evaluateFormula("=XNPV(10%,A1:B1,A2:B2)", outOfRangeDateResolver)).toEqual(
      createFormulaError("VALUE"),
    );
  });

  test("calculates common depreciation schedules", () => {
    expect(evaluateFormula("=SLN(1000,100,3)", resolver)).toBe(300);
    expect(evaluateFormula("=SYD(1000,100,3,1)", resolver)).toBe(450);
    expect(evaluateFormula("=DDB(1000,100,5,1)", resolver)).toBe(400);
  });

  test("accumulates interest and principal across payment periods", () => {
    expect(evaluateFormula("=CUMIPMT(1%,12,1000,1,1,0)", resolver)).toBeCloseTo(-10, 8);
    expect(evaluateFormula("=CUMPRINC(1%,12,1000,1,1,0)", resolver)).toBeCloseTo(-78.8488, 3);
  });
});
