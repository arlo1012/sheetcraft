import { describe, expect, test } from "vitest";
import { normalizeCellStyle } from "../../../../modules/workbook/cell-style";
import {
  getActiveSheet,
  getCellStyle,
  getCellValue,
  createWorkbook,
  setCellStyle,
  setCellValue,
} from "../../../../modules/workbook/workbook";

describe("cell style model", () => {
  test("stores style-only cells and preserves their style when content is cleared", () => {
    const sheet = getActiveSheet(createWorkbook());
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
      }),
    ).toEqual({
      fontFamily: "Georgia",
      fontSize: 18,
      italic: true,
      textColor: "#abcdef",
      horizontalAlign: "center",
    });
    expect(() => normalizeCellStyle({ fontSize: 7 })).toThrow(RangeError);
    expect(() => normalizeCellStyle({ fillColor: "red" })).toThrow(TypeError);
  });
});
