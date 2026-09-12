import { describe, expect, test } from "vitest";
import {
  createFormulaError,
  evaluateFormula,
  type FormulaEvaluationResolver,
  type FormulaValue,
} from "../../formula/index.js";

function resolver(entries: readonly [string, FormulaValue][] = []): FormulaEvaluationResolver {
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

describe("expanded formula functions", () => {
  test("evaluates lazy logical branches and boolean aggregates", () => {
    const formulas = resolver();
    expect(evaluateFormula("=AND(TRUE,1,FALSE)", formulas)).toBe(false);
    expect(evaluateFormula("=XOR(TRUE,TRUE,TRUE)", formulas)).toBe(true);
    expect(evaluateFormula("=IFS(FALSE,1,TRUE,2,TRUE,1/0)", formulas)).toBe(2);
    expect(evaluateFormula("=IFNA(#N/A,7)", formulas)).toBe(7);
    expect(evaluateFormula('=SWITCH("b","a",1,"b",2,0)', formulas)).toBe(2);
  });

  test("handles common rounding, arithmetic, and pairwise math", () => {
    const formulas = resolver([
      ["0:0", 2],
      ["0:1", 3],
      ["1:0", 4],
      ["1:1", 5],
    ]);
    expect(evaluateFormula("=ROUNDUP(-12.31,1)", formulas)).toBe(-12.4);
    expect(evaluateFormula("=ROUNDDOWN(-12.39,1)", formulas)).toBe(-12.3);
    expect(evaluateFormula("=MOD(-3,2)", formulas)).toBe(1);
    expect(evaluateFormula("=CEILING(4.3,2)", formulas)).toBe(6);
    expect(evaluateFormula("=FLOOR(4.3,2)", formulas)).toBe(4);
    expect(evaluateFormula("=SUMPRODUCT(A1:B2,A1:B2)", formulas)).toBe(54);
  });

  test("evaluates conditional aggregation with comparisons and wildcards", () => {
    const formulas = resolver([
      ["0:0", "apple"],
      ["1:0", "apricot"],
      ["2:0", "berry"],
      ["0:1", 2],
      ["1:1", 3],
      ["2:1", 5],
      ["0:2", "x"],
      ["1:2", "x"],
      ["2:2", "y"],
    ]);
    expect(evaluateFormula('=COUNTIF(A1:A3,"ap*")', formulas)).toBe(2);
    expect(evaluateFormula('=SUMIF(A1:A3,"ap*",B1:B3)', formulas)).toBe(5);
    expect(evaluateFormula('=SUMIFS(B1:B3,A1:A3,"ap*",C1:C3,"x")', formulas)).toBe(5);
    expect(evaluateFormula('=AVERAGEIF(B1:B3,">2")', formulas)).toBe(4);
  });

  test("implements information and two-dimensional lookup functions", () => {
    const formulas = resolver([
      ["0:0", "key"],
      ["0:1", "one"],
      ["0:2", "two"],
      ["1:0", "a"],
      ["1:1", 10],
      ["1:2", 20],
      ["2:0", "b"],
      ["2:1", 30],
      ["2:2", 40],
    ]);
    expect(evaluateFormula("=ISERR(#DIV/0!)", formulas)).toBe(true);
    expect(evaluateFormula("=INDEX(B2:C3,2,1)", formulas)).toBe(30);
    expect(evaluateFormula('=MATCH("b",A2:A3,0)', formulas)).toBe(2);
    expect(evaluateFormula('=VLOOKUP("b",A2:C3,3,FALSE)', formulas)).toBe(40);
    expect(evaluateFormula('=HLOOKUP("two",A1:C3,3,FALSE)', formulas)).toBe(40);
    expect(evaluateFormula('=XLOOKUP("b",A2:A3,B2:B3,"none")', formulas)).toBe(30);
    expect(evaluateFormula('=XLOOKUP("z",A2:A3,B2:B3,"none")', formulas)).toBe("none");
    expect(evaluateFormula("=NA()", formulas)).toEqual(createFormulaError("NA"));
  });
});
