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

describe("date function bounds", () => {
  test("returns formula errors for invalid normalized dates and time overflow", () => {
    expect(evaluateFormula("=DATE(10000,1,1)", resolver)).toEqual(createFormulaError("NUM"));
    expect(evaluateFormula("=DATE(9999,12,100000000000)", resolver)).toEqual(
      createFormulaError("NUM"),
    );
    expect(evaluateFormula("=TIME(-1,0,0)", resolver)).toEqual(createFormulaError("NUM"));
    expect(evaluateFormula("=TIME(1e308,0,0)", resolver)).toEqual(createFormulaError("NUM"));
    expect(evaluateFormula("=TIME(32768,0,0)", resolver)).toEqual(createFormulaError("NUM"));
  });

  test("rejects month shifts outside the workbook date range", () => {
    expect(evaluateFormula("=EDATE(DATE(9999,12,1),1)", resolver)).toEqual(
      createFormulaError("NUM"),
    );
    expect(evaluateFormula("=EOMONTH(DATE(1900,1,1),-2)", resolver)).toEqual(
      createFormulaError("NUM"),
    );
  });

  test("uses a local clock when no deterministic clock is injected", () => {
    expect(typeof evaluateFormula("=TODAY()", resolver)).toBe("number");
    expect(typeof evaluateFormula("=NOW()", resolver)).toBe("number");
  });
});

describe("expanded date functions", () => {
  test("calculates business days, workdays, and week numbers", () => {
    expect(evaluateFormula("=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,7))", resolver)).toBe(5);
    expect(
      evaluateFormula("=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,7),DATE(2024,1,1))", resolver),
    ).toBe(4);
    expect(evaluateFormula("=WORKDAY(DATE(2024,1,5),1)", resolver)).toBe(45299);
    expect(evaluateFormula("=ISOWEEKNUM(DATE(2024,1,1))", resolver)).toBe(1);
    expect(evaluateFormula("=WEEKNUM(DATE(2024,1,1),21)", resolver)).toBe(1);
  });

  test("uses requested day count convention", () => {
    expect(evaluateFormula("=DAYS360(DATE(2024,1,31),DATE(2024,2,29))", resolver)).toBe(30);
    expect(evaluateFormula("=YEARFRAC(DATE(2024,1,1),DATE(2025,1,1),3)", resolver)).toBe(366 / 365);
  });

  test("supports custom workweek patterns", () => {
    expect(evaluateFormula("=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),11)", resolver)).toBe(
      6,
    );
    expect(
      evaluateFormula('=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),"0000011")', resolver),
    ).toBe(5);
    expect(evaluateFormula("=WORKDAY.INTL(DATE(2024,1,5),1,11)", resolver)).toBe(45297);
  });
});
