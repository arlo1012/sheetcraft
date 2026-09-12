import { describe, expect, test } from "vitest";
import {
  createFormulaError,
  evaluateFormula,
  type FormulaEvaluationResolver,
} from "../../formula/index.js";

const resolver: FormulaEvaluationResolver = {
  resolveCell: () => null,
  resolveRange: () => [],
};

describe("FIND and SEARCH character positions", () => {
  test("uses character coordinates consistently around astral Unicode characters", () => {
    expect(evaluateFormula('=FIND("a","🙂a",2)', resolver)).toBe(2);
    expect(evaluateFormula('=SEARCH("A","🙂a",2)', resolver)).toBe(2);
    expect(evaluateFormula('=FIND("a","🙂a",3)', resolver)).toEqual(createFormulaError("VALUE"));
    expect(evaluateFormula('=SEARCH("a","🙂a",3)', resolver)).toEqual(createFormulaError("VALUE"));
    expect(evaluateFormula('=FIND("🙂","a🙂",2)', resolver)).toBe(2);
  });

  test("propagates text errors and rejects positions outside the text", () => {
    expect(evaluateFormula('=FIND(#N/A,"value")', resolver)).toEqual(createFormulaError("NA"));
    expect(evaluateFormula('=SEARCH("a",#N/A)', resolver)).toEqual(createFormulaError("NA"));
    expect(evaluateFormula('=FIND("a","abc",4)', resolver)).toEqual(createFormulaError("VALUE"));
  });
});

describe("expanded text conversion functions", () => {
  test("converts legacy character codes and Unicode code points", () => {
    expect(evaluateFormula("=CHAR(65)", resolver)).toBe("A");
    expect(evaluateFormula('=CODE("A")', resolver)).toBe(65);
    expect(evaluateFormula("=UNICHAR(128578)", resolver)).toBe("🙂");
    expect(evaluateFormula('=UNICODE("🙂")', resolver)).toBe(128578);
    expect(evaluateFormula("=CHAR(0)", resolver)).toEqual(createFormulaError("VALUE"));
  });

  test("parses explicit decimal and group separators", () => {
    expect(evaluateFormula('=NUMBERVALUE("1.234,5",",",".")', resolver)).toBe(1234.5);
    expect(evaluateFormula('=NUMBERVALUE("not a number")', resolver)).toEqual(
      createFormulaError("VALUE"),
    );
  });

  test("formats fixed decimal and currency text", () => {
    expect(evaluateFormula("=DOLLAR(-1234.567,2)", resolver)).toBe("($1,234.57)");
    expect(evaluateFormula("=FIXED(1234.567,1,TRUE)", resolver)).toBe("1234.6");
    expect(evaluateFormula("=FIXED(1234.567,-2)", resolver)).toBe("1,200");
  });

  test("extracts text around selected delimiters", () => {
    expect(evaluateFormula('=TEXTBEFORE("a-b-c","-",2)', resolver)).toBe("a-b");
    expect(evaluateFormula('=TEXTAFTER("a-b-c","-",-1)', resolver)).toBe("c");
    expect(evaluateFormula('=TEXTBEFORE("Alpha","a",1,1)', resolver)).toBe("");
    expect(evaluateFormula('=TEXTAFTER("value","/",1,0,0,"none")', resolver)).toBe("none");
  });
});
