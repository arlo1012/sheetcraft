import { describe, expect, test } from "vitest";
import { createTestWorkbook } from "../helpers.js";
import {
  CELL_STYLE_KEYS,
  areCellStylesEqual,
  cloneCellStyle,
  createClearCellStylePatch,
  normalizeCellBorderAction,
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
      }),
    ).toEqual({
      fontFamily: "Georgia",
      fontSize: 18,
      italic: true,
      textColor: "#abcdef",
      horizontalAlign: "center",
      verticalAlign: "bottom",
      wrapText: true,
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
  });

  test("deep clones and structurally compares borders", () => {
    const original = {
      bold: true as const,
      borderTop: { style: "double" as const, color: "#112233" },
      borderDiagonalUp: { style: "dashed" as const, color: "#445566" },
    };
    const clone = cloneCellStyle(original);

    expect(clone).toEqual(original);
    expect(clone?.borderTop).not.toBe(original.borderTop);
    expect(clone?.borderDiagonalUp).not.toBe(original.borderDiagonalUp);
    expect(areCellStylesEqual(original, clone)).toBe(true);
    if (clone?.borderTop) {
      clone.borderTop.color = "#abcdef";
    }
    expect(original.borderTop.color).toBe("#112233");
    expect(areCellStylesEqual(original, clone)).toBe(false);
  });

  test("normalizes border actions and requires a border except for none", () => {
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
    expect(() => normalizeCellBorderAction({ preset: "inner" } as never)).toThrow(TypeError);
    expect(
      normalizeCellBorderAction({
        preset: "none",
        border: { style: "thin", color: "#112233" },
      }),
    ).toEqual({ preset: "none" });
  });
});
