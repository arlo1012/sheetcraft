import { describe, expect, test } from "vitest";
import {
  createDeleteSheetAxisCommand,
  createBatchDeleteSheetAxesCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { getActiveSheet, getCellValue, setCellValue } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("batch workbook commands", () => {
  test("deletes disjoint row spans as one reversible history entry", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "zero");
    setCellValue(sheet, { row: 2, column: 0 }, "two");
    setCellValue(sheet, { row: 4, column: 0 }, "four");

    expect(
      executeWorkbookCommand(
        session,
        createBatchDeleteSheetAxesCommand([
          createDeleteSheetAxisCommand(sheet.id, "row", 3, 1),
          createDeleteSheetAxisCommand(sheet.id, "row", 1, 1),
        ]),
      ),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("zero");
    expect(getCellValue(sheet, { row: 1, column: 0 })).toBe("two");
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe("four");

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe("two");
    expect(getCellValue(sheet, { row: 4, column: 0 })).toBe("four");
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe("four");
  });

  test("rolls back a failed later command without a history entry", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 0 }, "kept");
    const first = createDeleteSheetAxisCommand(sheet.id, "row", 1, 1);
    const invalid = createDeleteSheetAxisCommand(sheet.id, "row", -1, 1);

    expect(() =>
      executeWorkbookCommand(session, createBatchDeleteSheetAxesCommand([first, invalid])),
    ).toThrow();
    expect(getCellValue(sheet, { row: 1, column: 0 })).toBe("kept");
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("rejects empty and cross-sheet batches", () => {
    expect(() => createBatchDeleteSheetAxesCommand([])).toThrow("must not be empty");
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const command = createDeleteSheetAxisCommand(sheet.id, "row", 0, 1);
    expect(() =>
      createBatchDeleteSheetAxesCommand([{ ...command, sheetId: "another-sheet" }, command]),
    ).toThrow("same sheet");
  });
});
