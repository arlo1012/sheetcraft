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
  setCellNamedStyle,
  getCellNamedStyle,
} from "@sheetcraft/core/workbook";
import { createContextClearCommand } from "../../../../modules/sheet-grid/context-clear-command";

describe("context menu clear commands", () => {
  test("clears run-only formats and mirrored borders in one reversible transaction", () => {
    const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(session.workbook),
      address = { row: 0, column: 0 };
    const rich = {
      kind: "literal" as const,
      value: "aΩb",
      fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Sans Math" }],
    };
    setCellContent(sheet, address, rich);
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        borderLeft: { style: "thin", color: "#ff0000" },
        italic: true,
      },
    );
    const before = createSheetSparseState(sheet);
    executeWorkbookCommand(
      session,
      createContextClearCommand(sheet, { start: address, end: address }, "formats"),
    );
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "aΩb" });
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toEqual({ italic: true });
    expect(session.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(session);
    expect(createSheetSparseState(sheet)).toEqual(before);
    redoWorkbookCommand(session);
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "aΩb" });
  });

  test("clears protected numeric and rich appearances without changing edit permissions", () => {
    const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(session.workbook),
      a = { row: 0, column: 0 },
      b = { row: 0, column: 1 };
    setCellValue(sheet, a, 42);
    setCellStyle(sheet, a, { bold: true });
    setCellContent(sheet, b, {
      kind: "literal",
      value: "Ω",
      fontRuns: [{ start: 0, end: 1, fontFamily: "Noto Sans Math" }],
    });
    setCellStyle(sheet, b, { unlocked: true, italic: true });
    sheet.protection = { editableRanges: [], formatCells: true };
    const before = createSheetSparseState(sheet);
    const command = createContextClearCommand(sheet, { start: a, end: b }, "formats");
    expect(command.type === "restoreCellStyles" && "content" in command.changes[0]!).toBe(false);
    executeWorkbookCommand(session, command);
    expect(getCellContent(sheet, a)).toEqual({ kind: "literal", value: 42 });
    expect(getCellStyle(sheet, a)).toBeUndefined();
    expect(getCellStyle(sheet, b)).toEqual({ unlocked: true });
    expect(getCellContent(sheet, b)).toEqual({ kind: "literal", value: "Ω" });
    undoWorkbookCommand(session);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("keeps existing named-style removal and restores its binding on undo", () => {
    const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(session.workbook),
      a = { row: 0, column: 0 };
    setCellValue(sheet, a, "text");
    setCellNamedStyle(sheet, a, { bold: true }, { styleId: "Heading", includes: ["font"] });
    const binding = getCellNamedStyle(sheet, a);
    executeWorkbookCommand(
      session,
      createContextClearCommand(sheet, { start: a, end: a }, "formats"),
    );
    expect(getCellNamedStyle(sheet, a)).toBeUndefined();
    undoWorkbookCommand(session);
    expect(getCellNamedStyle(sheet, a)).toEqual(binding);
  });
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
