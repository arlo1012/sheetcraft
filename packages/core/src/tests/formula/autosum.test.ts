import { describe, expect, test } from "vitest";
import { createAutoSumFormula, createFormulaError, findAutoSumRange } from "../../formula/index.js";

function resolver(
  values: ReadonlyMap<string, number | string | ReturnType<typeof createFormulaError>>,
) {
  return ({ row, column }: { row: number; column: number }) =>
    values.get(`${row}:${column}`) ?? null;
}

describe("automatic sum", () => {
  test("prefers the contiguous numeric cells above the target", () => {
    const values = new Map<string, number>([
      ["1:2", 3],
      ["2:2", 4],
      ["3:2", 5],
      ["4:1", 99],
    ]);
    expect(findAutoSumRange({ row: 4, column: 2 }, resolver(values))).toEqual(
      expect.objectContaining({
        direction: "vertical",
        start: expect.objectContaining({ row: 1, column: 2 }),
        end: expect.objectContaining({ row: 3, column: 2 }),
      }),
    );
    expect(createAutoSumFormula({ row: 4, column: 2 }, resolver(values))).toBe("=SUM(C2:C4)");
  });

  test("falls back to the contiguous numeric cells to the left", () => {
    const values = new Map<string, number>([
      ["5:0", 1],
      ["5:1", 2],
      ["5:2", 3],
    ]);
    expect(createAutoSumFormula({ row: 5, column: 3 }, resolver(values))).toBe("=SUM(A6:C6)");
  });

  test("does not cross text, errors, or empty cells", () => {
    const values = new Map<string, number | string | ReturnType<typeof createFormulaError>>([
      ["2:0", 2],
      ["3:0", "text"],
      ["4:0", 4],
      ["5:0", createFormulaError("VALUE")],
    ]);
    expect(createAutoSumFormula({ row: 6, column: 0 }, resolver(values))).toBeNull();
    expect(createAutoSumFormula({ row: 5, column: 0 }, resolver(values))).toBe("=SUM(A5:A5)");
  });
});
