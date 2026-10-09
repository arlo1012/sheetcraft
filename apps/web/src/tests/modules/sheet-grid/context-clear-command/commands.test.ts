import { describe, expect, test } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSheetSparseState,
  getActiveSheet,
  getCellContent,
  getCellStyle,
  getCellNote,
  MAX_SHEET_ROWS,
  setCellContent,
  setCellStyle,
  setCellNote,
  setCellValue,
} from "@sheetcraft/core/workbook";
import { createContextClearCommand } from "../../../../modules/sheet-grid/context-clear-command";

describe("context menu clear commands", () => {
  test("clears formats on a sparse whole column, preserves formulas and other columns, and undoes", () => {
    const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(session.workbook);
    const address = { row: MAX_SHEET_ROWS - 1, column: 2 };
    setCellContent(sheet, address, { kind: "formula", formula: { source: "=1+2" } });
    setCellStyle(sheet, address, { bold: true, fillColor: "#ff0000" });
    setCellStyle(sheet, { row: 0, column: 3 }, { italic: true });
    const before = createSheetSparseState(sheet);
    executeWorkbookCommand(
      session,
      createContextClearCommand(sheet, { start: { row: 0, column: 2 }, end: address }, "formats"),
    );
    expect(getCellContent(sheet, address)).toEqual({
      kind: "formula",
      formula: { source: "=1+2" },
    });
    expect(getCellStyle(sheet, address)).toBeUndefined();
    expect(getCellStyle(sheet, { row: 0, column: 3 })?.italic).toBe(true);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("clears content and styles together as one undoable action without shifting cells", () => {
    const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 3, column: 2 }, "remove");
    setCellStyle(sheet, { row: 3, column: 2 }, { bold: true });
    setCellNote(sheet, { row: 3, column: 2 }, { text: "remove note" });
    setCellValue(sheet, { row: 4, column: 2 }, "keep");
    const before = createSheetSparseState(sheet);
    executeWorkbookCommand(
      session,
      createContextClearCommand(
        sheet,
        { start: { row: 3, column: 2 }, end: { row: 3, column: 2 } },
        "all",
      ),
    );
    expect(sheet.cells.has("3:2")).toBe(false);
    expect(getCellContent(sheet, { row: 4, column: 2 })).toEqual({
      kind: "literal",
      value: "keep",
    });
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.cells.has("3:2")).toBe(false);
  });

  test("clears contents while retaining notes, and clears notes only with clear all", () => {
    const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 3, column: 2 };
    setCellValue(sheet, address, "remove");
    setCellNote(sheet, address, { text: "keep until clear all" });

    executeWorkbookCommand(
      session,
      createContextClearCommand(sheet, { start: address, end: address }, "contents"),
    );
    expect(getCellContent(sheet, address)).toBeNull();
    expect(getCellNote(sheet, address)).toEqual({ text: "keep until clear all" });

    executeWorkbookCommand(
      session,
      createContextClearCommand(sheet, { start: address, end: address }, "all"),
    );
    expect(getCellNote(sheet, address)).toBeUndefined();
  });
});
