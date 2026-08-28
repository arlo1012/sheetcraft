import { describe, expect, test } from "vitest";
import {
  applyWorkbookCommand,
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  type WorkbookCommand,
} from "../../../../modules/workbook/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../../modules/workbook/history";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  createSheetSparseState,
  getCellStyle,
  getActiveSheet,
  getCellValue,
  getColumnWidth,
  getRowHeight,
  setCellValue,
  setCellStyle,
  setColumnWidth,
  setRowHeight,
} from "../../../../modules/workbook/workbook";

describe("sheet axis structure commands", () => {
  test("inserts rows by shifting sparse cells and row dimensions while dropping the tail", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 3 }, "above");
    setCellValue(sheet, { row: 2, column: 1 }, "move");
    setCellStyle(sheet, { row: 2, column: 1 }, { bold: true });
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 4 }, "tail");
    setRowHeight(sheet, 2, 40);
    setRowHeight(sheet, MAX_SHEET_ROWS - 1, 48);
    setColumnWidth(sheet, 1, 144);

    expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 2))).toBe(
      true,
    );
    expect(getCellValue(sheet, { row: 1, column: 3 })).toBe("above");
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe("move");
    expect(getCellStyle(sheet, { row: 3, column: 1 })).toEqual({ bold: true });
    expect(getCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 4 })).toBeNull();
    expect(getRowHeight(sheet, 3)).toBe(40);
    expect(getRowHeight(sheet, MAX_SHEET_ROWS - 1)).toBe(DEFAULT_ROW_HEIGHT);
    expect(getColumnWidth(sheet, 1)).toBe(144);
  });

  test("deletes multiple rows, including their dimensions, and leaves the tail default", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 0 }, "above");
    setCellValue(sheet, { row: 2, column: 0 }, "delete-1");
    setCellValue(sheet, { row: 3, column: 0 }, "delete-2");
    setCellValue(sheet, { row: 4, column: 0 }, "move");
    setRowHeight(sheet, 2, 40);
    setRowHeight(sheet, 4, 48);

    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 2, 2));

    expect(getCellValue(sheet, { row: 1, column: 0 })).toBe("above");
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe("move");
    expect(getCellValue(sheet, { row: 3, column: 0 })).toBeNull();
    expect(getRowHeight(sheet, 2)).toBe(48);
    expect(getRowHeight(sheet, 3)).toBe(DEFAULT_ROW_HEIGHT);
  });

  test("inserts and deletes columns without changing row dimensions", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 5, column: 1 }, "left");
    setCellValue(sheet, { row: 5, column: 2 }, "move");
    setCellValue(sheet, { row: 6, column: MAX_SHEET_COLUMNS - 1 }, "tail");
    setColumnWidth(sheet, 2, 144);
    setColumnWidth(sheet, MAX_SHEET_COLUMNS - 1, 160);
    setRowHeight(sheet, 5, 40);

    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "column", 2));
    expect(getCellValue(sheet, { row: 5, column: 1 })).toBe("left");
    expect(getCellValue(sheet, { row: 5, column: 2 })).toBeNull();
    expect(getCellValue(sheet, { row: 5, column: 3 })).toBe("move");
    expect(getCellValue(sheet, { row: 6, column: MAX_SHEET_COLUMNS - 1 })).toBeNull();
    expect(getColumnWidth(sheet, 3)).toBe(144);
    expect(getColumnWidth(sheet, MAX_SHEET_COLUMNS - 1)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(getRowHeight(sheet, 5)).toBe(40);

    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "column", 1, 2));
    expect(getCellValue(sheet, { row: 5, column: 1 })).toBe("move");
    expect(getColumnWidth(sheet, 1)).toBe(144);
    expect(getRowHeight(sheet, 5)).toBe(40);
  });

  test("round-trips inserted tail overflow and deleted cells through undo and redo", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 0 }, "selected");
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 0 }, "overflow");
    setRowHeight(sheet, 1, 40);
    setRowHeight(sheet, MAX_SHEET_ROWS - 1, 48);
    const beforeInsert = createSheetSparseState(sheet);

    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(beforeInsert);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 0 })).toBeNull();

    const beforeDelete = createSheetSparseState(sheet);
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 1));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(beforeDelete);
    expect(redoWorkbookCommand(session)).toBe(true);
  });

  test("supports the first and final valid axis bands", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "first");
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 3, column: 0 }, "near-tail");
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 0 }, "last");

    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 0, 2));
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe("first");
    expect(getCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 0 })).toBe("near-tail");

    executeWorkbookCommand(
      session,
      createDeleteSheetAxisCommand(sheet.id, "row", MAX_SHEET_ROWS - 2, 2),
    );
    expect(getCellValue(sheet, { row: MAX_SHEET_ROWS - 2, column: 0 })).toBeNull();
  });

  test("does not record an empty structure change or discard redo history", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "redo");
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 0));
    undoWorkbookCommand(session);

    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 100)),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
    expect(session.history.redoStack).toHaveLength(1);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
  });

  test("rejects invalid axis ranges atomically", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 2, column: 2 }, "keep");
    setRowHeight(sheet, 2, 40);
    const before = createSheetSparseState(sheet);

    for (const command of [
      createInsertSheetAxisCommand(sheet.id, "row", -1),
      createDeleteSheetAxisCommand(sheet.id, "column", 0, 0),
      createInsertSheetAxisCommand(sheet.id, "row", MAX_SHEET_ROWS, 1),
      createDeleteSheetAxisCommand(sheet.id, "column", MAX_SHEET_COLUMNS - 1, 2),
    ]) {
      expect(() => executeWorkbookCommand(session, command)).toThrow(RangeError);
      expect(createSheetSparseState(sheet)).toEqual(before);
      expect(session.history.undoStack).toHaveLength(0);
    }
  });

  test("validates an internal sparse-state replacement before mutating the sheet", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 2, column: 2 }, "keep");
    const before = createSheetSparseState(sheet);
    const command = {
      type: "replaceSheetSparseState",
      sheetId: sheet.id,
      state: {
        cells: [
          { address: { row: 0, column: 0 }, value: "first" },
          { address: { row: 0, column: 0 }, value: "duplicate" },
        ],
        rowHeights: [],
        columnWidths: [],
      },
    } as WorkbookCommand;

    expect(() => applyWorkbookCommand(session.workbook, command)).toThrow("duplicate cell");
    expect(createSheetSparseState(sheet)).toEqual(before);
  });
});
