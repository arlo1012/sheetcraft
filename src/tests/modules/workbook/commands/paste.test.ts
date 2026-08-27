import { describe, expect, test } from "vitest";
import { createPasteCellValuesCommand } from "../../../../modules/workbook/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../../modules/workbook/history";
import { getActiveSheet, getCellValue, setCellValue } from "../../../../modules/workbook/workbook";

describe("paste cell values command", () => {
  test("pastes a matrix as one history entry", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    executeWorkbookCommand(
      session,
      createPasteCellValuesCommand(sheet.id, { row: 2, column: 3 }, [
        ["A", "B"],
        ["C", "D"],
      ]),
    );

    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellValue(sheet, { row: 2, column: 3 })).toBe("A");
    expect(getCellValue(sheet, { row: 3, column: 4 })).toBe("D");
    undoWorkbookCommand(session);
    expect(getCellValue(sheet, { row: 2, column: 3 })).toBeNull();
    expect(getCellValue(sheet, { row: 3, column: 4 })).toBeNull();
    redoWorkbookCommand(session);
    expect(getCellValue(sheet, { row: 3, column: 4 })).toBe("D");
  });

  test("moves an overlapping cut range atomically", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "A");
    setCellValue(sheet, { row: 0, column: 1 }, "B");
    setCellValue(sheet, { row: 1, column: 0 }, "C");
    setCellValue(sheet, { row: 1, column: 1 }, "D");

    executeWorkbookCommand(
      session,
      createPasteCellValuesCommand(
        sheet.id,
        { row: 1, column: 1 },
        [
          ["A", "B"],
          ["C", "D"],
        ],
        { clearRange: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } } },
      ),
    );

    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("A");
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe("D");

    undoWorkbookCommand(session);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("A");
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("D");
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBeNull();
  });

  test("rejects an empty, uneven, or overflowing matrix before mutation", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    expect(() => createPasteCellValuesCommand(sheet.id, { row: 0, column: 0 }, [])).toThrow();
    expect(() =>
      createPasteCellValuesCommand(sheet.id, { row: 0, column: 0 }, [[1], [2, 3]]),
    ).toThrow();
    expect(() =>
      createPasteCellValuesCommand(sheet.id, { row: 1_048_575, column: 16_383 }, [[1, 2]]),
    ).toThrow();
    expect(sheet.cells.size).toBe(0);
  });
});
