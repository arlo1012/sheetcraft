import { describe, expect, test } from "vitest";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  createWorkbook,
  getActiveSheet,
  getColumnWidth,
  getCellValue,
  getRowHeight,
  setColumnWidth,
  setCellValue,
  setRowHeight,
} from "../../../../modules/workbook/workbook";

describe("workbook model", () => {
  test("creates a workbook with an active Sheet1", () => {
    const workbook = createWorkbook({ id: "book-1", sheetId: "sheet-1" });

    expect(workbook.activeSheetId).toBe("sheet-1");
    expect(getActiveSheet(workbook).name).toBe("Sheet1");
  });

  test("stores cells sparsely and removes empty values", () => {
    const sheet = getActiveSheet(createWorkbook());

    expect(setCellValue(sheet, { row: 2, column: 3 }, "Draft")).toBe(true);
    expect(getCellValue(sheet, { row: 2, column: 3 })).toBe("Draft");
    expect(getCellValue(sheet, { row: 2, column: 4 })).toBeNull();
    expect(sheet.cells.size).toBe(1);

    expect(setCellValue(sheet, { row: 2, column: 3 }, "")).toBe(true);
    expect(sheet.cells.size).toBe(0);
  });

  test("preserves supported primitive value types", () => {
    const sheet = getActiveSheet(createWorkbook());

    setCellValue(sheet, { row: 0, column: 0 }, "Text");
    setCellValue(sheet, { row: 0, column: 1 }, 42);
    setCellValue(sheet, { row: 0, column: 2 }, true);

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("Text");
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe(42);
    expect(getCellValue(sheet, { row: 0, column: 2 })).toBe(true);
  });

  test("stores non-default row and column dimensions sparsely", () => {
    const sheet = getActiveSheet(createWorkbook());

    expect(getRowHeight(sheet, 42)).toBe(DEFAULT_ROW_HEIGHT);
    expect(getColumnWidth(sheet, 9)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(setRowHeight(sheet, 42, 40)).toBe(true);
    expect(setColumnWidth(sheet, 9, 144)).toBe(true);
    expect(sheet.rowHeights).toEqual(new Map([[42, 40]]));
    expect(sheet.columnWidths).toEqual(new Map([[9, 144]]));

    expect(setRowHeight(sheet, 42, DEFAULT_ROW_HEIGHT)).toBe(true);
    expect(setColumnWidth(sheet, 9, DEFAULT_COLUMN_WIDTH)).toBe(true);
    expect(sheet.rowHeights.size).toBe(0);
    expect(sheet.columnWidths.size).toBe(0);
  });

  test("validates sheet dimension indexes and sizes", () => {
    const sheet = getActiveSheet(createWorkbook());

    expect(() => setRowHeight(sheet, -1, DEFAULT_ROW_HEIGHT)).toThrow(RangeError);
    expect(() => setColumnWidth(sheet, 0.5, DEFAULT_COLUMN_WIDTH)).toThrow(RangeError);
    expect(() => setRowHeight(sheet, 0, MAX_ROW_HEIGHT + 1)).toThrow(RangeError);
    expect(() => setColumnWidth(sheet, 0, MAX_COLUMN_WIDTH + 1)).toThrow(RangeError);
  });
});
