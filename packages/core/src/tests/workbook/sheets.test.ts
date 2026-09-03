import { describe, expect, test } from "vitest";
import {
  createSheet,
  createWorkbook,
  getNextDuplicateSheetName,
  getNextSheetName,
  getWorkbookSheets,
  insertSheet,
  moveSheet,
  removeSheet,
  renameSheet,
  setActiveSheet,
} from "../../workbook.js";

describe("workbook sheets", () => {
  test("keeps sheet order in the workbook map insertion order", () => {
    const workbook = createWorkbook({ id: "workbook-1", sheetId: "sheet-1" });
    insertSheet(workbook, createSheet("Sheet2", "sheet-2"));
    insertSheet(workbook, createSheet("Sheet3", "sheet-3"), 1);

    expect(getWorkbookSheets(workbook).map((sheet) => sheet.id)).toEqual([
      "sheet-1",
      "sheet-3",
      "sheet-2",
    ]);
  });

  test("trims names, requires case-insensitive uniqueness, and finds the first available default", () => {
    const workbook = createWorkbook({
      id: "workbook-1",
      sheetId: "sheet-1",
      sheetName: " Sheet1 ",
    });
    insertSheet(workbook, createSheet("Sheet3", "sheet-3"));

    expect(getNextSheetName(workbook)).toBe("Sheet2");
    expect(() => insertSheet(workbook, createSheet("sheet1", "sheet-2"))).toThrow("already exists");
    expect(() => renameSheet(workbook, "sheet-3", "   ")).toThrow("cannot be empty");
  });

  test("finds the first available duplicate name and moves sheets by final index", () => {
    const workbook = createWorkbook({ id: "workbook-1", sheetId: "sheet-1", sheetName: "Budget" });
    insertSheet(workbook, createSheet("Budget (2)", "sheet-2"));
    insertSheet(workbook, createSheet("Other", "sheet-3"));
    setActiveSheet(workbook, "sheet-1");

    expect(getNextDuplicateSheetName(workbook, " Budget ")).toBe("Budget (3)");
    expect(moveSheet(workbook, "sheet-3", 0)).toBe(true);
    expect(getWorkbookSheets(workbook).map((sheet) => sheet.id)).toEqual([
      "sheet-3",
      "sheet-1",
      "sheet-2",
    ]);
    expect(workbook.activeSheetId).toBe("sheet-1");
    expect(moveSheet(workbook, "sheet-3", 0)).toBe(false);
    expect(() => moveSheet(workbook, "missing", 0)).toThrow("does not exist");
    expect(() => moveSheet(workbook, "sheet-3", 3)).toThrow("outside the workbook");
  });

  test("keeps the active sheet valid when removing it through the model API", () => {
    const workbook = createWorkbook({ id: "workbook-1", sheetId: "sheet-1" });
    insertSheet(workbook, createSheet("Sheet2", "sheet-2"));
    insertSheet(workbook, createSheet("Sheet3", "sheet-3"));
    setActiveSheet(workbook, "sheet-2");

    removeSheet(workbook, "sheet-2");

    expect(workbook.activeSheetId).toBe("sheet-3");
  });
});
