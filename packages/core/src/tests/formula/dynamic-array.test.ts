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

  test("filters, sorts, and de-duplicates along the specified axis", () => {
    const filtered = evaluateFormulaRuntime("=FILTER({1,10;2,20;3,30},{TRUE;FALSE;TRUE})", resolver, { registry });
    expect(isFormulaArray(filtered) && filtered.rows).toEqual([[1, 10], [3, 30]]);
    const sorted = evaluateFormulaRuntime("=SORT({3,30;1,10;2,20},1,1)", resolver, { registry });
    expect(isFormulaArray(sorted) && sorted.rows).toEqual([[1, 10], [2, 20], [3, 30]]);
    const unique = evaluateFormulaRuntime("=UNIQUE({1;2;1;3})", resolver, { registry });
    expect(isFormulaArray(unique) && unique.rows).toEqual([[1], [2], [3]]);
  });

  test("broadcasts array expressions and range comparisons", () => {
    const sequence = evaluateFormulaRuntime("=SEQUENCE(3)*2", resolver, { registry });
    expect(isFormulaArray(sequence) && sequence.rows).toEqual([[2], [4], [6]]);
    const rangeResolver = {
      resolveCell: ({ row }: { row: number; column: number }) => row + 1,
      resolveRange: () => [],
    };
    const compared = evaluateFormulaRuntime("=A1:A3>1", rangeResolver, { registry });
    expect(isFormulaArray(compared) && compared.rows).toEqual([[false], [true], [true]]);
  });
});
