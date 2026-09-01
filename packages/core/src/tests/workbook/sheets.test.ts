import { describe, expect, test } from "vitest";
import {
  createSheet,
  createWorkbook,
  getNextSheetName,
  getWorkbookSheets,
  insertSheet,
  removeSheet,
  renameSheet,
  setActiveSheet,
} from "../../workbook.js";

describe("workbook sheets", () => {
  test("keeps sheet order in the workbook map insertion order", () => {
    const workbook = createWorkbook({ sheetId: "sheet-1" });
    insertSheet(workbook, createSheet("Sheet2", "sheet-2"));
    insertSheet(workbook, createSheet("Sheet3", "sheet-3"), 1);

    expect(getWorkbookSheets(workbook).map((sheet) => sheet.id)).toEqual([
      "sheet-1",
      "sheet-3",
      "sheet-2",
    ]);
  });

  test("trims names, requires case-insensitive uniqueness, and finds the first available default", () => {
    const workbook = createWorkbook({ sheetId: "sheet-1", sheetName: " Sheet1 " });
    insertSheet(workbook, createSheet("Sheet3", "sheet-3"));

    expect(getNextSheetName(workbook)).toBe("Sheet2");
    expect(() => insertSheet(workbook, createSheet("sheet1", "sheet-2"))).toThrow("already exists");
    expect(() => renameSheet(workbook, "sheet-3", "   ")).toThrow("cannot be empty");
  });

  test("keeps the active sheet valid when removing it through the model API", () => {
    const workbook = createWorkbook({ sheetId: "sheet-1" });
    insertSheet(workbook, createSheet("Sheet2", "sheet-2"));
    insertSheet(workbook, createSheet("Sheet3", "sheet-3"));
    setActiveSheet(workbook, "sheet-2");

    removeSheet(workbook, "sheet-2");

    expect(workbook.activeSheetId).toBe("sheet-3");
  });
});
