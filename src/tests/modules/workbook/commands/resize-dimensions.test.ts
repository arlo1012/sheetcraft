import { describe, expect, test } from "vitest";
import { createResizeSheetDimensionCommand } from "../../../../modules/workbook/commands";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  getActiveSheet,
  getColumnWidth,
  getRowHeight,
} from "../../../../modules/workbook/workbook";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../../modules/workbook/history";

describe("resize sheet dimension command", () => {
  test("resizes one sheet dimension as an atomic reversible command", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    expect(
      executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "row", 20, 40)),
    ).toBe(true);
    expect(getRowHeight(sheet, 20)).toBe(40);
    expect(session.history.undoStack).toHaveLength(1);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getRowHeight(sheet, 20)).toBe(DEFAULT_ROW_HEIGHT);
    expect(sheet.rowHeights.has(20)).toBe(false);

    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getRowHeight(sheet, 20)).toBe(40);
  });

  test("does not record a no-op dimension resize or discard redo history", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "column", 3, 140));
    undoWorkbookCommand(session);

    expect(
      executeWorkbookCommand(
        session,
        createResizeSheetDimensionCommand(sheet.id, "column", 3, DEFAULT_COLUMN_WIDTH),
      ),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
    expect(session.history.redoStack).toHaveLength(1);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getColumnWidth(sheet, 3)).toBe(140);
  });

  test("rejects an invalid resize before changing workbook state", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    expect(() =>
      executeWorkbookCommand(
        session,
        createResizeSheetDimensionCommand(sheet.id, "row", 4, MIN_ROW_HEIGHT - 1),
      ),
    ).toThrow(RangeError);
    expect(getRowHeight(sheet, 4)).toBe(DEFAULT_ROW_HEIGHT);
    expect(session.history.undoStack).toHaveLength(0);
  });
});
