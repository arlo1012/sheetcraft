import { describe, expect, test } from "vitest";
import { createFormulaError, evaluateFormula, type ExcelDateSystem } from "../../formula/index.js";

const resolver = { resolveCell: () => null, resolveRange: () => [] };

/**
 * Fractional days and component bounds are documented by both vendors:
 * https://support.microsoft.com/en-us/excel/functions/hour-function
 * https://support.microsoft.com/en-us/excel/functions/minute-function
 * https://support.microsoft.com/en-us/excel/functions/second-function
 * https://www.wps.cn/learning/room/d/326896
 * The numeric-only input and nearest-millisecond decomposition remain Core's
 * explicitly bounded contract; this change does not add locale time-text parsing.
 */
describe("fractional serial time component extraction", () => {
  test.each(["1900", "1904"] as const)("preserves time in the %s date system", (dateSystem) => {
    expect(evaluateFormula("=HOUR(0.5)", resolver, { dateSystem })).toBe(12);
    expect(evaluateFormula("=HOUR(0.75)", resolver, { dateSystem })).toBe(18);
    expect(evaluateFormula("=MINUTE(0.53125)", resolver, { dateSystem })).toBe(45);
    expect(evaluateFormula("=SECOND(0.5003472222222223)", resolver, { dateSystem })).toBe(30);
    expect(evaluateFormula("=HOUR(1)", resolver, { dateSystem })).toBe(0);
    expect(evaluateFormula("=MINUTE(0)", resolver, { dateSystem })).toBe(0);
    expect(evaluateFormula("=SECOND(0)", resolver, { dateSystem })).toBe(0);
  });

  test.each([0, 60, 45292])("preserves 23:59:59.999 at serial day %s", (day) => {
    const serial = day + 86_399_999 / 86_400_000;
    for (const dateSystem of ["1900", "1904"] as const) {
      expect(evaluateFormula(`=HOUR(${serial})`, resolver, { dateSystem })).toBe(23);
      expect(evaluateFormula(`=MINUTE(${serial})`, resolver, { dateSystem })).toBe(59);
      expect(evaluateFormula(`=SECOND(${serial})`, resolver, { dateSystem })).toBe(59);
    }
  });

  test("accepts typed referenced serials with date and time components", () => {
    // 2024-01-01 16:30:25 in the 1900 system, independently assembled as day + seconds/day.
    const serial = 45292 + (16 * 3600 + 30 * 60 + 25) / 86400;
    const referenced = { resolveCell: () => serial, resolveRange: () => [serial] };
    expect(evaluateFormula("=HOUR($A$1)", referenced)).toBe(16);
    expect(evaluateFormula("=MINUTE(A1)", referenced)).toBe(30);
    expect(evaluateFormula("=SECOND(A1)", referenced)).toBe(25);
  });

  test.each(["HOUR", "MINUTE", "SECOND"])(
    "%s preserves existing input/error boundaries",
    (name) => {
      for (const dateSystem of ["1900", "1904"] as readonly ExcelDateSystem[]) {
        expect(evaluateFormula(`=${name}(-0.5)`, resolver, { dateSystem })).toEqual(
          createFormulaError("NUM"),
        );
        expect(evaluateFormula(`=${name}(99999999)`, resolver, { dateSystem })).toEqual(
          createFormulaError("NUM"),
        );
        expect(evaluateFormula(`=${name}(#N/A)`, resolver, { dateSystem })).toEqual(
          createFormulaError("NA"),
        );
        expect(evaluateFormula(`=${name}("0.5")`, resolver, { dateSystem })).toEqual(
          createFormulaError("VALUE"),
        );
      }
    },
  );

  test("calendar components retain their existing whole-day truncation", () => {
    // A fraction less than 0.5 ms before the next day must not change calendar extraction.
    expect(evaluateFormula("=YEAR(45291.999999999)", resolver)).toBe(2023);
    expect(evaluateFormula("=MONTH(45291.999999999)", resolver)).toBe(12);
    expect(evaluateFormula("=DAY(45291.999999999)", resolver)).toBe(31);
    expect(evaluateFormula("=DAY(60.999999999)", resolver)).toBe(29);
  });
});
