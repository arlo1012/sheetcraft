import { describe, expect, test } from "vitest";
import {
  collectFormulaReferences,
  MAX_FORMULA_COLUMNS,
  MAX_FORMULA_ROWS,
  transformFormulaForAxis,
  translateFormulaForCopy,
} from "../../formula/index.js";

describe("formula references", () => {
  test("collects references from ranges and scalar expressions in source order", () => {
    expect(collectFormulaReferences("=SUM(A1:B2) + C3")).toEqual([
      expect.objectContaining({ row: 0, column: 0 }),
      expect.objectContaining({ row: 1, column: 1 }),
      expect.objectContaining({ row: 2, column: 2 }),
    ]);
  });

  test("translates only relative copy coordinates and preserves unrelated source text", () => {
    const source = "=sum($A1 + B$2 + $C$3)  +  7";
    expect(translateFormulaForCopy(source, { row: 2, column: 4 })).toBe(
      "=sum($A3 + F$2 + $C$3)  +  7",
    );
  });

  test("turns an out-of-bounds copied range into a reference error", () => {
    expect(translateFormulaForCopy("=SUM(A1:B2)", { row: -1, column: 0 })).toBe("=SUM(#REF!)");
  });

  test("updates references for inserted and deleted axes", () => {
    expect(
      transformFormulaForAxis("=SUM(A2:B3) + C4", {
        axis: "row",
        operation: "insert",
        index: 1,
        count: 1,
      }),
    ).toBe("=SUM(A3:B4) + C5");
    expect(
      transformFormulaForAxis("=SUM(A2:B3) + C4", {
        axis: "row",
        operation: "delete",
        index: 2,
        count: 1,
      }),
    ).toBe("=SUM(A2:B2) + C3");
    expect(
      transformFormulaForAxis("=A1+$B$2+C3", {
        axis: "column",
        operation: "insert",
        index: 1,
        count: 2,
      }),
    ).toBe("=A1+$D$2+E3");
  });

  test("leaves an unparseable source intact during reference transformations", () => {
    expect(translateFormulaForCopy("=SUM(A1,)", { row: 1, column: 1 })).toBe("=SUM(A1,)");
  });

  test("validates row transform bounds and turns shifted final rows into reference errors", () => {
    expect(
      transformFormulaForAxis("=A1", {
        axis: "row",
        operation: "insert",
        index: MAX_FORMULA_COLUMNS,
        count: 1,
      }),
    ).toBe("=A1");
    expect(() =>
      transformFormulaForAxis("=A1", {
        axis: "row",
        operation: "insert",
        index: MAX_FORMULA_ROWS,
        count: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      transformFormulaForAxis("=A1", {
        axis: "row",
        operation: "delete",
        index: MAX_FORMULA_ROWS - 1,
        count: 2,
      }),
    ).toThrow(RangeError);
    expect(
      transformFormulaForAxis("=A1048576", {
        axis: "row",
        operation: "insert",
        index: MAX_FORMULA_ROWS - 1,
        count: 1,
      }),
    ).toBe("=#REF!");
  });

  test("validates column transform bounds and turns shifted final columns into reference errors", () => {
    expect(() =>
      transformFormulaForAxis("=A1", {
        axis: "column",
        operation: "insert",
        index: MAX_FORMULA_COLUMNS,
        count: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      transformFormulaForAxis("=A1", {
        axis: "column",
        operation: "delete",
        index: MAX_FORMULA_COLUMNS - 1,
        count: 2,
      }),
    ).toThrow(RangeError);
    expect(
      transformFormulaForAxis("=XFD1", {
        axis: "column",
        operation: "insert",
        index: MAX_FORMULA_COLUMNS - 1,
        count: 1,
      }),
    ).toBe("=#REF!");
  });
});
