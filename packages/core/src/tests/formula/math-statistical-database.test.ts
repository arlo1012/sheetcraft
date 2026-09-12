import { describe, expect, test } from "vitest";
import {
  createFormulaError,
  evaluateFormula,
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
  test("handles compatibility dispersion and rank boundaries", () => {
    expect(evaluateFormula("=AVEDEV(A1:A4)", formulas)).toBe(1);
    expect(evaluateFormula("=VAR(A1:A4)", formulas)).toBeCloseTo(1.6666667);
    expect(evaluateFormula("=PERCENTILE(A1:A4,0.25)", formulas)).toBe(1.75);
    expect(evaluateFormula("=QUARTILE(A1:A4,4)", formulas)).toBe(4);
    expect(evaluateFormula("=RANK(2,A1:A4)", formulas)).toBe(3);
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
