import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import {
  createAddSheetCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createMoveSheetCommand,
  createRenameSheetCommand,
  createSetSheetPropertiesCommand,
  applyWorkbookCommand,
  createBatchSetCellContentsCommand,
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
    source.properties = { tabColor: "#123abc", pinned: true, hidden: false, protected: true };

    executeWorkbookCommand(
      session,
      createDuplicateSheetCommand(session.workbook, source.id, {
        id: "sheet-2",
      }),
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
    expect(copy.properties).toEqual({
      tabColor: "#123ABC",
      pinned: false,
      hidden: false,
      protected: false,
    });

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getWorkbookSheets(session.workbook).map((sheet) => sheet.id)).toEqual([source.id]);
    expect(session.workbook.activeSheetId).toBe(source.id);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(session.workbook.activeSheetId).toBe("sheet-2");
    expect(
      getCellValue(session.workbook.sheets.get("sheet-2")!, {
        row: 1,
        column: 2,
      }),
    ).toBe("Budget");

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
        data: {
          code: "last_sheet_removal",
          details: { sheetId: session.workbook.activeSheetId },
        },
      }),
    );
  });

  test("uses domain errors for missing-sheet delete command creation", () => {
    const session = createTestWorkbookSession();

    expect(() => createDeleteSheetCommand(session.workbook, "missing-sheet")).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: {
          code: "sheet_not_found",
          details: { sheetId: "missing-sheet" },
        },
      }),
    );
  });

  test("rejects invalid public sheet command creator payloads with domain errors", () => {
    const session = createTestWorkbookSession();

    expect(() => createAddSheetCommand(session.workbook)).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: {
          code: "invalid_command_payload",
          details: { field: "idFactory", value: null },
        },
      }),
    );
    expect(() => createRenameSheetCommand(session.workbook.activeSheetId, "   ")).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: {
          code: "invalid_command_payload",
          details: { field: "name", value: "   " },
        },
      }),
    );
    expect(() =>
      createDuplicateSheetCommand(session.workbook, "missing", {
        id: "sheet-2",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: { code: "sheet_not_found", details: { sheetId: "missing" } },
      }),
    );
    expect(() =>
      createMoveSheetCommand(session.workbook, session.workbook.activeSheetId, 1),
    ).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: {
          code: "invalid_command_payload",
          details: { field: "toIndex", value: 1 },
        },
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

  test("hides the active sheet reversibly and keeps a visible active sheet", () => {
    const session = createTestWorkbookSession();
    const first = session.workbook.activeSheetId;
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-2" }));
    executeWorkbookCommand(
      session,
      createSetSheetPropertiesCommand(session.workbook, "sheet-2", {
        hidden: true,
      }),
    );
    expect(session.workbook.activeSheetId).toBe(first);
    expect(session.workbook.sheets.get("sheet-2")?.properties.hidden).toBe(true);
    expect(() => setActiveSheet(session.workbook, "sheet-2")).toThrow("hidden");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(session.workbook.activeSheetId).toBe("sheet-2");
    expect(session.workbook.sheets.get("sheet-2")?.properties.hidden).toBe(false);
  });

  test("cannot hide or delete the only visible sheet", () => {
    const session = createTestWorkbookSession();
    const first = session.workbook.activeSheetId;
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-2" }));
    executeWorkbookCommand(
      session,
      createSetSheetPropertiesCommand(session.workbook, "sheet-2", {
        hidden: true,
      }),
    );
    expect(() =>
      createSetSheetPropertiesCommand(session.workbook, first, {
        hidden: true,
      }),
    ).toThrow("visible");
    expect(() => createDeleteSheetCommand(session.workbook, first)).toThrow(
      "contain at least one sheet",
    );
  });

  test("validates an explicit active sheet before changing sheet properties", () => {
    const session = createTestWorkbookSession();
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-2" }));
    const before = structuredClone(session.workbook.sheets.get("sheet-2")?.properties);
    const activeBefore = session.workbook.activeSheetId;
    expect(() =>
      applyWorkbookCommand(session.workbook, {
        type: "setSheetProperties",
        sheetId: "sheet-2",
        properties: { pinned: false, hidden: true, protected: false },
        activeSheetId: "sheet-2",
      }),
    ).toThrow("activeSheetId");
    expect(session.workbook.sheets.get("sheet-2")?.properties).toEqual(before);
    expect(session.workbook.activeSheetId).toBe(activeBefore);
    expect(() =>
      applyWorkbookCommand(session.workbook, {
        type: "setSheetProperties",
        sheetId: "sheet-2",
        properties: { pinned: false, hidden: true, protected: false },
        activeSheetId: "missing",
      }),
    ).toThrow("does not exist");
    expect(session.workbook.sheets.get("sheet-2")?.properties).toEqual(before);
  });

  test("rejects protected sheets atomically across a cell batch", () => {
    const session = createTestWorkbookSession();
    const first = session.workbook.activeSheetId;
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-2" }));
    executeWorkbookCommand(
      session,
      createSetSheetPropertiesCommand(session.workbook, "sheet-2", { protected: true }),
    );
    expect(() =>
      applyWorkbookCommand(
        session.workbook,
        createBatchSetCellContentsCommand([
          {
            sheetId: first,
            address: { row: 0, column: 0 },
            content: { kind: "literal", value: "ok" },
          },
          {
            sheetId: "sheet-2",
            address: { row: 0, column: 0 },
            content: { kind: "literal", value: "blocked" },
          },
        ]),
      ),
    ).toThrow("protected");
    expect(getCellValue(session.workbook.sheets.get(first)!, { row: 0, column: 0 })).toBeNull();
  });

  test("rewrites conditional-format qualified references on rename and restores them through history", () => {
    const session = createTestWorkbookSession();
    const sourceId = session.workbook.activeSheetId;
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-2" }));
    const target = session.workbook.sheets.get("sheet-2")!;
    target.conditionalFormats = [
      {
        id: "source-check",
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
        anchor: { row: 0, column: 0 },
        condition: { kind: "formula", formula: "=Sheet1!A1>0" },
        style: { textColor: "#FF0000" },
      },
    ];

    expect(executeWorkbookCommand(session, createRenameSheetCommand(sourceId, "Source Data"))).toBe(
      true,
    );
    expect(target.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "='Source Data'!A1>0",
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(target.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "=Sheet1!A1>0",
    });
  });

  test("marks conditional-format references to a deleted sheet and restores them on undo", () => {
    const session = createTestWorkbookSession();
    const sourceId = session.workbook.activeSheetId;
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-2" }));
    const target = session.workbook.sheets.get("sheet-2")!;
    target.conditionalFormats = [
      {
        id: "source-check",
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
        anchor: { row: 0, column: 0 },
        condition: { kind: "formula", formula: "=Sheet1!A1>0" },
        style: { textColor: "#FF0000" },
      },
    ];

    expect(
      executeWorkbookCommand(session, createDeleteSheetCommand(session.workbook, sourceId)),
    ).toBe(true);
    expect(target.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "=#REF!>0",
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(target.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "=Sheet1!A1>0",
    });
  });
});
