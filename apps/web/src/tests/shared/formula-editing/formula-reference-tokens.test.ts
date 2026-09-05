import { describe, expect, test } from "vitest";
import { completeFormulaForCommit } from "../../../shared/formula-editing/formula-commit";
import { getFormulaReferenceTokens } from "../../../shared/formula-editing/formula-reference-tokens";

describe("formula reference tokens", () => {
  test("finds all local references in incomplete formulas and reuses color for the same geometry", () => {
    const tokens = getFormulaReferenceTokens("=SUM(a1,$A$1,A1:B2)+C3");
    expect(tokens.map((token) => [token.text, token.colorIndex, token.key])).toEqual([
      ["a1", 0, "0:0-0:0"],
      ["$A$1", 0, "0:0-0:0"],
      ["A1:B2", 1, "0:0-1:1"],
      ["C3", 2, "2:2-2:2"],
    ]);
  });

  test("ignores strings, qualified references, names and cell-like substrings", () => {
    expect(getFormulaReferenceTokens("=\"A1\"+Sheet1!B2+'Sheet 2'!C3+TABLE[A1]+A1x+#REF!")).toEqual(
      [],
    );
  });

  test("does not scan non-formulas, quoted sheet names, or function identifiers", () => {
    expect(getFormulaReferenceTokens("A1+B2")).toEqual([]);
    expect(getFormulaReferenceTokens("='A1'!B2+LOG10(A1)+A1").map((token) => token.text)).toEqual([
      "A1",
      "A1",
    ]);
  });

  test("uses Core bounds and does not recognize adjacent names or structured references", () => {
    expect(
      getFormulaReferenceTokens("=XFD1048576+XFE1+A1048577+NameA1+A1Name+TABLE[A1]+名A1+A1名").map(
        (token) => token.text,
      ),
    ).toEqual(["XFD1048576"]);
  });

  test("retains a spaced range as one token and skips nested structured contents", () => {
    const tokens = getFormulaReferenceTokens("=SUM(A1 : B2)+LOG10 (C3)+TABLE[[A1 B2 C3]]+D4");
    expect(tokens.map((token) => token.text)).toEqual(["A1 : B2", "C3", "D4"]);
    expect(tokens[0]?.key).toBe("0:0-1:1");
  });
});

describe("formula commit completion", () => {
  test("closes only valid missing tail parentheses", () => {
    expect(completeFormulaForCommit("=SUM(B1:C2")).toBe("=SUM(B1:C2)");
    expect(completeFormulaForCommit("=SUM(SUM(A1),B1")).toBe("=SUM(SUM(A1),B1)");
    expect(completeFormulaForCommit("=SUM(A1)")).toBe("=SUM(A1)");
  });

  test("does not correct invalid formula parts or quoted parentheses", () => {
    expect(completeFormulaForCommit("=SUM(A1,")).toBe("=SUM(A1,");
    expect(completeFormulaForCommit("=SUM(A1)+")).toBe("=SUM(A1)+");
    expect(completeFormulaForCommit('=SUM("(')).toBe('=SUM("(');
    expect(completeFormulaForCommit("=SUM(A1))")).toBe("=SUM(A1))");
  });

  test("completes the outer call after a supported string literal without counting its parentheses", () => {
    expect(completeFormulaForCommit('=SUM("("')).toBe('=SUM("(")');
    expect(completeFormulaForCommit('=IF(TRUE,"text(","ok"')).toBe('=IF(TRUE,"text(","ok")');
  });
});
