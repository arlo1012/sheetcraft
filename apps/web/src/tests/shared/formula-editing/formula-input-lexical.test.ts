import { describe, expect, test } from "vitest";
import {
  applyFunctionCompletion,
  cycleFormulaReferenceAbsoluteMarkers,
  getFormulaCompletionContext,
  getFormulaReferenceEditContext,
  getSupportedFormulaCandidates,
  replaceFormulaReference,
} from "../../../shared/formula-editing/formula-input-lexical";

function completion(value: string, start = value.length, end = start) {
  const context = getFormulaCompletionContext(value, start, end);
  expect(context).not.toBeNull();
  return context!;
}

describe("formula input lexical assistance", () => {
  test("offers Core-supported functions and applies a parenthesis", () => {
    const context = completion("=s");
    expect(getSupportedFormulaCandidates(context).map((item) => item.id)).toEqual(["SUM"]);
    expect(applyFunctionCompletion("=s", context, "SUM")).toEqual({ value: "=SUM(", caret: 5 });
    expect(getSupportedFormulaCandidates(completion("=i")).map((item) => item.id)).toEqual([
      "IF",
      "IFERROR",
    ]);
  });

  test("replaces a prefix in the middle or a whole selected identifier without duplicate parentheses", () => {
    const middle = completion("=SXM", 2);
    expect(applyFunctionCompletion("=SXM", middle, "SUM")).toEqual({ value: "=SUM(", caret: 5 });

    const selected = completion("=sum(A1)", 1, 4);
    expect(applyFunctionCompletion("=sum(A1)", selected, "SUM")).toEqual({
      value: "=SUM(A1)",
      caret: 4,
    });
  });

  test("finds nested argument context and avoids quoted text or arbitrary selections", () => {
    const nested = completion("=SUM(A1,s");
    expect(nested.argument).toEqual({ functionName: "SUM", index: 1 });
    expect(getFormulaCompletionContext('="s', 3, 3)).toBeNull();
    expect(getFormulaCompletionContext("=SUM", 1, 3)).toBeNull();
    expect(getFormulaCompletionContext("=S1", 2, 2)).toBeNull();
  });

  test("inserts and continuously replaces a reference range", () => {
    const context = getFormulaReferenceEditContext("=SUM(", 5, 5);
    expect(context).toEqual({ replaceStart: 5, replaceEnd: 5 });
    const start = replaceFormulaReference("=SUM(", context!, {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 0 },
    });
    expect(start.value).toBe("=SUM(A1");
    const updated = replaceFormulaReference(start.value, start.context, {
      start: { row: 0, column: 0 },
      end: { row: 1, column: 1 },
    });
    expect(updated.value).toBe("=SUM(A1:B2");
  });

  test("allows reference insertion after supported comparison and concatenation operators", () => {
    for (const operator of ["<", ">", "=", "&"]) {
      const value = `=A1${operator}`;
      expect(getFormulaReferenceEditContext(value, value.length, value.length)).toEqual({
        replaceStart: value.length,
        replaceEnd: value.length,
      });
    }
    expect(getFormulaReferenceEditContext('="A1"&', 6, 6)).toEqual({
      replaceStart: 6,
      replaceEnd: 6,
    });
  });

  test("formats reverse keyboard ranges in top-left to bottom-right order", () => {
    expect(
      replaceFormulaReference(
        "=SUM(",
        { replaceStart: 5, replaceEnd: 5 },
        {
          start: { row: 4, column: 2 },
          end: { row: 3, column: 1 },
        },
      ).value,
    ).toBe("=SUM(B4:C5");
  });

  test("allows an existing A1 range but rejects quoted text and closed-call insertion", () => {
    expect(getFormulaReferenceEditContext("=SUM(A1:B2)", 7, 7)).toEqual({
      replaceStart: 5,
      replaceEnd: 10,
    });
    expect(getFormulaReferenceEditContext('="A1"', 3, 3)).toBeNull();
    expect(getFormulaReferenceEditContext("=SUM(A1)", 8, 8)).toBeNull();
  });

  test("cycles absolute markers for every endpoint in a range", () => {
    const context = { replaceStart: 1, replaceEnd: 6 };
    expect(cycleFormulaReferenceAbsoluteMarkers("=A1:B2", context)).toMatchObject({
      value: "=$A$1:$B$2",
    });
    expect(
      cycleFormulaReferenceAbsoluteMarkers("=$A$1:$B$2", { replaceStart: 1, replaceEnd: 10 }),
    ).toMatchObject({
      value: "=A$1:B$2",
    });
    expect(
      cycleFormulaReferenceAbsoluteMarkers("=A$1:B$2", { replaceStart: 1, replaceEnd: 8 }),
    ).toMatchObject({
      value: "=$A1:$B2",
    });
    expect(
      cycleFormulaReferenceAbsoluteMarkers("=$A1:$B2", { replaceStart: 1, replaceEnd: 8 }),
    ).toMatchObject({
      value: "=A1:B2",
    });
  });
});
