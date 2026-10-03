import { describe, expect, test } from "vitest";
import {
  collectFormulaRanges,
  collectFormulaReferences,
  convertStructuredReferencesToA1,
  parseFormula,
  renameTableColumnReferences,
  renameTableReferences,
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

  test.each(["", "A1", "=", "=A0", "=A1:", "=1 + )"])(
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

  test("preserves omitted function argument positions", () => {
    const result = parseFormula("=DCOUNT(A1:B3,,D1:D2)");
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ast: expect.objectContaining({
          expression: expect.objectContaining({
            kind: "function",
            args: expect.arrayContaining([expect.objectContaining({ kind: "omitted" })]),
          }),
        }),
      }),
    );
  });

  test("parses dynamic-array spill references", () => {
    expect(parseFormula("=SUM(A1#)")).toEqual(
      expect.objectContaining({
        ok: true,
        ast: expect.objectContaining({
          expression: expect.objectContaining({
            args: [expect.objectContaining({ kind: "spill" })],
          }),
        }),
      }),
    );
  });

  test.each(["={A1,2}", "={SUM(A1),2}", "={{1},2}", "={1%}"])(
    "rejects non-constant array item %s",
    (source) => expect(parseFormula(source)).toEqual(expect.objectContaining({ ok: false })),
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

  test("parses dotted built-in function names", () => {
    expect(parseFormula("=CEILING.MATH(1.2)")).toEqual(expect.objectContaining({ ok: true }));
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

  test("parses Excel structured references without treating their contents as A1 text", () => {
    const result = parseFormula(
      "=SUM(Table1[Amount],Table1[[#Headers],[Amount]],Table1[[Column1]:[Column2]],[@[Unit Price]])",
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.ast.expression.kind !== "function") return;
    expect(result.ast.expression.args).toEqual([
      expect.objectContaining({
        kind: "structured-reference",
        reference: expect.objectContaining({
          tableName: "Table1",
          scope: "data",
          columns: [expect.objectContaining({ name: "Amount", start: 12, end: 18 })],
        }),
      }),
      expect.objectContaining({
        kind: "structured-reference",
        reference: expect.objectContaining({
          scope: "headers",
          columns: [expect.objectContaining({ name: "Amount" })],
        }),
      }),
      expect.objectContaining({
        kind: "structured-reference",
        reference: expect.objectContaining({
          scope: "data",
          columns: [
            expect.objectContaining({ name: "Column1" }),
            expect.objectContaining({ name: "Column2" }),
          ],
        }),
      }),
      expect.objectContaining({
        kind: "structured-reference",
        reference: expect.objectContaining({
          scope: "this-row",
          columns: [expect.objectContaining({ name: "Unit Price" })],
        }),
      }),
    ]);
  });

  test("rewrites table and table-column names only in structured-reference AST spans", () => {
    const source = '=SUM(Table1[Amount],"Table1[Amount]")';
    expect(renameTableReferences(source, "Table1", "Sales")).toBe(
      '=SUM(Sales[Amount],"Table1[Amount]")',
    );
    expect(renameTableColumnReferences(source, "Table1", "Amount", "Net Amount")).toBe(
      '=SUM(Table1[Net Amount],"Table1[Amount]")',
    );
  });

  test("converts only parsed structured references to their resolved A1 bounds", () => {
    const source = '=SUM(Table1[Amount],[@Amount],"Table1[Amount]")';
    expect(
      convertStructuredReferencesToA1(
        source,
        (reference, address) =>
          reference.tableName
            ? {
                sheetName: "Ledger 2026",
                start: { row: 1, column: 1 },
                end: { row: 3, column: 1 },
              }
            : address
              ? { start: { row: address.row, column: 1 }, end: { row: address.row, column: 1 } }
              : null,
        { row: 4, column: 2 },
      ),
    ).toBe("=SUM('Ledger 2026'!B2:B4,B5,\"Table1[Amount]\")");
    expect(
      convertStructuredReferencesToA1("=Missing[Amount]", () => null, { row: 0, column: 0 }),
    ).toBe("=#REF!");
    expect(
      convertStructuredReferencesToA1(
        "=SUM(Keep[Amount],Convert[Amount])",
        () => ({ start: { row: 1, column: 0 }, end: { row: 2, column: 0 } }),
        undefined,
        { shouldConvert: (reference) => reference.tableName === "Convert" },
      ),
    ).toBe("=SUM(Keep[Amount],A2:A3)");
  });
});
