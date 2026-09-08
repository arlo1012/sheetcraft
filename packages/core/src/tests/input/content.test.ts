import { describe, expect, test } from "vitest";
import {
  formatCellContentForInput,
  formatComputedValueForDisplay,
  parseCellContent,
} from "../../input.js";

describe("cell content input", () => {
  test("keeps valid and invalid formula source verbatim", () => {
    expect(parseCellContent("=A1+1")).toEqual({ kind: "formula", formula: { source: "=A1+1" } });
    expect(parseCellContent("=SUM(")).toEqual({ kind: "formula", formula: { source: "=SUM(" } });
    expect(formatCellContentForInput(parseCellContent("=SUM("))).toBe("=SUM(");
  });

  test("uses blank and apostrophe literal input rules", () => {
    expect(parseCellContent("")).toBeNull();
    expect(parseCellContent("'=A1")).toEqual({ kind: "literal", value: "=A1" });
  });

  test("keeps text-formatted input literal while stripping one explicit apostrophe", () => {
    expect(parseCellContent("")).toBeNull();
    expect(parseCellContent("0012", { asText: true })).toEqual({ kind: "literal", value: "0012" });
    expect(parseCellContent("=A1+1", { asText: true })).toEqual({
      kind: "literal",
      value: "=A1+1",
    });
    expect(parseCellContent("'=A1+1", { asText: true })).toEqual({
      kind: "literal",
      value: "=A1+1",
    });
  });

  test.each(["=", "=A1", "'quoted"])("round trips literal %s", (value) => {
    const content = { kind: "literal" as const, value };
    expect(parseCellContent(formatCellContentForInput(content))).toEqual(content);
  });

  test("formats formula errors as spreadsheet tokens", () => {
    expect(formatComputedValueForDisplay({ kind: "formula-error", code: "DIV0" })).toBe("#DIV/0!");
    expect(formatComputedValueForDisplay({ kind: "formula-error", code: "PARSE" })).toBe("#PARSE!");
  });
});
