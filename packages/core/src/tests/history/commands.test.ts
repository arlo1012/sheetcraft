import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import {
  createBatchSetCellContentsCommand,
  createSetCellContentCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { getActiveSheet, getCellValue } from "../../workbook.js";

describe("workbook commands and history", () => {
  test("executes a cell edit and supports undo and redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    expect(
      executeWorkbookCommand(
        session,
        createSetCellContentCommand(
          sheet.id,
          { row: 1, column: 1 },
          { kind: "literal", value: "Draft" },
        ),
      ),
    ).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("Draft");

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();

    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("Draft");
  });

  test("records a batch as one atomic history entry", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    executeWorkbookCommand(
      session,
      createBatchSetCellContentsCommand([
        {
          sheetId: sheet.id,
          address: { row: 0, column: 0 },
          content: { kind: "literal", value: "A" },
        },
        {
          sheetId: sheet.id,
          address: { row: 0, column: 1 },
          content: { kind: "literal", value: "B" },
        },
      ]),
    );

    expect(session.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(session);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBeNull();
  });

  test("validates a complete batch before changing workbook state", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const command = createBatchSetCellContentsCommand([
      {
        sheetId: sheet.id,
        address: { row: 0, column: 0 },
        content: { kind: "literal", value: "A" },
      },
      {
        sheetId: "missing-sheet",
        address: { row: 0, column: 1 },
        content: { kind: "literal", value: "B" },
      },
    ]);

    expect(() => executeWorkbookCommand(session, command)).toThrow("missing-sheet");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("does not record no-ops and clears redo after a new edit", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 0, column: 0 };

    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, address, { kind: "literal", value: "One" }),
    );
    expect(
      executeWorkbookCommand(
        session,
        createSetCellContentCommand(sheet.id, address, { kind: "literal", value: "One" }),
      ),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(1);

    undoWorkbookCommand(session);
    expect(session.history.redoStack).toHaveLength(1);

    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, address, { kind: "literal", value: "Two" }),
    );
    expect(session.history.redoStack).toHaveLength(0);
    expect(redoWorkbookCommand(session)).toBe(false);
  });

  test("keeps a corrupt undo entry when applying it fails", () => {
    const session = createTestWorkbookSession();
    session.history.undoStack.push({
      command: {
        type: "unknownCommand",
      } as unknown as import("../../commands/contracts.js").WorkbookCommand,
      operation: "cells.edit",
    });

    expect(() => undoWorkbookCommand(session)).toThrow("Unknown workbook command.");
    expect(session.history.undoStack).toHaveLength(1);
    expect(session.history.redoStack).toHaveLength(0);
  });
});
