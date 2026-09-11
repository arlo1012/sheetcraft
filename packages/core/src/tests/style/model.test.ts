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
  mergeCellStyle,
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
        underline: "double",
        strikethrough: true,
        fontScript: "superscript",
        textColor: "#ABCDEF",
        horizontalAlign: "center",
        verticalAlign: "middle",
        indent: 3,
        shrinkToFit: true,
        textDirection: "rtl",
        textRotation: "vertical",
        wrapText: true,
        numberFormat: { kind: "currency", currency: "cny", fractionDigits: 2 },
      }),
    ).toEqual({
      fontFamily: "Georgia",
      fontSize: 18,
      italic: true,
      underline: "double",
      strikethrough: true,
      fontScript: "superscript",
      textColor: "#abcdef",
      horizontalAlign: "center",
      verticalAlign: "middle",
      indent: 3,
      shrinkToFit: true,
      textDirection: "rtl",
      textRotation: "vertical",
      wrapText: true,
      numberFormat: { kind: "currency", currency: "CNY", fractionDigits: 2 },
    });
    expect(normalizeCellStyle({ horizontalAlign: "general" })).toBeUndefined();
    expect(normalizeCellStylePatch({ horizontalAlign: "general" })).toEqual({
      horizontalAlign: null,
    });
    expect(normalizeCellStyle({ verticalAlign: "bottom" })).toBeUndefined();
    expect(normalizeCellStylePatch({ verticalAlign: "bottom" })).toEqual({
      verticalAlign: null,
    });
    expect(normalizeCellStyle({ textDirection: "context" })).toBeUndefined();
    expect(normalizeCellStylePatch({ textDirection: "context" })).toEqual({ textDirection: null });
    expect(normalizeCellStyle({ indent: 0, textRotation: 0 })).toBeUndefined();
    expect(normalizeCellStylePatch({ indent: 0, textRotation: 0 })).toEqual({
      indent: null,
      textRotation: null,
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
    expect(() => normalizeCellStyle({ horizontalAlign: "baseline" as never })).toThrow(TypeError);
    expect(() => normalizeCellStyle({ textDirection: "auto" as never })).toThrow(TypeError);
    expect(() => normalizeCellStyle({ indent: 1.5 })).toThrow(RangeError);
    expect(() => normalizeCellStyle({ indent: 251 })).toThrow(RangeError);
    expect(() => normalizeCellStyle({ textRotation: -91 })).toThrow(RangeError);
    expect(() => normalizeCellStyle({ textRotation: 91 })).toThrow(RangeError);
    expect(() => normalizeCellStyle({ wrapText: "yes" as never })).toThrow(TypeError);
    expect(() => normalizeCellStyle({ underline: "single" as never })).toThrow(TypeError);
    expect(() => normalizeCellStyle({ fontScript: "baseline" as never })).toThrow(TypeError);
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

  test("normalizes, deep clones, and compares pattern and gradient fills", () => {
    const gradient = {
      type: "linear" as const,
      angle: -90,
      stops: [
        { position: 1, color: "#FFFFFF" },
        { position: 0, color: "#123456" },
      ],
    };
    const normalized = normalizeCellStyle({
      fillColor: "#ffffff",
      fillPattern: "lightTrellis",
      fillPatternColor: "#112233",
    });
    expect(normalized).toEqual({
      fillColor: "#ffffff",
      fillPattern: "lightTrellis",
      fillPatternColor: "#112233",
    });
    expect(normalizeCellStyle({ fillColor: "#ffffff", fillGradient: gradient })).toEqual({
      fillGradient: {
        type: "linear",
        angle: 270,
        stops: [
          { position: 0, color: "#123456" },
          { position: 1, color: "#ffffff" },
        ],
      },
    });
    const clone = cloneCellStyle({ fillGradient: gradient });
    expect(clone?.fillGradient).not.toBe(gradient);
    expect(clone?.fillGradient?.stops).not.toBe(gradient.stops);
    expect(areCellStylesEqual({ fillGradient: gradient }, clone)).toBe(true);
    expect(() =>
      normalizeCellStyle({
        fillGradient: {
          type: "path",
          left: 0,
          right: 1.1,
          top: 0,
          bottom: 1,
          stops: [
            { position: 0, color: "#000000" },
            { position: 1, color: "#ffffff" },
          ],
        },
      }),
    ).toThrow(RangeError);
    expect(() =>
      normalizeCellStyle({
        fillGradient: {
          type: "linear",
          angle: 0,
          stops: [
            { position: 0, color: "#000000" },
            { position: 0, color: "#ffffff" },
          ],
        },
      }),
    ).toThrow(RangeError);
  });

  test("applies fill patch precedence without retaining incompatible fields", () => {
    const gradient = {
      type: "linear" as const,
      angle: 0,
      stops: [
        { position: 0, color: "#000000" },
        { position: 1, color: "#ffffff" },
      ],
    };
    expect(
      mergeCellStyle(
        { fillGradient: gradient },
        { fillColor: "#abcdef", fillPattern: "darkGrid", fillPatternColor: "#123456" },
      ),
    ).toEqual({
      fillColor: "#abcdef",
      fillPattern: "darkGrid",
      fillPatternColor: "#123456",
    });
    expect(
      mergeCellStyle(
        { fillColor: "#abcdef", fillPattern: "darkGrid", fillPatternColor: "#123456" },
        { fillColor: null },
      ),
    ).toBeUndefined();
    expect(
      mergeCellStyle(
        { fillColor: "#abcdef" },
        { fillColor: null, fillPattern: "darkGrid", fillPatternColor: "#123456" },
      ),
    ).toEqual({ fillPattern: "darkGrid", fillPatternColor: "#123456" });
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
