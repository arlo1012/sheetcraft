import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import {
  createAddSheetCommand,
  createDeleteSheetCommand,
  createRenameSheetCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { WorkbookDomainError } from "../../errors.js";
import { getWorkbookSheets, setActiveSheet } from "../../workbook.js";

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
