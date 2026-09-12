import { describe, expect, test } from "vitest";
import { evaluateFormulaRuntime } from "../../formula/evaluate.js";
import { DYNAMIC_ARRAY_FUNCTIONS } from "../../formula/functions/dynamic-array.js";
import { isFormulaArray } from "../../formula/runtime.js";
import type { FormulaFunctionRegistry } from "../../formula/functions/contracts.js";

const registry: FormulaFunctionRegistry = {
  get: (name) => DYNAMIC_ARRAY_FUNCTIONS.find((definition) => definition.metadata.name === name.toUpperCase()),
  list: () => DYNAMIC_ARRAY_FUNCTIONS.map((definition) => definition.metadata),
};
const resolver = { resolveCell: () => null, resolveRange: () => [] };

describe("dynamic array runtime", () => {
  test("parses arrays and evaluates SEQUENCE without changing scalar formula API", () => {
    const result = evaluateFormulaRuntime("=SEQUENCE(2,3,4,2)", resolver, { registry });
    expect(isFormulaArray(result) && result.rows).toEqual([[4, 6, 8], [10, 12, 14]]);
    const literal = evaluateFormulaRuntime("={1,2;3,4}", resolver, { registry });
    expect(isFormulaArray(literal) && literal.rows).toEqual([[1, 2], [3, 4]]);
  });

  test("transforms and combines dense array values", () => {
    const result = evaluateFormulaRuntime("=HSTACK(TAKE({1,2;3,4},1),{5;6})", resolver, { registry });
    expect(isFormulaArray(result) && result.rows).toEqual([
      [1, 2, 5],
      [expect.objectContaining({ code: "NA" }), expect.objectContaining({ code: "NA" }), 6],
    ]);
  });
});
