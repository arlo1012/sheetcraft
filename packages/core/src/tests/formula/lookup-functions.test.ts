import { describe, expect, test } from "vitest";
import {
  evaluateFormula,
  type FormulaEvaluationResolver,
  type FormulaValue,
} from "../../formula/index.js";

function resolver(
  entries: readonly [string, FormulaValue][],
): FormulaEvaluationResolver {
  const cells = new Map(entries);
  return {
    resolveCell: ({ row, column }) => cells.get(`${row}:${column}`) ?? null,
    resolveRange: ({ start, end }) => {
      const values: FormulaValue[] = [];
      for (let row = start.row; row <= end.row; row += 1)
        for (let column = start.column; column <= end.column; column += 1)
          values.push(cells.get(`${row}:${column}`) ?? null);
      return values;
    },
  };
}
describe("LOOKUP array form", () => {
  test("uses the first and last columns in a tall two-argument array", () => {
    const formulas = resolver([
      ["0:0", 1],
      ["0:1", 10],
      ["1:0", 2],
      ["1:1", 20],
    ]);
    expect(evaluateFormula("=LOOKUP(2,A1:B2)", formulas)).toBe(20);
  });
  test("uses the first and last rows in a wide two-argument array", () => {
    const formulas = resolver([
      ["0:0", 1],
      ["0:1", 2],
      ["0:2", 3],
      ["1:0", 10],
      ["1:1", 20],
      ["1:2", 30],
    ]);
    expect(evaluateFormula("=LOOKUP(2,A1:C2)", formulas)).toBe(20);
  });
});
