import { describe, expect, test } from "vitest";
import {
  collectFormulaRanges,
  collectFormulaReferences,
  parseFormula,
} from "../../formula/index.js";

describe("formula parser", () => {
  test("parses arithmetic, parenthesized expressions, SUM, and mixed references", () => {
    const result = parseFormula("=SUM($A1:B$2, (C3 + 4) / 2)");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast.expression.kind).toBe("function");
    expect(collectFormulaReferences(result.ast)).toEqual([
      expect.objectContaining({ row: 0, column: 0, columnAbsolute: true, rowAbsolute: false }),
      expect.objectContaining({ row: 1, column: 1, columnAbsolute: false, rowAbsolute: true }),
      expect.objectContaining({ row: 2, column: 2, columnAbsolute: false, rowAbsolute: false }),
    ]);
    expect(collectFormulaRanges(result.ast)).toHaveLength(1);
  });

  test.each(["", "A1", "=", "=SUM(A1,)", "=A0", "=A1:", "=1 + )"])(
    "returns a stable parse error for %j",
    (source) => {
      const result = parseFormula(source);
      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code: "PARSE" }),
        }),
      );
    },
  );

  test("parses a reference error token written by structural transforms", () => {
    const result = parseFormula("=#REF! + 1");
    expect(result.ok).toBe(true);
  });

  test("parses boolean constants and their function forms", () => {
    expect(parseFormula("=TRUE").ok).toBe(true);
    expect(parseFormula("=FALSE()").ok).toBe(true);
    expect(parseFormula("=TRUE()").ok).toBe(true);
  });

  test("preserves exact source spans for parenthesized expressions and bare identifiers", () => {
    const parenthesized = parseFormula("= ( A1 )");
    expect(parenthesized).toEqual({
      ok: true,
      ast: expect.objectContaining({
        expression: expect.objectContaining({ kind: "reference", start: 2, end: 8 }),
      }),
    });

    const identifier = parseFormula("=UNKNOWN   ");
    expect(identifier).toEqual({
      ok: true,
      ast: expect.objectContaining({
        expression: { kind: "identifier", name: "UNKNOWN", start: 1, end: 8 },
      }),
    });
  });
});
