import { describe, expect, test } from "vitest";
import {
  createAddSheetCommand,
  createDeleteSheetCommand,
  createRenameSheetCommand,
} from "../../../../modules/workbook/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../../modules/workbook/history";
import { getWorkbookSheets, setActiveSheet } from "../../../../modules/workbook/workbook";

describe("sheet commands", () => {
  test("adds a sheet, activates it, and restores map order through undo and redo", () => {
    const session = createWorkbookSession();
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
    const session = createWorkbookSession();
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
    const session = createWorkbookSession();

    expect(() =>
      createDeleteSheetCommand(session.workbook, session.workbook.activeSheetId),
    ).toThrow("at least one sheet");
  });
});
