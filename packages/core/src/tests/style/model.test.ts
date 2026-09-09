import { describe, expect, test } from "vitest";
import { createTestWorkbook } from "../helpers.js";
import {
  CELL_STYLE_KEYS,
  CELL_BORDER_LINE_STYLES,
  MAX_NUMBER_FORMAT_FRACTION_DIGITS,
  MAX_NUMBER_FORMAT_CURRENCY_SYMBOL_LENGTH,
  areCellStylesEqual,
  areCellNumberFormatsEqual,
  cloneCellStyle,
  createClearCellStylePatch,
  normalizeCellBorderAction,
  normalizeCellNumberFormat,
  normalizeCellStyle,
  normalizeCellStylePatch,
} from "../../style.js";
import {
  getActiveSheet,
  getCellStyle,
  getCellValue,
  setCellStyle,
  setCellValue,
} from "../../workbook.js";

describe("cell style model", () => {
  test("derives a complete clear patch from the supported style keys", () => {
    const patch = createClearCellStylePatch();

    expect(Object.keys(patch)).toEqual(CELL_STYLE_KEYS);
    expect(Object.values(patch)).toEqual(CELL_STYLE_KEYS.map(() => null));
  });

  test("stores style-only cells and preserves their style when content is cleared", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    const address = { row: 2, column: 3 };

    expect(setCellStyle(sheet, address, { bold: true, fillColor: "#FDE68A" })).toBe(true);
    expect(getCellValue(sheet, address)).toBeNull();
    expect(getCellStyle(sheet, address)).toEqual({ bold: true, fillColor: "#fde68a" });
    expect(sheet.cells.size).toBe(1);

    setCellValue(sheet, address, "Draft");
    setCellValue(sheet, address, null);
    expect(getCellStyle(sheet, address)).toEqual({ bold: true, fillColor: "#fde68a" });
    expect(sheet.cells.size).toBe(1);

    expect(setCellStyle(sheet, address, null)).toBe(true);
    expect(sheet.cells.size).toBe(0);
  });

  test("normalizes supported values and rejects invalid style data", () => {
    expect(
      normalizeCellStyle({
        fontFamily: "  Georgia  ",
        fontSize: 18,
        italic: true,
        textColor: "#ABCDEF",
        horizontalAlign: "center",
        verticalAlign: "bottom",
        wrapText: true,
        numberFormat: { kind: "currency", currency: "cny", fractionDigits: 2 },
      }),
    ).toEqual({
      fontFamily: "Georgia",
      fontSize: 18,
      italic: true,
      textColor: "#abcdef",
      horizontalAlign: "center",
      verticalAlign: "bottom",
      wrapText: true,
      numberFormat: { kind: "currency", currency: "CNY", fractionDigits: 2 },
    });
    expect(normalizeCellStyle({ verticalAlign: "middle" })).toBeUndefined();
    expect(normalizeCellStylePatch({ verticalAlign: "middle" })).toEqual({
      verticalAlign: null,
    });
    expect(normalizeCellStylePatch({ wrapText: false })).toEqual({ wrapText: null });
    expect(normalizeCellStyle({ wrapText: true })).toEqual({ wrapText: true });
    expect(normalizeCellStyle({ borderTop: { style: "dashed", color: "#ABCDEF" } })).toEqual({
      borderTop: { style: "dashed", color: "#abcdef" },
    });
    expect(
      normalizeCellStyle({ borderDiagonalDown: { style: "medium", color: "#ABCDEF" } }),
    ).toEqual({
      borderDiagonalDown: { style: "medium", color: "#abcdef" },
    });
    expect(() => normalizeCellStyle({ fontSize: 7 })).toThrow(RangeError);
    expect(() => normalizeCellStyle({ fillColor: "red" })).toThrow(TypeError);
    expect(() =>
      normalizeCellStyle({ borderLeft: { style: "wide" as never, color: "#112233" } }),
    ).toThrow(TypeError);
    expect(() => normalizeCellStyle({ borderRight: { style: "thin", color: "blue" } })).toThrow(
      TypeError,
    );
    expect(() => normalizeCellStyle({ verticalAlign: "baseline" as never })).toThrow(TypeError);
    expect(() => normalizeCellStyle({ wrapText: "yes" as never })).toThrow(TypeError);
    expect(() =>
      normalizeCellStyle({
        numberFormat: { kind: "currency", currency: "yuan", fractionDigits: 2 },
      }),
    ).toThrow(TypeError);
    expect(() =>
      normalizeCellStyle({
        numberFormat: { kind: "currency", currency: "", currencySymbol: "$", fractionDigits: 2 },
      }),
    ).toThrow(TypeError);
    expect(() =>
      normalizeCellStyle({
        numberFormat: {
          kind: "currency",
          currency: "USD",
          currencySymbol: "x".repeat(MAX_NUMBER_FORMAT_CURRENCY_SYMBOL_LENGTH + 1),
          fractionDigits: 2,
        },
      }),
    ).toThrow(RangeError);
    expect(() =>
      normalizeCellStyle({
        numberFormat: {
          kind: "currency",
          currency: "USD",
          currencySymbol: "US\u0000$",
          fractionDigits: 2,
        },
      }),
    ).toThrow(TypeError);
    expect(() =>
      normalizeCellStyle({
        numberFormat: {
          kind: "number",
          fractionDigits: MAX_NUMBER_FORMAT_FRACTION_DIGITS + 1,
        },
      }),
    ).toThrow(RangeError);
  });

  test("normalizes and compares semantic number formats structurally", () => {
    expect(
      normalizeCellNumberFormat({ kind: "currency", currency: "usd", fractionDigits: 2 }),
    ).toEqual({
      kind: "currency",
      currency: "USD",
      fractionDigits: 2,
    });
    expect(
      normalizeCellNumberFormat({
        kind: "currency",
        currency: "usd",
        currencySymbol: "  US$  ",
        fractionDigits: 2,
        locale: "en-US",
      }),
    ).toEqual({
      kind: "currency",
      currency: "USD",
      currencySymbol: "US$",
      fractionDigits: 2,
      locale: "en-US",
    });
    expect(
      areCellNumberFormatsEqual(
        { kind: "percent", fractionDigits: 1 },
        { kind: "percent", fractionDigits: 1 },
      ),
    ).toBe(true);
    expect(
      areCellNumberFormatsEqual(
        { kind: "currency", currency: "USD", fractionDigits: 2 },
        { kind: "currency", currency: "CNY", fractionDigits: 2 },
      ),
    ).toBe(false);
    expect(
      areCellNumberFormatsEqual(
        { kind: "currency", currency: "USD", currencySymbol: "$", fractionDigits: 2 },
        { kind: "currency", currency: "USD", currencySymbol: "US$", fractionDigits: 2 },
      ),
    ).toBe(false);
  });

  test("deep clones and structurally compares borders", () => {
    const original = {
      bold: true as const,
      numberFormat: { kind: "currency" as const, currency: "USD", fractionDigits: 2 },
      borderTop: { style: "double" as const, color: "#112233" },
      borderDiagonalUp: { style: "dashed" as const, color: "#445566" },
    };
    const clone = cloneCellStyle(original);

    expect(clone).toEqual(original);
    expect(clone?.borderTop).not.toBe(original.borderTop);
    expect(clone?.borderDiagonalUp).not.toBe(original.borderDiagonalUp);
    expect(clone?.numberFormat).not.toBe(original.numberFormat);
    expect(areCellStylesEqual(original, clone)).toBe(true);
    if (clone?.borderTop) {
      clone.borderTop.color = "#abcdef";
    }
    expect(original.borderTop.color).toBe("#112233");
    expect(areCellStylesEqual(original, clone)).toBe(false);
  });

  test("normalizes border actions with default and clear semantics", () => {
    expect(
      normalizeCellBorderAction({
        preset: "outer",
        border: { style: "medium", color: "#ABCDEF" },
      }),
    ).toEqual({ preset: "outer", border: { style: "medium", color: "#abcdef" } });
    expect(normalizeCellBorderAction({ preset: "none" })).toEqual({ preset: "none" });
    expect(
      normalizeCellBorderAction({
        preset: "diagonalUp",
        border: { style: "thin", color: "#ABCDEF" },
      }),
    ).toEqual({ preset: "diagonalUp", border: { style: "thin", color: "#abcdef" } });
    expect(normalizeCellBorderAction({ preset: "inner" })).toEqual({
      preset: "inner",
      border: { style: "thin", color: "#20242c" },
    });
    expect(normalizeCellBorderAction({ preset: "top", border: null })).toEqual({
      preset: "top",
      border: null,
    });
    expect(
      normalizeCellBorderAction({
        preset: "none",
        border: { style: "thin", color: "#112233" },
      }),
    ).toEqual({ preset: "none" });
  });

  test("accepts every stable Excel border line style", () => {
    expect(CELL_BORDER_LINE_STYLES).toEqual([
      "hair",
      "thin",
      "medium",
      "thick",
      "dotted",
      "dashed",
      "mediumDashed",
      "dashDot",
      "mediumDashDot",
      "dashDotDot",
      "mediumDashDotDot",
      "slantDashDot",
      "double",
    ]);
    for (const style of CELL_BORDER_LINE_STYLES) {
      expect(normalizeCellStyle({ borderTop: { style, color: "#112233" } })).toEqual({
        borderTop: { style, color: "#112233" },
      });
    }
  });
});
