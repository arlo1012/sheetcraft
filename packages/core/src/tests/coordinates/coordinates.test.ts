import { describe, expect, test } from "vitest";
import { formatCellAddress, parseCellAddress } from "../../coordinates.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "../../workbook.js";

describe("cell address navigation", () => {
  test("parses case-insensitive and absolute A1 references", () => {
    expect(parseCellAddress(" a1 ")).toEqual({ row: 0, column: 0 });
    expect(parseCellAddress("$XFD$1048576")).toEqual({ row: 1_048_575, column: 16_383 });
    expect(parseCellAddress("aa12")).toEqual({ row: 11, column: 26 });
  });

  test("rejects invalid and out-of-bounds references", () => {
    expect(parseCellAddress("A0")).toBeNull();
    expect(parseCellAddress("XFE1")).toBeNull();
    expect(parseCellAddress(`A${MAX_SHEET_ROWS + 1}`)).toBeNull();
    expect(parseCellAddress("1A")).toBeNull();
    expect(parseCellAddress("A1:B2")).toBeNull();
  });

  test("formats the sheet boundaries", () => {
    expect(formatCellAddress({ row: 0, column: 0 })).toBe("A1");
    expect(formatCellAddress({ row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 })).toBe(
      "XFD1048576",
    );
  });
});
