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
      const valuesInRange: FormulaValue[] = [];
      for (let row = start.row; row <= end.row; row += 1) {
        for (let column = start.column; column <= end.column; column += 1) {
          valuesInRange.push(values.get(`${row}:${column}`) ?? null);
        }
      }
      return valuesInRange;
    },
  };
}

describe("formula evaluation", () => {
  test("evaluates arithmetic, references, ranges, parentheses, and SUM", () => {
    const values = new Map<string, number | string | null>([
      ["0:0", 2],
      ["1:0", 3],
      ["0:1", 5],
      ["1:1", "ignored by SUM"],
    ]);
    expect(evaluateFormula("=SUM(A1:B2) + (A1 * 2) - B1 / 5", resolver(values))).toBe(13);
  });

  test("delegates normalized range traversal to the evaluation resolver", () => {
    const bounds: unknown[] = [];
    const formulaResolver: FormulaEvaluationResolver = {
      resolveCell: () => null,
      resolveRange: (range) => {
        bounds.push(range);
        return [2, 3];
      },
    };

    expect(evaluateFormula("=SUM(B2:A1)", formulaResolver)).toBe(5);
    expect(bounds).toEqual([{ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }]);
  });

  test("SUM ignores nonnumeric scalar and range values while propagating errors", () => {
    const values = new Map<string, FormulaValue>([
      ["0:0", "text"],
      ["0:1", true],
      ["0:2", null],
      ["1:0", 2],
      ["1:1", createFormulaError("CYCLE")],
    ]);

    expect(evaluateFormula("=SUM(A1,B1,C1,A2)", resolver(values))).toBe(2);
    expect(evaluateFormula("=SUM(A1:B2)", resolver(values))).toEqual(createFormulaError("CYCLE"));
  });

  test("keeps deliberately omitted arguments as blank values at their original positions", () => {
    expect(evaluateFormula("=SUM(1,,2)", resolver(new Map()))).toBe(3);
    expect(evaluateFormula("=SUM(1,)", resolver(new Map()))).toBe(1);
  });

  test.each(["text", true] as const)(
    "returns VALUE when arithmetic receives %j from a scalar reference",
    (value) => {
      expect(evaluateFormula("=A1 + 1", resolver(new Map([["0:0", value]])))).toEqual(
        createFormulaError("VALUE"),
      );
    },
  );

  test("coerces a blank scalar reference to zero for arithmetic", () => {
    expect(evaluateFormula("=A1 + 1", resolver(new Map()))).toBe(1);
  });

  test("returns VALUE for non-finite literals, resolver values, arithmetic, and SUM totals", () => {
    const values = new Map<string, FormulaValue>([["0:0", Number.POSITIVE_INFINITY]]);

    expect(evaluateFormula("=1e999", resolver(values))).toEqual(createFormulaError("VALUE"));
    expect(evaluateFormula("=A1", resolver(values))).toEqual(createFormulaError("VALUE"));
    expect(evaluateFormula("=1e308 * 1e308", resolver(values))).toEqual(
      createFormulaError("VALUE"),
    );
    expect(evaluateFormula("=SUM(1e308, 1e308)", resolver(values))).toEqual(
      createFormulaError("VALUE"),
    );
  });

  test.each([
    ["=A1 / 0", "DIV0"],
    ["=A1 + B2", "VALUE"],
    ["=SUM(B2 + 1)", "VALUE"],
    ["=UNKNOWN(1)", "NAME"],
    ["=SUM(A1)", "CYCLE"],
    ["=#REF! + 1", "REF"],
  ] as const)("returns %s for %s", (source, code) => {
    const values = new Map<string, ReturnType<typeof createFormulaError> | number | string>([
      ["0:0", code === "CYCLE" ? createFormulaError("CYCLE") : 2],
      ["1:1", "not numeric"],
    ]);
    expect(evaluateFormula(source, resolver(values))).toEqual(createFormulaError(code));
  });
});
