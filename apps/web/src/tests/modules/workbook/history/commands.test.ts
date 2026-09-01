import { describe, expect, test } from "vitest";
import {
  createBatchSetCellValuesCommand,
  createSetCellValueCommand,
} from "../../../../modules/workbook/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../../modules/workbook/history";
import { getActiveSheet, getCellValue } from "@idea10/core/workbook";

describe("workbook commands and history", () => {
  test("executes a cell edit and supports undo and redo", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    expect(
      executeWorkbookCommand(
        session,
        createSetCellValueCommand(sheet.id, { row: 1, column: 1 }, "Draft"),
      ),
    ).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("Draft");

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();

    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("Draft");
  });

  test("records a batch as one atomic history entry", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    executeWorkbookCommand(
      session,
      createBatchSetCellValuesCommand([
        { sheetId: sheet.id, address: { row: 0, column: 0 }, value: "A" },
        { sheetId: sheet.id, address: { row: 0, column: 1 }, value: "B" },
      ]),
    );

    expect(session.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(session);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBeNull();
  });

  test("validates a complete batch before changing workbook state", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const command = createBatchSetCellValuesCommand([
      { sheetId: sheet.id, address: { row: 0, column: 0 }, value: "A" },
      { sheetId: "missing-sheet", address: { row: 0, column: 1 }, value: "B" },
    ]);

    expect(() => executeWorkbookCommand(session, command)).toThrow("missing-sheet");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("does not record no-ops and clears redo after a new edit", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 0, column: 0 };

    executeWorkbookCommand(session, createSetCellValueCommand(sheet.id, address, "One"));
    expect(
      executeWorkbookCommand(session, createSetCellValueCommand(sheet.id, address, "One")),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(1);

    undoWorkbookCommand(session);
    expect(session.history.redoStack).toHaveLength(1);

    executeWorkbookCommand(session, createSetCellValueCommand(sheet.id, address, "Two"));
    expect(session.history.redoStack).toHaveLength(0);
    expect(redoWorkbookCommand(session)).toBe(false);
  });
});
