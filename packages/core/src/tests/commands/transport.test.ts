import { describe, expect, test } from "vitest";
import {
  createAddSheetCommand,
  createApplyCellBordersCommand,
  createApplyCellStyleCommand,
  createBatchSetCellValuesCommand,
  createClearCellRangeCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createInsertSheetAxisCommand,
  createRenameSheetCommand,
  createResizeSheetDimensionCommand,
  createRestoreCellStylesCommand,
  createRestoreSheetStateCommand,
  createSetCellValueCommand,
  tryApplyWorkbookCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "../../history.js";
import { createSheetSparseState, getActiveSheet, getCellValue } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function expectTransportSafe(command: WorkbookCommand): void {
  expect(structuredClone(command)).toEqual(command);
  expect(JSON.parse(JSON.stringify(command))).toEqual(command);
}

describe("workbook command transport", () => {
  test("uses a sheet snapshot rather than a Map-backed sheet in add-sheet commands", () => {
    const session = createTestWorkbookSession();
    const command = createAddSheetCommand(session.workbook, { id: "sheet-2" });

    expect(command.sheet).toEqual({
      id: "sheet-2",
      name: "Sheet2",
      cells: [],
      rowHeights: [],
      columnWidths: [],
    });
    expectTransportSafe(command);

    const result = tryApplyWorkbookCommand(session.workbook, structuredClone(command));
    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok || !result.changed) throw new Error("Expected an add-sheet inverse command.");
    expectTransportSafe(result.inverse);
  });

  test("returns a public restore-sheet-state inverse for structural commands", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetCellValueCommand(sheet.id, { row: 2, column: 1 }, "before insert"),
    );

    const result = tryApplyWorkbookCommand(
      session.workbook,
      createInsertSheetAxisCommand(sheet.id, "row", 1),
    );
    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok || !result.changed) throw new Error("Expected a structural inverse command.");
    expect(result.inverse.type).toBe("restoreSheetState");
    expectTransportSafe(result.inverse);

    const restore = tryApplyWorkbookCommand(session.workbook, structuredClone(result.inverse));
    expect(restore).toMatchObject({ ok: true, changed: true });
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe("before insert");
  });

  test("reports invalid command payloads without throwing across a transport boundary", () => {
    const session = createTestWorkbookSession();
    const invalid = { type: "unknownCommand" } as unknown as WorkbookCommand;

    expect(tryApplyWorkbookCommand(session.workbook, invalid)).toEqual({
      ok: false,
      error: { code: "invalid_command", details: { type: "unknownCommand" } },
    });
  });

  test("stores stable operation codes rather than display descriptions in history", () => {
    const session: WorkbookSession = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    executeWorkbookCommand(
      session,
      createSetCellValueCommand(sheet.id, { row: 0, column: 0 }, "Draft"),
      "cells.paste",
    );

    expect(session.history.undoStack).toHaveLength(1);
    expect(session.history.undoStack[0]?.operation).toBe("cells.paste");
    expect(Object.hasOwn(session.history.undoStack[0] ?? {}, "description")).toBe(false);
  });

  test("keeps every public command and both history stacks transport-safe", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const addSheet = createAddSheetCommand(session.workbook, { id: "sheet-2" });
    const addResult = tryApplyWorkbookCommand(session.workbook, addSheet);
    if (!addResult.ok || !addResult.changed) throw new Error("Expected a sheet to be added.");
    const commands: WorkbookCommand[] = [
      createSetCellValueCommand(sheet.id, { row: 0, column: 0 }, "A"),
      createBatchSetCellValuesCommand([
        { sheetId: sheet.id, address: { row: 0, column: 0 }, value: "A" },
      ]),
      createClearCellRangeCommand(sheet.id, {
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
      }),
      createApplyCellStyleCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        { bold: true },
      ),
      createApplyCellBordersCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        { preset: "all", border: { style: "thin", color: "#123456" } },
      ),
      createRestoreCellStylesCommand(sheet.id, [{ address: { row: 0, column: 0 }, style: null }]),
      createResizeSheetDimensionCommand(sheet.id, "row", 0, 30),
      addSheet,
      createDeleteSheetCommand(session.workbook, "sheet-2"),
      createRenameSheetCommand(sheet.id, "Renamed"),
      createInsertSheetAxisCommand(sheet.id, "row", 0),
      createDeleteSheetAxisCommand(sheet.id, "column", 0),
      createRestoreSheetStateCommand(sheet.id, createSheetSparseState(sheet)),
    ];
    commands.forEach(expectTransportSafe);

    executeWorkbookCommand(
      session,
      createSetCellValueCommand(sheet.id, { row: 1, column: 0 }, "A"),
    );
    executeWorkbookCommand(
      session,
      createSetCellValueCommand(sheet.id, { row: 1, column: 1 }, "B"),
    );
    undoWorkbookCommand(session);
    expect(session.history.undoStack).toHaveLength(1);
    expect(session.history.redoStack).toHaveLength(1);
    expect(structuredClone(session.history.undoStack)).toEqual(session.history.undoStack);
    expect(structuredClone(session.history.redoStack)).toEqual(session.history.redoStack);
    expect(JSON.parse(JSON.stringify(session.history.undoStack))).toEqual(
      session.history.undoStack,
    );
    expect(JSON.parse(JSON.stringify(session.history.redoStack))).toEqual(
      session.history.redoStack,
    );
    expect(redoWorkbookCommand(session)).toBe(true);
  });
});
