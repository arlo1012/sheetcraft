import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  getCellValue,
  setCellValue,
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
});
