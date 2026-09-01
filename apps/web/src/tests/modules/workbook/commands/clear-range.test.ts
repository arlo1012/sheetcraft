import { describe, expect, test } from "vitest";
import {
  createClearCellRangeCommand,
  createSetCellValueCommand,
} from "../../../../modules/workbook/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../../modules/workbook/history";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  getActiveSheet,
  getCellValue,
  setCellValue,
} from "@idea10/core/workbook";

describe("clear cell range command", () => {
  test("clears a sparse range as one reversible history entry", () => {
    const session = createWorkbookSession();
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
    const session = createWorkbookSession();
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
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetCellValueCommand(sheet.id, { row: 0, column: 0 }, "redo me"),
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
