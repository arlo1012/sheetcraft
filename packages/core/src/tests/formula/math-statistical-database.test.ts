import { describe, expect, test } from "vitest";
import {
  createFormulaError,
  evaluateFormula,
  evaluateFormulaRuntime,
  type FormulaEvaluationResolver,
  type FormulaValue,
} from "../../formula/index.js";

function resolver(
  entries: readonly [string, FormulaValue][],
): FormulaEvaluationResolver {
  const values = new Map(entries);
  return {
    resolveCell: ({ row, column }) => values.get(`${row}:${column}`) ?? null,
    resolveRange: ({ start, end }) => {
      const result: FormulaValue[] = [];
      for (let row = start.row; row <= end.row; row += 1)
        for (let column = start.column; column <= end.column; column += 1)
          result.push(values.get(`${row}:${column}`) ?? null);
      return result;
    },
  };
}
describe("math, statistical, lookup, and database functions", () => {
  const formulas = resolver([
    ["0:0", 1],
    ["1:0", 2],
    ["2:0", 3],
    ["3:0", 4],
    ["0:1", "a"],
    ["1:1", "b"],
    ["2:1", "c"],
    ["0:3", "Item"],
    ["0:4", "Amount"],
    ["0:5", "Kind"],
    ["1:3", "a"],
    ["1:4", 10],
    ["1:5", "x"],
    ["2:3", "b"],
    ["2:4", 20],
    ["2:5", "x"],
    ["3:3", "a"],
    ["3:4", 30],
    ["3:5", "y"],
    ["0:7", "Item"],
    ["0:8", "Kind"],
    ["1:7", "a*"],
    ["1:8", "x"],
    ["2:7", "b"],
    ["2:8", "y"],
  ]);
  test("handles integer math and reference helpers", () => {
    expect(evaluateFormula("=GCD(12,18)", formulas)).toBe(6);
    expect(evaluateFormula("=LCM(6,8)", formulas)).toBe(24);
    expect(evaluateFormula("=COMBIN(5,2)", formulas)).toBe(10);
    expect(evaluateFormula("=SUMSQ(A1:A4)", formulas)).toBe(30);
    expect(evaluateFormula('=XMATCH("b",B1:B3,0)', formulas)).toBe(2);
    expect(evaluateFormula("=ADDRESS(2,28)", formulas)).toBe("$AB$2");
  });
  test("truncates integer-function operands and rejects unsafe GCD inputs", () => {
    expect(evaluateFormula("=GCD(5.9,2)", formulas)).toBe(1);
    expect(evaluateFormula("=LCM(5.9,2)", formulas)).toBe(10);
    expect(evaluateFormula("=FACT(5.9)", formulas)).toBe(120);
    expect(evaluateFormula("=COMBIN(5.9,2.1)", formulas)).toBe(10);
    expect(evaluateFormula("=GCD(9007199254740992,2)", formulas)).toEqual(
      createFormulaError("NUM"),
    );
  });
  test("handles trigonometry, exponential and logarithmic domains", () => {
    expect(evaluateFormula("=SIN(PI()/2)", formulas)).toBeCloseTo(1);
    expect(evaluateFormula("=COS(0)", formulas)).toBe(1);
    expect(evaluateFormula("=ATAN2(0,1)", formulas)).toBeCloseTo(Math.PI / 2);
    expect(evaluateFormula("=DEGREES(PI())", formulas)).toBeCloseTo(180);
    expect(evaluateFormula("=RADIANS(180)", formulas)).toBeCloseTo(Math.PI);
    expect(evaluateFormula("=LOG(8,2)", formulas)).toBe(3);
    expect(evaluateFormula("=LN(EXP(2))", formulas)).toBeCloseTo(2);
    expect(evaluateFormula("=ASIN(2)", formulas)).toEqual(
      createFormulaError("NUM"),
    );
    expect(evaluateFormula("=LOG(0)", formulas)).toEqual(
      createFormulaError("NUM"),
    );
  });
  test("flattens nested dynamic arrays in numeric aggregates", () => {
    const emptyResolver = { resolveCell: () => null, resolveRange: () => [] };
    expect(evaluateFormulaRuntime("=SUM(SEQUENCE(3))", emptyResolver)).toBe(6);
    expect(
      evaluateFormulaRuntime("=AVERAGE(SEQUENCE(2,2))", emptyResolver),
    ).toBe(2.5);
    expect(
      evaluateFormulaRuntime('=COUNT(SEQUENCE(2,2),"x")', emptyResolver),
    ).toBe(4);
    expect(evaluateFormulaRuntime("=MIN(SEQUENCE(2,2))", emptyResolver)).toBe(
      1,
    );
    expect(
      evaluateFormulaRuntime("=SUM(SEQUENCE(2),{3;4})", emptyResolver),
    ).toBe(10);
    expect(
      evaluateFormulaRuntime("=SUM(SEQUENCE(2),{3;#N/A})", emptyResolver),
    ).toEqual(createFormulaError("NA"));
  });
  test("calculates subtotal and aggregate reference operations", () => {
    expect(evaluateFormula("=SUBTOTAL(9,A1:A4)", formulas)).toBe(10);
    expect(evaluateFormula("=SUBTOTAL(1,A1:A4)", formulas)).toBe(2.5);
    expect(evaluateFormula("=AGGREGATE(9,6,{1;#N/A;3})", formulas)).toBe(4);
    expect(evaluateFormula("=AGGREGATE(4,6,{1;#N/A;3})", formulas)).toBe(3);
  });
  test("uses range visibility entries for subtotal and aggregate", () => {
    const visibilityResolver = {
      resolveCell: () => null,
      resolveRange: () => [1, 2, 3],
      resolveRangeEntries: () => [
        {
          address: { row: 0, column: 0 },
          value: 1,
          hidden: false,
          filtered: false,
          nestedSubtotal: false,
        },
        {
          address: { row: 1, column: 0 },
          value: 2,
          hidden: false,
          filtered: true,
          nestedSubtotal: false,
        },
        {
          address: { row: 2, column: 0 },
          value: 3,
          hidden: true,
          filtered: false,
          nestedSubtotal: false,
        },
      ],
    };
    expect(evaluateFormula("=SUBTOTAL(9,A1:A3)", visibilityResolver)).toBe(4);
    expect(evaluateFormula("=SUBTOTAL(109,A1:A3)", visibilityResolver)).toBe(1);
    expect(evaluateFormula("=AGGREGATE(9,5,A1:A3)", visibilityResolver)).toBe(
      1,
    );
  });

  test("handles compatibility dispersion and rank boundaries", () => {
    expect(evaluateFormula("=AVEDEV(A1:A4)", formulas)).toBe(1);
    expect(evaluateFormula("=VAR(A1:A4)", formulas)).toBeCloseTo(1.6666667);
    expect(evaluateFormula("=PERCENTILE(A1:A4,0.25)", formulas)).toBe(1.75);
    expect(evaluateFormula("=QUARTILE(A1:A4,4)", formulas)).toBe(4);
    expect(evaluateFormula("=RANK(2,A1:A4)", formulas)).toBe(3);
    expect(evaluateFormula("=QUARTILE.INC(A1:A4,1.9)", formulas)).toBe(1.75);
  });
  test("matches criteria rows with AND, OR, and wildcards", () => {
    expect(evaluateFormula('=DSUM(D1:F4,"Amount",H1:I3)', formulas)).toBe(10);
    expect(evaluateFormula("=DCOUNT(D1:F4,2,H1:I3)", formulas)).toBe(1);
    expect(evaluateFormula('=DGET(D1:F4,"Amount",H1:I3)', formulas)).toBe(10);
    expect(evaluateFormula('=DGET(D1:F4,"Amount",H1:H2)', formulas)).toEqual(
      createFormulaError("NUM"),
    );
    expect(evaluateFormula('=DVAR(D1:F4,"Amount",H1:H2)', formulas)).toBe(200);
  });
});
