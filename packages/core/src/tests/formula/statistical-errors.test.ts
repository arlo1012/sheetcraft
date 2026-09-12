import { describe, expect, test } from "vitest";
import {
  createFormulaError,
  evaluateFormula,
  type FormulaEvaluationResolver,
  type FormulaValue,
} from "../../formula/index.js";

function resolver(values: ReadonlyMap<string, FormulaValue>): FormulaEvaluationResolver {
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

describe("statistical range errors", () => {
  test("propagates errors in LARGE and SMALL arrays", () => {
    const formulas = resolver(
      new Map<string, FormulaValue>([
        ["0:0", createFormulaError("DIV0")],
        ["1:0", 5],
      ]),
    );

    expect(evaluateFormula("=LARGE(A1:A2,1)", formulas)).toEqual(createFormulaError("DIV0"));
    expect(evaluateFormula("=SMALL(A1:A2,1)", formulas)).toEqual(createFormulaError("DIV0"));
  });

  test("propagates reference errors in RANK and rejects missing values", () => {
    const withError = resolver(
      new Map<string, FormulaValue>([
        ["0:0", createFormulaError("DIV0")],
        ["1:0", 5],
      ]),
    );
    expect(evaluateFormula("=RANK(5,A1:A2)", withError)).toEqual(createFormulaError("DIV0"));

    const values = resolver(
      new Map<string, FormulaValue>([
        ["0:0", 5],
        ["1:0", 3],
      ]),
    );
    expect(evaluateFormula("=RANK(7,A1:A2)", values)).toEqual(createFormulaError("NA"));
  });
});
