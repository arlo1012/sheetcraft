import { describe, expect, test } from "vitest";
import { evaluateFormulaRuntime } from "../../formula/evaluate.js";
import { DYNAMIC_ARRAY_FUNCTIONS } from "../../formula/functions/dynamic-array.js";
import { DEFAULT_FORMULA_FUNCTION_REGISTRY } from "../../formula/functions.js";
import { isFormulaArray } from "../../formula/runtime.js";
import type { FormulaFunctionRegistry } from "../../formula/functions/contracts.js";

const registry: FormulaFunctionRegistry = {
  get: (name) =>
    DYNAMIC_ARRAY_FUNCTIONS.find((definition) => definition.metadata.name === name.toUpperCase()),
  list: () => DYNAMIC_ARRAY_FUNCTIONS.map((definition) => definition.metadata),
};
const resolver = { resolveCell: () => null, resolveRange: () => [] };

describe("dynamic array runtime", () => {
  test("parses arrays and evaluates SEQUENCE without changing scalar formula API", () => {
    const result = evaluateFormulaRuntime("=SEQUENCE(2,3,4,2)", resolver, {
      registry,
    });
    expect(isFormulaArray(result) && result.rows).toEqual([
      [4, 6, 8],
      [10, 12, 14],
    ]);
    const literal = evaluateFormulaRuntime("={1,2;3,4}", resolver, {
      registry,
    });
    expect(isFormulaArray(literal) && literal.rows).toEqual([
      [1, 2],
      [3, 4],
    ]);
    const omittedColumns = evaluateFormulaRuntime("=SEQUENCE(3,,2)", resolver, {
      registry,
    });
    expect(isFormulaArray(omittedColumns) && omittedColumns.rows).toEqual([[2], [3], [4]]);
  });

  test("transforms and combines dense array values", () => {
    const result = evaluateFormulaRuntime("=HSTACK(TAKE({1,2;3,4},1),{5;6})", resolver, {
      registry,
    });
    expect(isFormulaArray(result) && result.rows).toEqual([
      [1, 2, 5],
      [expect.objectContaining({ code: "NA" }), expect.objectContaining({ code: "NA" }), 6],
    ]);
  });

  test("filters, sorts, and de-duplicates along the specified axis", () => {
    const filtered = evaluateFormulaRuntime(
      "=FILTER({1,10;2,20;3,30},{TRUE;FALSE;TRUE})",
      resolver,
      { registry },
    );
    expect(isFormulaArray(filtered) && filtered.rows).toEqual([
      [1, 10],
      [3, 30],
    ]);
    const sorted = evaluateFormulaRuntime("=SORT({3,30;1,10;2,20},1,1)", resolver, { registry });
    expect(isFormulaArray(sorted) && sorted.rows).toEqual([
      [1, 10],
      [2, 20],
      [3, 30],
    ]);
    const unique = evaluateFormulaRuntime("=UNIQUE({1;2;1;3})", resolver, {
      registry,
    });
    expect(isFormulaArray(unique) && unique.rows).toEqual([[1], [2], [3]]);
  });

  test("broadcasts array expressions and range comparisons", () => {
    const sequence = evaluateFormulaRuntime("=SEQUENCE(3)*2", resolver, {
      registry,
    });
    expect(isFormulaArray(sequence) && sequence.rows).toEqual([[2], [4], [6]]);
    const rangeResolver = {
      resolveCell: ({ row }: { row: number; column: number }) => row + 1,
      resolveRange: () => [],
    };
    const compared = evaluateFormulaRuntime("=A1:A3>1", rangeResolver, {
      registry,
    });
    expect(isFormulaArray(compared) && compared.rows).toEqual([[false], [true], [true]]);
  });

  test("keeps array branches through IF and scalar aggregate functions", () => {
    const result = evaluateFormulaRuntime("=IF(SEQUENCE(3)>1,SEQUENCE(3)*10,0)", resolver, {
      registry: DEFAULT_FORMULA_FUNCTION_REGISTRY,
    });
    expect(isFormulaArray(result) && result.rows).toEqual([[0], [20], [30]]);
    expect(
      evaluateFormulaRuntime("=SUM(SEQUENCE(3))", resolver, {
        registry: DEFAULT_FORMULA_FUNCTION_REGISTRY,
      }),
    ).toBe(6);
  });

  test("passes dynamic array results to array-aware functions", () => {
    const result = evaluateFormulaRuntime("=INDEX(SEQUENCE(3,2),0,2)", resolver, {
      registry: DEFAULT_FORMULA_FUNCTION_REGISTRY,
    });
    expect(isFormulaArray(result) && result.rows).toEqual([[2], [4], [6]]);
  });
});
