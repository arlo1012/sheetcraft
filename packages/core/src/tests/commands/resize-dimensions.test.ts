import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import { WorkbookDomainError } from "../../errors.js";
import {
  createResetSheetDimensionSizesCommand,
  createResizeSheetDimensionCommand,
  createSetSheetDefaultColumnWidthCommand,
  createSetSheetDimensionHiddenCommand,
  createSetSheetDimensionSizesCommand,
} from "../../commands/index.js";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  getActiveSheet,
  getColumnWidth,
  getDefaultColumnWidth,
  getRowHeight,
} from "../../workbook.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";

describe("resize sheet dimension command", () => {
  test("resizes one sheet dimension as an atomic reversible command", () => {
    const session = createTestWorkbookSession();
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
    const session = createTestWorkbookSession();
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
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    expect(() =>
      executeWorkbookCommand(
        session,
        createResizeSheetDimensionCommand(sheet.id, "row", 4, MIN_ROW_HEIGHT - 1),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: { code: "invalid_command_payload", details: { field: "size", value: 15 } },
      }),
    );
    expect(getRowHeight(sheet, 4)).toBe(DEFAULT_ROW_HEIGHT);
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("applies varying sizes as one reversible history action", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDimensionSizesCommand(sheet.id, "row", [
          { index: 2, size: 40 },
          { index: 3, size: 48 },
        ]),
      ),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(getRowHeight(sheet, 2)).toBe(40);
    expect(getRowHeight(sheet, 3)).toBe(48);
    undoWorkbookCommand(session);
    expect(getRowHeight(sheet, 2)).toBe(DEFAULT_ROW_HEIGHT);
    expect(getRowHeight(sheet, 3)).toBe(DEFAULT_ROW_HEIGHT);
  });

  test("hides without losing manual dimensions and restores them on undo or unhide", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "column", 4, 180));
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDimensionHiddenCommand(sheet.id, "column", [4], true),
      ),
    ).toBe(true);
    expect(getColumnWidth(sheet, 4)).toBe(0);
    expect(sheet.columnWidths.get(4)).toBe(180);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getColumnWidth(sheet, 4)).toBe(180);
    executeWorkbookCommand(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "column", [4], true),
    );
    executeWorkbookCommand(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "column", [4], false),
    );
    expect(getColumnWidth(sheet, 4)).toBe(180);
  });

  test("undoes a single resize on a hidden axis using its underlying size", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "row", 6, 40));
    executeWorkbookCommand(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "row", [6], true),
    );
    expect(getRowHeight(sheet, 6)).toBe(0);
    executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "row", 6, 48));
    expect(sheet.rowHeights.get(6)).toBe(48);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getRowHeight(sheet, 6)).toBe(0);
    expect(sheet.rowHeights.get(6)).toBe(40);
  });

  test("changes the sparse default column width and resets explicit dimensions", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createSetSheetDefaultColumnWidthCommand(sheet.id, 120));
    expect(getDefaultColumnWidth(sheet)).toBe(120);
    expect(getColumnWidth(sheet, 16_383)).toBe(120);
    expect(sheet.columnWidths).toHaveLength(0);
    executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "column", 3, 180));
    executeWorkbookCommand(session, createSetSheetDefaultColumnWidthCommand(sheet.id, 180));
    expect(sheet.columnWidths.has(3)).toBe(false);
    undoWorkbookCommand(session);
    expect(getDefaultColumnWidth(sheet)).toBe(120);
    expect(getColumnWidth(sheet, 3)).toBe(180);
    executeWorkbookCommand(session, createResetSheetDimensionSizesCommand(sheet.id, "column", [3]));
    expect(getColumnWidth(sheet, 3)).toBe(120);
    expect(sheet.columnWidths.has(3)).toBe(false);
  });
});
