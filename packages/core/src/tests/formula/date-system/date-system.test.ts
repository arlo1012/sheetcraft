import { describe, expect, test } from "vitest";
import {
  datePartsToExcelSerial,
  excelSerialToDateParts,
  normalizeExcelDateSystem,
  type ExcelDateParts,
} from "../../../formula/date-system.js";

const midnight = { hour: 0, minute: 0, second: 0, millisecond: 0 } as const;

function parts(
  year: number,
  month: number,
  day: number,
  time: Partial<ExcelDateParts> = {},
): ExcelDateParts {
  return { year, month, day, ...midnight, ...time };
}

describe("Excel date systems", () => {
  test("normalizes only declared date systems", () => {
    expect(normalizeExcelDateSystem("1900")).toBe("1900");
    expect(normalizeExcelDateSystem("1904")).toBe("1904");
    for (const value of ["1900 ", "1901", 1900, null, undefined]) {
      expect(() => normalizeExcelDateSystem(value)).toThrow(TypeError);
    }
  });

  test("preserves Excel's 1900 serial boundaries and fake leap day", () => {
    expect(excelSerialToDateParts(0, "1900")).toEqual(parts(1900, 1, 0));
    expect(excelSerialToDateParts(1, "1900")).toEqual(parts(1900, 1, 1));
    expect(excelSerialToDateParts(59, "1900")).toEqual(parts(1900, 2, 28));
    expect(excelSerialToDateParts(60, "1900")).toEqual(parts(1900, 2, 29));
    expect(excelSerialToDateParts(61, "1900")).toEqual(parts(1900, 3, 1));

    expect(datePartsToExcelSerial(parts(1900, 1, 0), "1900")).toBe(0);
    expect(datePartsToExcelSerial(parts(1900, 2, 29), "1900")).toBe(60);
    expect(datePartsToExcelSerial(parts(1900, 3, 1), "1900")).toBe(61);
  });

  test("keeps serial zero isolated to each declared system", () => {
    expect(excelSerialToDateParts(0, "1904")).toEqual(parts(1904, 1, 1));
    expect(datePartsToExcelSerial(parts(1904, 1, 1), "1904")).toBe(0);
    expect(datePartsToExcelSerial(parts(1904, 1, 1), "1900")).toBe(1462);
    expect(() => datePartsToExcelSerial(parts(1900, 1, 1), "1904")).toThrow(RangeError);
  });

  test("round-trips dates and time fractions at millisecond resolution", () => {
    const values = [
      ["1900", parts(1900, 1, 0, { hour: 12, minute: 34, second: 56, millisecond: 789 })],
      ["1900", parts(1900, 2, 29, { hour: 23, minute: 59, second: 59, millisecond: 999 })],
      ["1900", parts(2000, 2, 29, { hour: 1, minute: 2, second: 3, millisecond: 4 })],
      ["1900", parts(9999, 12, 31, { hour: 23, minute: 59, second: 59, millisecond: 999 })],
      ["1904", parts(1904, 1, 1, { hour: 12, minute: 34, second: 56, millisecond: 789 })],
      ["1904", parts(9999, 12, 31, { hour: 23, minute: 59, second: 59, millisecond: 999 })],
    ] as const;

    for (const [dateSystem, value] of values) {
      expect(excelSerialToDateParts(datePartsToExcelSerial(value, dateSystem), dateSystem)).toEqual(
        value,
      );
    }
  });

  test("rounds incoming serial fractions to a millisecond without a host timezone", () => {
    const serial = 61 + 3_723_004.4 / 86_400_000;
    expect(excelSerialToDateParts(serial, "1900")).toEqual(
      parts(1900, 3, 1, { hour: 1, minute: 2, second: 3, millisecond: 4 }),
    );
  });

  test("rejects invalid systems, dates, times, serials, and supported-range overflow", () => {
    expect(() => excelSerialToDateParts(Number.NaN, "1900")).toThrow(RangeError);
    expect(() => excelSerialToDateParts(-0.1, "1900")).toThrow(RangeError);
    expect(() => excelSerialToDateParts(Number.POSITIVE_INFINITY, "1904")).toThrow(RangeError);
    expect(() => excelSerialToDateParts(2_958_466, "1900")).toThrow(RangeError);
    expect(() => datePartsToExcelSerial(parts(1900, 2, 29), "1904")).toThrow(RangeError);
    expect(() => datePartsToExcelSerial(parts(2024, 2, 30), "1900")).toThrow(RangeError);
    expect(() => datePartsToExcelSerial(parts(2024, 1, 1, { hour: 24 }), "1900")).toThrow(
      RangeError,
    );
    expect(() => datePartsToExcelSerial(parts(10_000, 1, 1), "1900")).toThrow(RangeError);
  });
});
