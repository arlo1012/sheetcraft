import { describe, expect, test } from "vitest";
import {
  DEFAULT_FORMULA_FUNCTION_REGISTRY,
  createFormulaError,
  evaluateFormula,
  getFormulaFunctionMetadata,
  type FormulaEvaluationResolver,
  type FormulaFunctionRegistry,
  type FormulaValue,
} from "../../formula/index.js";

function resolver(values = new Map<string, FormulaValue>()): FormulaEvaluationResolver {
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

describe("formula runtime functions", () => {
  test("parses escaped strings, booleans, concatenation, and comparison precedence", () => {
    expect(evaluateFormula('="A""B"&TRUE&FALSE&1', resolver())).toBe('A"BTRUEFALSE1');
    expect(evaluateFormula("=1+2=3", resolver())).toBe(true);
    expect(evaluateFormula('="north"="NORTH"', resolver())).toBe(true);
    expect(evaluateFormula("=TRUE<>FALSE", resolver())).toBe(true);
  });

  test("evaluates only reachable IF and IFERROR arguments", () => {
    expect(evaluateFormula("=IF(FALSE,1/0,42)", resolver())).toBe(42);
    expect(evaluateFormula("=IF(TRUE,42,1/0)", resolver())).toBe(42);
    expect(evaluateFormula('=IFERROR(1/0,"fallback")', resolver())).toBe("fallback");
    expect(evaluateFormula("=IFERROR(42,1/0)", resolver())).toBe(42);
  });

  test("aggregates sparse range values and propagates typed errors", () => {
    const values = new Map<string, FormulaValue>([
      ["0:0", 4],
      ["0:1", "text"],
      ["1:0", 6],
      ["1:1", true],
    ]);
    const formulaResolver = resolver(values);
    expect(evaluateFormula("=SUM(A1:B2)", formulaResolver)).toBe(10);
    expect(evaluateFormula("=AVERAGE(A1:B2)", formulaResolver)).toBe(5);
    expect(evaluateFormula("=COUNT(A1:B2)", formulaResolver)).toBe(2);
    expect(evaluateFormula("=MIN(A1:B2)", formulaResolver)).toBe(4);
    expect(evaluateFormula("=MAX(A1:B2)", formulaResolver)).toBe(6);
    values.set("1:1", createFormulaError("NA"));
    expect(evaluateFormula("=SUM(A1:B2)", formulaResolver)).toEqual(createFormulaError("NA"));
  });

  test("distinguishes direct aggregate arguments from references and ranges", () => {
    const values = new Map<string, FormulaValue>([
      ["0:0", "3"],
      ["0:1", true],
      ["0:2", createFormulaError("NA")],
    ]);
    const formulaResolver = resolver(values);
    expect(evaluateFormula('=MIN(TRUE,"2")', formulaResolver)).toBe(1);
    expect(evaluateFormula('=MAX(TRUE,"2")', formulaResolver)).toBe(2);
    expect(evaluateFormula('=COUNT(TRUE,"2")', formulaResolver)).toBe(2);
    expect(evaluateFormula("=COUNT(A1:C1)", formulaResolver)).toBe(0);
    expect(evaluateFormula("=COUNT(#N/A,A1:C1)", formulaResolver)).toEqual(
      createFormulaError("NA"),
    );
    expect(evaluateFormula("=MIN(A1:B1)", formulaResolver)).toBe(0);
  });

  test("counts direct numeric text but ignores direct nonnumeric text and range errors", () => {
    const values = new Map<string, FormulaValue>([["0:0", createFormulaError("NA")]]);
    const formulaResolver = resolver(values);
    expect(evaluateFormula('=COUNT("2","text",TRUE)', formulaResolver)).toBe(2);
    expect(evaluateFormula("=COUNT(A1)", formulaResolver)).toBe(0);
    expect(evaluateFormula("=COUNT(#N/A)", formulaResolver)).toEqual(createFormulaError("NA"));
  });

  test("does not overflow unused aggregate totals", () => {
    expect(evaluateFormula("=COUNT(1e308,1e308)", resolver())).toBe(2);
    expect(evaluateFormula("=MIN(1e308,1e308)", resolver())).toBe(1e308);
    expect(evaluateFormula("=MAX(1e308,1e308)", resolver())).toBe(1e308);
  });

  test("rounds ties away from zero and rejects invalid numeric arguments", () => {
    expect(evaluateFormula("=ROUND(12.345,2)", resolver())).toBe(12.35);
    expect(evaluateFormula("=ROUND(-12.345,2)", resolver())).toBe(-12.35);
    expect(evaluateFormula("=ROUND(1.005,2)", resolver())).toBe(1.01);
    expect(evaluateFormula("=ROUND(-1.005,2)", resolver())).toBe(-1.01);
    expect(evaluateFormula("=ROUND(123,-2)", resolver())).toBe(100);
    expect(evaluateFormula("=ROUND(12.9,1.8)", resolver())).toBe(12.9);
    expect(evaluateFormula("=ROUND(1e308,-308)", resolver())).toBe(1e308);
    expect(evaluateFormula('=ROUND("12",1)', resolver())).toEqual(createFormulaError("VALUE"));
  });

  test("exposes stable runtime-neutral metadata and accepts a replacement registry", () => {
    expect(getFormulaFunctionMetadata().map((item) => item.name)).toEqual([
      "SUM",
      "IF",
      "IFERROR",
      "AVERAGE",
      "COUNT",
      "MIN",
      "MAX",
      "ROUND",
    ]);
    expect(getFormulaFunctionMetadata().find((item) => item.name === "IF")).toMatchObject({
      category: "Logical",
      minArgs: 2,
      maxArgs: 3,
      lazy: true,
      arguments: [
        { name: "logical_test" },
        { name: "value_if_true" },
        { name: "value_if_false", optional: true },
      ],
    });
    const registry: FormulaFunctionRegistry = {
      get: (name) =>
        name === "SUM"
          ? { metadata: DEFAULT_FORMULA_FUNCTION_REGISTRY.get("SUM")!.metadata, evaluate: () => 99 }
          : DEFAULT_FORMULA_FUNCTION_REGISTRY.get(name),
      list: () => DEFAULT_FORMULA_FUNCTION_REGISTRY.list(),
    };
    expect(evaluateFormula("=SUM(1,2)", resolver(), { registry })).toBe(99);
  });
});
