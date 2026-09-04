import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import { createClearCellRangeCommand, createSetCellContentCommand } from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  getActiveSheet,
  getCellValue,
  setCellValue,
} from "../../workbook.js";

describe("clear cell range command", () => {
  test("clears a sparse range as one reversible history entry", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 1 }, "B2");
    setCellValue(sheet, { row: 2, column: 2 }, 3);
    setCellValue(sheet, { row: 3, column: 3 }, "outside");

    expect(
      executeWorkbookCommand(
        session,
        createClearCellRangeCommand(sheet.id, {
          start: { row: 2, column: 2 },
          end: { row: 1, column: 1 },
        }),
      ),
    ).toBe(true);

    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBeNull();
    expect(getCellValue(sheet, { row: 3, column: 3 })).toBe("outside");
    expect(session.history.undoStack).toHaveLength(1);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("B2");
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe(3);

    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBeNull();
  });

  test("clears sparse values across a full-sheet range", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "first");
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 }, "last");

    expect(
      executeWorkbookCommand(
        session,
        createClearCellRangeCommand(sheet.id, {
          start: { row: 0, column: 0 },
          end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
        }),
      ),
    ).toBe(true);
    expect(sheet.cells.size).toBe(0);
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("does not record an empty clear or discard redo history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 0 },
        { kind: "literal", value: "redo me" },
      ),
    );
    undoWorkbookCommand(session);

    expect(
      executeWorkbookCommand(
        session,
        createClearCellRangeCommand(sheet.id, {
          start: { row: 0, column: 0 },
          end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
        }),
      ),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
    expect(session.history.redoStack).toHaveLength(1);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("redo me");
  });
});
