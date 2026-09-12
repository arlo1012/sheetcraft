import { describe, expect, test } from "vitest";
import { createFormulaError, evaluateFormula, type FormulaEvaluationResolver, type FormulaValue } from "../../formula/index.js";
import { createTestWorkbook } from "../helpers.js";
import { createSheetEvaluator, getActiveSheet, setCellContent } from "../../workbook.js";

function resolver(entries: readonly [string, FormulaValue][]): FormulaEvaluationResolver {
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

describe("formula function regressions", () => {
  test("keeps extreme arithmetic finite and calculates stable statistical means", () => {
    const formulas = resolver([]);
    expect(evaluateFormula("=TRUNC(123,-400)", formulas)).toBe(0);
    expect(evaluateFormula("=MOD(1e308,1e-308)", formulas)).not.toEqual(Infinity);
    expect(evaluateFormula("=AVERAGE(1e308,1e308)", formulas)).toBe(1e308);
    expect(evaluateFormula("=MEDIAN(1e308,1e308)", formulas)).toBe(1e308);
    expect(evaluateFormula("=SUMIF(A1:A2,\">0\",B1:B2)", resolver([["0:0", 1], ["1:0", 1], ["0:1", 1e308], ["1:1", 1e308]]))).toEqual(createFormulaError("NUM"));
  });

  test("uses Excel wildcards for exact MATCH, XLOOKUP, and negated COUNTIF criteria", () => {
    const formulas = resolver([["0:0", "apple"], ["1:0", "a*"], ["2:0", "berry"], ["0:1", 10], ["1:1", 20], ["2:1", 30], ["0:3", 1], ["1:3", 3], ["2:3", 5], ["0:4", 10], ["1:4", 30], ["2:4", 50], ["0:5", 5], ["1:5", 3], ["2:5", 1], ["0:6", 50], ["1:6", 30], ["2:6", 10]]);
    expect(evaluateFormula('=MATCH("ap*",A1:A3,0)', formulas)).toBe(1);
    expect(evaluateFormula('=MATCH("a~*",A1:A3,0)', formulas)).toBe(2);
    expect(evaluateFormula('=XLOOKUP("ap*",A1:A3,B1:B3,"missing",2)', formulas)).toBe(10);
    expect(evaluateFormula('=COUNTIF(A1:A3,"<>ap*")', formulas)).toBe(2);
    expect(evaluateFormula('=XLOOKUP(4,D1:D3,E1:E3,"missing",-1,2)', formulas)).toBe(30);
    expect(evaluateFormula('=XLOOKUP(4,F1:F3,G1:G3,"missing",1,-2)', formulas)).toBe(50);
  });

  test("anchors unequal SUMIF and AVERAGEIF value ranges at their top left", () => {
    const formulas = resolver([["0:0", 1], ["1:0", 1], ["0:1", 10], ["1:1", 20]]);
    expect(evaluateFormula('=SUMIF(A1:A2,">0",B1)', formulas)).toBe(30);
    expect(evaluateFormula('=AVERAGEIF(A1:A2,">0",B1)', formulas)).toBe(15);
  });

  test("rejects incomplete IFS pairs and ignores unreachable SWITCH cycles", () => {
    expect(evaluateFormula("=IFS(FALSE,1,FALSE)", resolver([]))).toEqual(createFormulaError("VALUE"));
    const sheet = getActiveSheet(createTestWorkbook());
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source: "=SWITCH(TRUE,TRUE,42,A1)" } });
    expect(createSheetEvaluator(sheet).getComputedValue({ row: 0, column: 0 })).toBe(42);
  });
});
