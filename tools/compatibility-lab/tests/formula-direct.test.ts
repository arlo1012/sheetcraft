import { createFormulaError, getFormulaFunctionMetadata } from "@sheetcraft/core/formula";
import { describe, expect, test } from "vitest";
import { evaluateFormulaProbe as evaluate } from "../src/probes/formula-adapter.js";

describe("public Core formula regression probes", () => {
  test("parses arithmetic and rounds ties away from zero", () => {
    expect(evaluate("=SUM(1,2,3)")).toBe(6);
    expect(evaluate("=1+2*3")).toBe(7);
    expect(evaluate("=ROUND(1.235,2)")).toBe(1.24);
    expect(evaluate("=ROUND(-1.235,2)")).toBe(-1.24);
  });

  test("uses case-insensitive criteria and range-aware aggregation", () => {
    expect(evaluate('=COUNTIF(A1:A3,"North")', [["North"], ["south"], ["NORTH"]])).toBe(2);
    expect(
      evaluate('=SUMIFS(A1:A3,B1:B3,"x")', [
        [10, "x"],
        [20, "y"],
        [30, "X"],
      ]),
    ).toBe(40);
    expect(
      evaluate("=SUM(A1:B2)", [
        [4, "text"],
        [6, true],
      ]),
    ).toBe(10);
    expect(evaluate('=MATCH("b",A1:A3,0)', [["a"], ["b"], ["c"]])).toBe(2);
  });

  test("evaluates only reachable branches and propagates typed errors", () => {
    expect(evaluate('=IF(FALSE,1/0,"right")')).toBe("right");
    expect(evaluate("=IF(TRUE,42,1/0)")).toBe(42);
    expect(evaluate('=IFERROR(1/0,"fallback")')).toBe("fallback");
    expect(evaluate("=NA()")).toEqual(createFormulaError("NA"));
    expect(evaluate("=SUM(A1:A2)", [[1], [createFormulaError("NA")]])).toEqual(
      createFormulaError("NA"),
    );
    expect(evaluate("=1/0")).toEqual(createFormulaError("DIV0"));
    expect(evaluate("=UNKNOWN(1)")).toEqual(createFormulaError("NAME"));
  });

  test("returns workbook-system date serials without shared global mode", () => {
    expect(evaluate("=DATE(2024,2,29)")).toBe(45351);
    expect(evaluate("=WORKDAY(DATE(2024,1,5),1)")).toBe(45299);
    expect(evaluate("=DATE(1904,1,2)", [], { dateSystem: "1904" })).toBe(1);
    expect(evaluate("=DATE(1904,1,2)", [], { dateSystem: "1900" })).toBe(1463);
    expect(evaluate("=DATE(1904,1,2)", [], { dateSystem: "1904" })).toBe(1);
  });

  test("evaluates representative financial and formatted-text formulas", () => {
    expect(evaluate("=PMT(0.1/12,12,1000)")).toBeCloseTo(-87.9159, 4);
    expect(evaluate('=TEXT(12.5,"0.00")')).toBe("12.50");
  });

  test("reports function metadata separately from compatibility evidence", () => {
    const names = getFormulaFunctionMetadata().map(({ name }) => name);
    expect(names.length).toBe(new Set(names).size);
    expect(names).toEqual(
      expect.arrayContaining([
        "SUM",
        "ROUND",
        "COUNTIF",
        "SUMIFS",
        "IF",
        "MATCH",
        "NA",
        "DATE",
        "WORKDAY",
        "PMT",
        "TEXT",
      ]),
    );
  });
});
