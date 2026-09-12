import { describe, expect, test } from "vitest";
import {
  createFormulaError,
  evaluateFormula,
  type FormulaEvaluationResolver,
  type FormulaValue,
} from "../../formula/index.js";

function resolver(values = new Map<string, FormulaValue>()): FormulaEvaluationResolver {
  return {
    resolveCell: ({ row, column }) => values.get(`${row}:${column}`) ?? null,
    resolveRange: ({ start, end }) => {
      const result: FormulaValue[] = [];
      for (let row = start.row; row <= end.row; row += 1)
        for (let column = start.column; column <= end.column; column += 1)
          result.push(values.get(`${row}:${column}`) ?? null);
      return result;
    },
  };
}

describe("formula text functions", () => {
  test("handles Unicode, scalar conversion, ranges, and argument errors", () => {
    const values = new Map<string, FormulaValue>([
      ["0:0", "one"],
      ["0:1", null],
      ["1:0", 3],
      ["1:1", true],
    ]);
    const sheet = resolver(values);
    expect(evaluateFormula('=LEN("🙂a")', sheet)).toBe(2);
    expect(evaluateFormula('=LEFT("abc",0)', sheet)).toBe("");
    expect(evaluateFormula('=RIGHT("abc",2)', sheet)).toBe("bc");
    expect(evaluateFormula('=MID("abc",0,1)', sheet)).toEqual(createFormulaError("VALUE"));
    expect(evaluateFormula("=CONCAT(A1:B2)", sheet)).toBe("one3TRUE");
    expect(evaluateFormula('=TEXTJOIN("-",TRUE,A1:B2)', sheet)).toBe("one-3-TRUE");
    expect(evaluateFormula('=SUBSTITUTE("a-a-a","a","x",2)', sheet)).toBe("a-x-a");
    expect(evaluateFormula('=FIND("A","a")', sheet)).toEqual(createFormulaError("VALUE"));
    expect(evaluateFormula('=SEARCH("A","a")', sheet)).toBe(1);
    expect(evaluateFormula('=TEXT(12.3,"0.00")', sheet)).toBe("12.30");
    expect(evaluateFormula('=VALUE(" ")', sheet)).toEqual(createFormulaError("VALUE"));
  });
});

describe("formula date functions", () => {
  test("honors serial systems, leap-day compatibility, and injected clocks", () => {
    const sheet = resolver();
    expect(evaluateFormula("=DATE(1900,2,29)", sheet)).toBe(60);
    expect(evaluateFormula("=DATE(2008,1,35)", sheet)).toBe(39482);
    expect(evaluateFormula("=EDATE(60,1)", sheet)).toBe(89);
    expect(evaluateFormula("=EOMONTH(DATE(2024,1,31),1)", sheet)).toBe(45351);
    expect(evaluateFormula("=WEEKDAY(60,2)", sheet)).toBe(3);
    expect(evaluateFormula("=TIME(25,60,60)", sheet)).toBeCloseTo(2 / 24);
    expect(
      evaluateFormula("=TODAY()", sheet, {
        now: () => ({
          year: 2024,
          month: 2,
          day: 29,
          hour: 12,
          minute: 30,
          second: 0,
          millisecond: 0,
        }),
      }),
    ).toBe(45351);
    expect(
      evaluateFormula("=NOW()", sheet, {
        dateSystem: "1904",
        now: () => ({
          year: 1904,
          month: 1,
          day: 1,
          hour: 6,
          minute: 0,
          second: 0,
          millisecond: 0,
        }),
      }),
    ).toBeCloseTo(0.25);
  });
});

describe("formula financial and engineering functions", () => {
  test("calculates annuities and rejects invalid signed-base values", () => {
    const sheet = resolver();
    expect(evaluateFormula("=PMT(5%/12,360,180000)", sheet)).toBeCloseTo(-966.279, 3);
    expect(evaluateFormula("=FV(1.5%/12,10,-200,-500)", sheet)).toBeCloseTo(2517.57, 2);
    expect(evaluateFormula("=NPER(3%/12,-150,2500)", sheet)).toBeCloseTo(17.05, 2);
    expect(evaluateFormula("=PV(0,10,-100)", sheet)).toBe(1000);
    expect(evaluateFormula("=PMT(1%,0,100)", sheet)).toEqual(createFormulaError("NUM"));
    expect(evaluateFormula("=BIN2DEC(1111111111)", sheet)).toBe(-1);
    expect(evaluateFormula("=DEC2BIN(-100)", sheet)).toBe("1110011100");
    expect(evaluateFormula("=DEC2BIN(-100,1)", sheet)).toBe("1110011100");
    expect(evaluateFormula('=HEX2DEC("FFFFFFFF5B")', sheet)).toBe(-165);
    expect(evaluateFormula("=DEC2HEX(100,4)", sheet)).toBe("0064");
    expect(evaluateFormula("=DEC2BIN(512)", sheet)).toEqual(createFormulaError("NUM"));
    expect(evaluateFormula('=BIN2DEC("102")', sheet)).toEqual(createFormulaError("NUM"));
  });
});
