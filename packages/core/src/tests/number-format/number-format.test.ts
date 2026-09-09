import { describe, expect, test } from "vitest";
import {
  formatCellNumberValue,
  isTextCellNumberFormat,
  toCellNumberFormatCode,
  validateCellNumberFormatCode,
} from "../../number-format.js";
import { normalizeCellNumberFormat } from "../../style.js";

describe("cell number formats", () => {
  test("renders the semantic number, currency, accounting, percentage, fraction and scientific presets", () => {
    expect(formatCellNumberValue(1234.5, { kind: "number", fractionDigits: 2 }).text).toBe(
      "1,234.50",
    );
    expect(
      formatCellNumberValue(-1234.5, { kind: "number", fractionDigits: 0, negativeStyle: "red" }),
    ).toEqual({
      text: "-1,235",
      color: "red",
    });
    expect(formatCellNumberValue(0.125, { kind: "percent", fractionDigits: 1 }).text).toBe("12.5%");
    expect(
      formatCellNumberValue(1234.5, { kind: "currency", currency: "USD", fractionDigits: 2 }).text,
    ).toBe("$1,234.50");
    expect(formatCellNumberValue(1.3, { kind: "fraction", code: "# ?/?" }).text).toBe("1 1/3");
    expect(formatCellNumberValue(12_200_000, { kind: "scientific", fractionDigits: 2 }).text).toBe(
      "1.22E+07",
    );
  });

  test("uses the workbook date system and preserves durations", () => {
    expect(formatCellNumberValue(60, { kind: "date", code: "yyyy/m/d" }).text).toBe("1900/2/29");
    expect(
      formatCellNumberValue(0, { kind: "date", code: "yyyy/m/d" }, { dateSystem: "1904" }).text,
    ).toBe("1904/1/1");
    expect(
      formatCellNumberValue(1.5, { kind: "time", code: "[h]:mm:ss" }, { dateSystem: "1904" }).text,
    ).toBe("36:00:00");
    expect(
      formatCellNumberValue(0, { kind: "custom", code: "[>=0]0;yyyy/m/d" }, { dateSystem: "1904" })
        .text,
    ).toBe("0");
    expect(
      formatCellNumberValue(0, { kind: "custom", code: "[<0]0;yyyy/m/d" }, { dateSystem: "1904" })
        .text,
    ).toBe("1904/1/1");
  });

  test("supports the supplied date, time and special preset codes", () => {
    const codes = [
      "yyyy/m/d",
      'yyyy"年"m"月"d"日"',
      '[DBNum1][$-804]yyyy"年"m"月"d"日"',
      'yyyy"年"m"月"',
      '[DBNum1][$-804]yyyy"年"m"月"',
      'm"月"d"日"',
      '[DBNum1][$-804]m"月"d"日"',
      "[$-804]aaaa",
      "[$-804]aaa",
      "h:mm:ss",
      "h:mm",
      "h:mm AM/PM",
      "h:mm:ss AM/PM",
      'h"时"mm"分"ss"秒"',
      "[h]:mm:ss",
      "000000",
      "[DBNum1][$-804]General",
      "[DBNum2][$-804]General",
    ];
    expect(codes.every(validateCellNumberFormatCode)).toBe(true);
    expect(formatCellNumberValue(1234, { kind: "special", code: "000000" }).text).toBe("001234");
  });

  test("converts DBNum1 and DBNum2 values while treating years as digit sequences", () => {
    expect(
      formatCellNumberValue(1234, { kind: "special", code: "[DBNum1][$-804]General" }).text,
    ).toBe("一千二百三十四");
    expect(
      formatCellNumberValue(1234, { kind: "special", code: "[DBNum2][$-804]General" }).text,
    ).toBe("壹仟贰佰叁拾肆");
    expect(
      formatCellNumberValue(40982, {
        kind: "date",
        code: '[DBNum1][$-804]yyyy"年"m"月"d"日"',
      }).text,
    ).toBe("二〇一二年三月十四日");
    expect(
      formatCellNumberValue(1234, { kind: "custom", code: "[<0][DBNum1]General;General" }).text,
    ).toBe("1234");
    expect(
      formatCellNumberValue(-1234, { kind: "custom", code: "[<0][DBNum1]General;General" }).text,
    ).toBe("一千二百三十四");
    expect(
      formatCellNumberValue(10001, { kind: "special", code: "[DBNum1][$-804]General" }).text,
    ).toBe("一万零一");
    expect(
      formatCellNumberValue(10010, { kind: "special", code: "[DBNum1][$-804]General" }).text,
    ).toBe("一万零一十");
    expect(
      formatCellNumberValue(1234.567, { kind: "special", code: "[DBNum1][$-804]General" }).text,
    ).toBe("一千二百三十四点五六七");
    expect(formatCellNumberValue(40982, { kind: "date", code: "[DBNum1]yyyy-mm-dd" }).text).toBe(
      "二〇一二-三-十四",
    );
  });

  test("returns the selected custom color and rejects unsupported native number modifiers", () => {
    expect(
      formatCellNumberValue(-2, { kind: "custom", code: "[Red]0;[Blue]-0;[Green]0;@" }),
    ).toEqual({
      text: "-2",
      color: "blue",
    });
    expect(validateCellNumberFormatCode("[DBNum3]General")).toBe(false);
    expect(validateCellNumberFormatCode("[NatNum1]General")).toBe(false);
    expect(() => normalizeCellNumberFormat({ kind: "custom", code: "[broken" })).toThrow(TypeError);
  });

  test("reports fill placement only from the selected format section", () => {
    const format = { kind: "custom" as const, code: "0;*x0;*y0;*.@" };
    expect(formatCellNumberValue(123, format)).toEqual({ text: "123" });
    expect(formatCellNumberValue(-123, format)).toEqual({
      text: "123",
      fill: { before: "", after: "123", character: "x" },
    });
    expect(formatCellNumberValue(0, format)).toEqual({
      text: "0",
      fill: { before: "", after: "0", character: "y" },
    });
    expect(formatCellNumberValue("text", format)).toEqual({
      text: "text",
      fill: { before: "", after: "text", character: "." },
    });
  });

  test("keeps native-number fill fragments consistent with rendered text", () => {
    expect(formatCellNumberValue(1234, { kind: "custom", code: "[DBNum1]*.General" })).toEqual({
      text: "一千二百三十四",
      fill: { before: "", after: "一千二百三十四", character: "." },
    });
  });

  test("uses real currency symbols in generated codes and returns formula error tokens", () => {
    expect(toCellNumberFormatCode({ kind: "currency", currency: "USD", fractionDigits: 2 })).toBe(
      "[$$-409]#,##0.00",
    );
    expect(toCellNumberFormatCode({ kind: "currency", currency: "CNY", fractionDigits: 0 })).toBe(
      "[$¥-804]#,##0",
    );
    expect(
      toCellNumberFormatCode({
        kind: "currency",
        currency: "USD",
        currencySymbol: "US$",
        fractionDigits: 2,
        locale: "en-US",
      }),
    ).toBe("[$US$-409]#,##0.00");
    expect(
      formatCellNumberValue(1234.5, {
        kind: "currency",
        currency: "USD",
        currencySymbol: "US$",
        fractionDigits: 2,
        locale: "en-US",
      }).text,
    ).toBe("US$1,234.50");
    expect(
      toCellNumberFormatCode({
        kind: "currency",
        currency: "USD",
        currencySymbol: "US$",
        fractionDigits: 2,
        locale: "unsupported-region",
      }),
    ).toBe('"US$"#,##0.00');
    expect(
      toCellNumberFormatCode({
        kind: "currency",
        currency: "USD",
        currencySymbol: 'US"$[test]',
        fractionDigits: 2,
        locale: "en-US",
      }),
    ).toBe('"US""$[test]"#,##0.00');
    expect(
      toCellNumberFormatCode({
        kind: "accounting",
        currency: "USD",
        currencySymbol: "US$",
        fractionDigits: 2,
        negativeStyle: "red-parentheses",
        locale: "en-US",
      }),
    ).toBe(
      '_([$US$-409]* #,##0.00_);[Red]_([$US$-409]* \\(#,##0.00\\)_);_([$US$-409]* "-"??_);_(@_)',
    );
    expect(formatCellNumberValue({ kind: "formula-error", code: "NA" }, undefined)).toEqual({
      text: "#N/A",
    });
    expect(formatCellNumberValue({ kind: "formula-error", code: "DIV0" }, undefined)).toEqual({
      text: "#DIV/0!",
    });
  });

  test("canonicalizes UI aliases and identifies only a pure text format as text", () => {
    expect(normalizeCellNumberFormat({ kind: "custom", code: "[红色]G/通用格式" })).toEqual({
      kind: "custom",
      code: "[Red]General",
    });
    expect(normalizeCellNumberFormat({ kind: "custom", code: '"[红色]G/通用格式"0' })).toEqual({
      kind: "custom",
      code: '"[红色]G/通用格式"0',
    });
    expect(toCellNumberFormatCode({ kind: "text" })).toBe("@");
    expect(isTextCellNumberFormat({ kind: "custom", code: "@" })).toBe(true);
    expect(isTextCellNumberFormat({ kind: "custom", code: "0;[Red]-0;0;@" })).toBe(false);
  });
});
