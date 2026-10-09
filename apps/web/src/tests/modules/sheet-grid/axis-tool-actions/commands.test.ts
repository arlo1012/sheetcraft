import { describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSheetEvaluator,
  getActiveSheet,
  getColumnWidth,
  getRowHeight,
  setCellValue,
} from "@sheetcraft/core/workbook";
import { createAxisToolActions } from "../../../../modules/sheet-grid/axis-tool-actions";

function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const flush = vi.fn(() => true);
  const error = vi.fn();
  const actions = createAxisToolActions({
    getSheet: () => sheet,
    getEvaluator: () => createSheetEvaluator(sheet),
    getDateSystem: () => "1900",
    getLocale: () => "en-US",
    measurer: { measure: (text) => text.length * 10 },
    flushPendingEdits: flush,
    execute: (command) => executeWorkbookCommand(session, command),
    onError: error,
  });
  return { session, sheet, actions, flush, error };
}

describe("axis tool commands", () => {
  test("resizes multiple rows in one undo and restores hidden custom columns from the adjacent selection", () => {
    const { session, sheet, actions } = fixture();
    const original = getRowHeight(sheet, 0);
    actions.resize({ axis: "row", index: 0, count: 3, size: 45 });
    expect([0, 1, 2].map((row) => getRowHeight(sheet, row))).toEqual([45, 45, 45]);
    expect(session.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(session);
    expect(getRowHeight(sheet, 1)).toBe(original);
    sheet.columnWidths.set(0, 177);
    actions.visibility({ axis: "column", index: 0, count: 1, hidden: true });
    expect(getColumnWidth(sheet, 0)).toBe(0);
    actions.visibility({ axis: "column", index: 1, count: 1, hidden: false });
    expect(getColumnWidth(sheet, 0)).toBe(177);
  });

  test("autofits whole selected columns including content outside the cell selection and undoes once", () => {
    const { session, sheet, actions } = fixture();
    sheet.columnWidths.set(0, 200);
    sheet.columnWidths.set(1, 200);
    setCellValue(sheet, { row: 80, column: 0 }, "Short");
    setCellValue(sheet, { row: 0, column: 1 }, "x".repeat(30));
    actions.autoFit({
      axis: "column",
      range: { start: { row: 0, column: 0 }, end: { row: 0, column: 1 } },
    });
    expect(getColumnWidth(sheet, 0)).toBeGreaterThan(50);
    expect(getColumnWidth(sheet, 0)).toBeLessThan(200);
    expect(getColumnWidth(sheet, 1)).toBeGreaterThan(300);
    expect(session.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(session);
    expect(getColumnWidth(sheet, 0)).toBe(200);
    expect(getColumnWidth(sheet, 1)).toBe(200);
  });

  test("updates standard width sparsely and prevents operations when editing cannot finish or sheet is protected", () => {
    const { session, sheet, actions, flush } = fixture();
    sheet.columnWidths.set(4, 222);
    actions.standardWidth({ size: 81 });
    expect(getColumnWidth(sheet, 0)).toBe(81);
    expect(getColumnWidth(sheet, 4)).toBe(222);
    expect(sheet.columnWidths.size).toBe(1);
    flush.mockReturnValue(false);
    actions.resize({ axis: "row", index: 0, count: 2, size: 60 });
    expect(session.history.undoStack).toHaveLength(1);
    flush.mockReturnValue(true);
    sheet.properties.protected = true;
    actions.visibility({ axis: "column", index: 0, count: 1, hidden: true });
    expect(sheet.hiddenColumns?.size ?? 0).toBe(0);
  });
});
