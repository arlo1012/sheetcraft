import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import {
  createAddSheetCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createMoveSheetCommand,
  createRenameSheetCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { WorkbookDomainError } from "../../errors.js";
import {
  getCellStyle,
  getCellValue,
  getWorkbookSheets,
  setActiveSheet,
  setCellStyle,
  setCellValue,
  setColumnWidth,
  setRowHeight,
} from "../../workbook.js";

describe("sheet commands", () => {
  test("adds a sheet, activates it, and restores map order through undo and redo", () => {
    const session = createTestWorkbookSession();
    const initialSheetId = session.workbook.activeSheetId;

    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-2" }));

    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.name)).toEqual([
      "Sheet1",
      "Sheet2",
    ]);
    expect(session.workbook.activeSheetId).toBe("sheet-2");

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.id)).toEqual([initialSheetId]);
    expect(session.workbook.activeSheetId).toBe(initialSheetId);

    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.id)).toEqual([
      initialSheetId,
      "sheet-2",
    ]);
  });

  test("renames and deletes sheets reversibly while selecting the next sheet after active deletion", () => {
    const session = createTestWorkbookSession();
    const firstSheetId = session.workbook.activeSheetId;
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-2" }));
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-3" }));
    setActiveSheet(session.workbook, "sheet-2");

    executeWorkbookCommand(session, createRenameSheetCommand("sheet-2", " Budget "));
    expect(session.workbook.sheets.get("sheet-2")?.name).toBe("Budget");
    undoWorkbookCommand(session);
    expect(session.workbook.sheets.get("sheet-2")?.name).toBe("Sheet2");
    redoWorkbookCommand(session);

    executeWorkbookCommand(session, createDeleteSheetCommand(session.workbook, "sheet-2"));
    expect(session.workbook.activeSheetId).toBe("sheet-3");
    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.id)).toEqual([
      firstSheetId,
      "sheet-3",
    ]);

    undoWorkbookCommand(session);
    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.id)).toEqual([
      firstSheetId,
      "sheet-2",
      "sheet-3",
    ]);
    expect(session.workbook.activeSheetId).toBe("sheet-2");
  });

  test("duplicates a complete sparse sheet independently and restores it through undo and redo", () => {
    const session = createTestWorkbookSession();
    const source = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    setCellValue(source, { row: 1, column: 2 }, "Budget");
    setCellStyle(
      source,
      { row: 1, column: 2 },
      { bold: true, numberFormat: { kind: "percent", fractionDigits: 1 } },
    );
    setRowHeight(source, 1, 40);
    setColumnWidth(source, 2, 144);

    executeWorkbookCommand(
      session,
      createDuplicateSheetCommand(session.workbook, source.id, { id: "sheet-2" }),
    );

    const copy = session.workbook.sheets.get("sheet-2")!;
    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.id)).toEqual([
      source.id,
      "sheet-2",
    ]);
    expect(copy.name).toBe("Sheet1 (2)");
    expect(session.workbook.activeSheetId).toBe("sheet-2");
    expect(getCellValue(copy, { row: 1, column: 2 })).toBe("Budget");
    expect(getCellStyle(copy, { row: 1, column: 2 })).toEqual({
      bold: true,
      numberFormat: { kind: "percent", fractionDigits: 1 },
    });
    expect(copy.rowHeights.get(1)).toBe(40);
    expect(copy.columnWidths.get(2)).toBe(144);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.id)).toEqual([source.id]);
    expect(session.workbook.activeSheetId).toBe(source.id);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(session.workbook.activeSheetId).toBe("sheet-2");
    expect(getCellValue(session.workbook.sheets.get("sheet-2")!, { row: 1, column: 2 })).toBe(
      "Budget",
    );

    const restoredCopy = session.workbook.sheets.get("sheet-2")!;
    setCellValue(restoredCopy, { row: 1, column: 2 }, "Copy only");
    setCellStyle(restoredCopy, { row: 1, column: 2 }, { italic: true });
    setRowHeight(restoredCopy, 1, 48);
    setColumnWidth(restoredCopy, 2, 160);
    expect(getCellValue(source, { row: 1, column: 2 })).toBe("Budget");
    expect(getCellStyle(source, { row: 1, column: 2 })).toEqual({
      bold: true,
      numberFormat: { kind: "percent", fractionDigits: 1 },
    });
    expect(source.rowHeights.get(1)).toBe(40);
    expect(source.columnWidths.get(2)).toBe(144);
  });

  test("moves sheets reversibly without changing the active sheet or recording no-ops", () => {
    const session = createTestWorkbookSession();
    const firstSheetId = session.workbook.activeSheetId;
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-2" }));
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-3" }));
    setActiveSheet(session.workbook, firstSheetId);

    expect(
      executeWorkbookCommand(session, createMoveSheetCommand(session.workbook, "sheet-3", 0)),
    ).toBe(true);
    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.id)).toEqual([
      "sheet-3",
      firstSheetId,
      "sheet-2",
    ]);
    expect(session.workbook.activeSheetId).toBe(firstSheetId);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.id)).toEqual([
      firstSheetId,
      "sheet-2",
      "sheet-3",
    ]);
    expect(
      executeWorkbookCommand(session, createMoveSheetCommand(session.workbook, "sheet-3", 2)),
    ).toBe(false);
    expect(session.history.redoStack).toHaveLength(1);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.id)).toEqual([
      "sheet-3",
      firstSheetId,
      "sheet-2",
    ]);
  });

  test("does not allow the final sheet to be deleted", () => {
    const session = createTestWorkbookSession();

    expect(() =>
      createDeleteSheetCommand(session.workbook, session.workbook.activeSheetId),
    ).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: { code: "last_sheet_removal", details: { sheetId: session.workbook.activeSheetId } },
      }),
    );
  });

  test("uses domain errors for missing-sheet delete command creation", () => {
    const session = createTestWorkbookSession();

    expect(() => createDeleteSheetCommand(session.workbook, "missing-sheet")).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: { code: "sheet_not_found", details: { sheetId: "missing-sheet" } },
      }),
    );
  });

  test("rejects invalid public sheet command creator payloads with domain errors", () => {
    const session = createTestWorkbookSession();

    expect(() => createAddSheetCommand(session.workbook)).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: { code: "invalid_command_payload", details: { field: "idFactory", value: null } },
      }),
    );
    expect(() => createRenameSheetCommand(session.workbook.activeSheetId, "   ")).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: { code: "invalid_command_payload", details: { field: "name", value: "   " } },
      }),
    );
    expect(() =>
      createDuplicateSheetCommand(session.workbook, "missing", { id: "sheet-2" }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: { code: "sheet_not_found", details: { sheetId: "missing" } },
      }),
    );
    expect(() =>
      createMoveSheetCommand(session.workbook, session.workbook.activeSheetId, 1),
    ).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: { code: "invalid_command_payload", details: { field: "toIndex", value: 1 } },
      }),
    );
    expect(() =>
      createAddSheetCommand(session.workbook, {
        idFactory: () => {
          throw new Error("runtime entropy unavailable");
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: {
          code: "workbook_operation_failed",
          details: { reason: "runtime entropy unavailable" },
        },
      }),
    );
  });
});
