import { describe, expect, test } from "vitest";
import { validateCellNumberFormatCode } from "@idea10/core/number-format";
import {
  getDateFormatPresets,
  supportsDateFormatLocale,
} from "../../../../shared/number-format/date-presets";

describe("date format presets", () => {
  test("uses the selected locale's order and LCID for date formats", () => {
    const american = getDateFormatPresets("en-US");
    const german = getDateFormatPresets("de-DE");

    expect(american.find(({ id }) => id === "date-short")).toMatchObject({
      code: expect.stringContaining("[$-409]"),
      label: "3/14/2012",
    });
    expect(german.find(({ id }) => id === "date-short")).toMatchObject({
      code: expect.stringContaining("[$-407]"),
      label: "14.3.2012",
    });
    expect(german.map(({ id }) => id)).toContain("date-time-seconds");
    expect(german.every(({ code }) => validateCellNumberFormatCode(code))).toBe(true);
  });

  test("retains the distinct legacy English date spellings alongside the expanded catalog", () => {
    const american = getDateFormatPresets("en-US");
    expect(american).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "date-legacy-day-short-month-two-digit-year",
          code: "[$-409]d-mmm-yy",
        }),
        expect.objectContaining({ id: "date-legacy-day-short-month", code: "[$-409]d-mmm" }),
        expect.objectContaining({
          id: "date-legacy-short-month-two-digit-year",
          code: "[$-409]mmm-yy",
        }),
      ]),
    );
    expect(american.length).toBeGreaterThanOrEqual(21);
  });

  test("merges only identical Excel codes and preserves their semantic ids", () => {
    const french = getDateFormatPresets("fr-FR");
    expect(new Set(french.map(({ code }) => code)).size).toBe(french.length);
    expect(french.some(({ aliasIds }) => aliasIds?.length)).toBe(true);
  });

  test("keeps Chinese legacy date choices while sharing semantic ids with other regions", () => {
    const china = getDateFormatPresets("zh-CN");
    const taiwan = getDateFormatPresets("zh-TW");

    expect(china).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "date-short", code: expect.stringContaining("[$-804]") }),
        expect.objectContaining({
          id: "date-native-full",
          code: expect.stringContaining("[DBNum1]"),
        }),
        expect.objectContaining({ id: "date-year-month" }),
        expect.objectContaining({ id: "date-time-minutes" }),
      ]),
    );
    expect(taiwan.find(({ id }) => id === "date-short")?.code).toContain("[$-404]");
    expect(new Set(china.map(({ id }) => id)).size).toBe(china.length);
  });

  test("detects unsupported locales instead of silently displaying the host default", () => {
    expect(supportsDateFormatLocale("en-US")).toBe(true);
    expect(supportsDateFormatLocale("not-a-locale")).toBe(false);
  });
});
