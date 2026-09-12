import { describe, expect, test } from "vitest";
import {
  evaluateFormula,
  type FormulaEvaluationResolver,
  type FormulaValue,
} from "../../formula/index.js";

function resolver(entries: readonly [string, FormulaValue][]): FormulaEvaluationResolver {
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

describe("database criteria", () => {
  const formulas = resolver([
    ["0:0", "Item"],
    ["0:1", "Amount"],
    ["1:0", "apple"],
    ["1:1", 10],
    ["2:0", "apricot"],
    ["2:1", 20],
    ["3:0", "banana"],
    ["3:1", 30],
    ["0:4", "Item"],
    ["1:4", "ap"],
  ]);
  test("uses bare text as a case-insensitive prefix criterion", () => {
    expect(evaluateFormula('=DSUM(A1:B4,"Amount",E1:E2)', formulas)).toBe(30);
    expect(
      evaluateFormula(
        '=DSUM(A1:B4,"Amount",E1:E2)',
        resolver([
          ["0:0", "Item"],
          ["0:1", "Amount"],
          ["1:0", "Apple"],
          ["1:1", 10],
          ["2:0", "Apricot"],
          ["2:1", 20],
          ["3:0", "banana"],
          ["3:1", 30],
          ["0:4", "Item"],
          ["1:4", "AP"],
        ]),
      ),
    ).toBe(30);
  });
  test("keeps explicit equality and wildcards distinct from prefix matching", () => {
    const exact = resolver([
      ["0:0", "Item"],
      ["0:1", "Amount"],
      ["1:0", "apple"],
      ["1:1", 10],
      ["2:0", "apricot"],
      ["2:1", 20],
      ["3:0", "banana"],
      ["3:1", 30],
      ["0:4", "Item"],
      ["1:4", "=ap"],
    ]);
    expect(evaluateFormula('=DSUM(A1:B4,"Amount",E1:E2)', exact)).toBe(0);
    const wildcard = resolver([
      ["0:0", "Item"],
      ["0:1", "Amount"],
      ["1:0", "apple"],
      ["1:1", 10],
      ["2:0", "apricot"],
      ["2:1", 20],
      ["3:0", "banana"],
      ["3:1", 30],
      ["0:4", "Item"],
      ["1:4", "ap*"],
    ]);
    expect(evaluateFormula('=DSUM(A1:B4,"Amount",E1:E2)', wildcard)).toBe(30);
  });
  test("treats blank criteria cells as unconstrained", () => {
    const blank = resolver([
      ["0:0", "Item"],
      ["0:1", "Amount"],
      ["1:0", "apple"],
      ["1:1", 10],
      ["2:0", "apricot"],
      ["2:1", 20],
      ["3:0", "banana"],
      ["3:1", 30],
      ["0:4", "Item"],
      ["1:4", ""],
    ]);
    expect(evaluateFormula('=DSUM(A1:B4,"Amount",E1:E2)', blank)).toBe(60);
    expect(evaluateFormula("=DCOUNT(A1:B4,,E1:E2)", formulas)).toBe(2);
    expect(evaluateFormula("=DCOUNTA(A1:B4,,E1:E2)", formulas)).toBe(2);
  });

  test("uses cell coordinates to preserve blank cells in sparse worksheet ranges", () => {
    const cells = new Map<string, FormulaValue>([
      ["0:0", "Item"],
      ["0:1", "Amount"],
      ["0:2", "Group"],
      ["1:0", "apple"],
      ["1:1", 10],
      ["1:2", "x"],
      ["2:0", "apricot"],
      ["2:1", 20],
      ["2:2", "y"],
      ["3:0", "banana"],
      ["3:1", 30],
      ["3:2", "x"],
      ["0:4", "Item"],
      ["0:5", "Group"],
      ["1:5", "x"],
    ]);
    const sparse = {
      resolveCell: ({ row, column }: { row: number; column: number }) =>
        cells.get(`${row}:${column}`) ?? null,
      resolveRange: () => [...cells.values()],
    };
    expect(evaluateFormula('=DSUM(A1:C4,"Amount",E1:F2)', sparse)).toBe(40);
    expect(evaluateFormula('=DCOUNT(A1:C4,"Amount",E1:F2)', sparse)).toBe(2);
    expect(evaluateFormula('=DCOUNTA(A1:C4,"Amount",E1:F2)', sparse)).toBe(2);
  });
});
