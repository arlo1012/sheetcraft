import { describe, expect, test } from "vitest";
import {
  createAddSheetCommand,
  createAdjustCellNumberFormatDecimalsCommand,
  createApplyCellBordersCommand,
  createApplyCellStyleCommand,
  createBatchSetCellContentsCommand,
  createClearCellRangeCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createInsertSheetAxisCommand,
  createMoveSheetCommand,
  createMoveCellRangeCommand,
  createRenameSheetCommand,
  createResizeSheetDimensionCommand,
  createRestoreCellStylesCommand,
  createRestoreSheetStateCommand,
  createSetCellContentCommand,
  applyWorkbookCommand,
  tryApplyWorkbookCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import { WorkbookDomainError, type WorkbookErrorCode } from "../../errors.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
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
      createSetCellContentCommand(
        sheet.id,
        { row: 2, column: 1 },
        { kind: "literal", value: "before insert" },
      ),
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

  test("uses stable domain codes consistently for expected command rejections", () => {
    const scenarios: Array<{
      code: WorkbookErrorCode;
      create: () => { session: WorkbookSession; command: WorkbookCommand };
    }> = [
      {
        code: "sheet_not_found",
        create: () => {
          const session = createTestWorkbookSession();
          return {
            session,
            command: createRenameSheetCommand("missing-sheet", "Renamed"),
          };
        },
      },
      {
        code: "sheet_name_conflict",
        create: () => {
          const session = createTestWorkbookSession();
          executeWorkbookCommand(
            session,
            createAddSheetCommand(session.workbook, { id: "sheet-2" }),
          );
          return {
            session,
            command: createRenameSheetCommand(session.workbook.activeSheetId, "Sheet1"),
          };
        },
      },
      {
        code: "last_sheet_removal",
        create: () => {
          const session = createTestWorkbookSession();
          return {
            session,
            command: {
              type: "deleteSheet",
              sheetId: session.workbook.activeSheetId,
              activeSheetId: "remaining-sheet",
            },
          };
        },
      },
      {
        code: "invalid_command_payload",
        create: () => {
          const session = createTestWorkbookSession();
          return {
            session,
            command: {
              type: "renameSheet",
              sheetId: session.workbook.activeSheetId,
              name: "   ",
            },
          };
        },
      },
      {
        code: "invalid_command_payload",
        create: () => {
          const session = createTestWorkbookSession();
          return {
            session,
            command: {
              type: "adjustCellNumberFormatDecimals",
              sheetId: session.workbook.activeSheetId,
              range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
              delta: 2,
            } as unknown as WorkbookCommand,
          };
        },
      },
      {
        code: "invalid_command_payload",
        create: () => {
          const session = createTestWorkbookSession();
          const sheetId = session.workbook.activeSheetId;
          return {
            session,
            command: createRestoreCellStylesCommand(sheetId, [
              { address: { row: 0, column: 0 }, style: { bold: true } },
              { address: { row: 0, column: 0 }, style: { italic: true } },
            ]),
          };
        },
      },
      {
        code: "invalid_command_payload",
        create: () => {
          const session = createTestWorkbookSession();
          return {
            session,
            command: {
              type: "clearCellRange",
              sheetId: session.workbook.activeSheetId,
              range: null,
            } as unknown as WorkbookCommand,
          };
        },
      },
      {
        code: "invalid_command_payload",
        create: () => {
          const session = createTestWorkbookSession();
          return {
            session,
            command: {
              type: "applyCellStyle",
              sheetId: session.workbook.activeSheetId,
              range: null,
              patch: { bold: true },
            } as unknown as WorkbookCommand,
          };
        },
      },
      {
        code: "invalid_command_payload",
        create: () => {
          const session = createTestWorkbookSession();
          return {
            session,
            command: {
              type: "restoreCellStyles",
              sheetId: session.workbook.activeSheetId,
              changes: null,
            } as unknown as WorkbookCommand,
          };
        },
      },
      {
        code: "invalid_command_payload",
        create: () => {
          const session = createTestWorkbookSession();
          return {
            session,
            command: {
              type: "restoreSheetState",
              sheetId: session.workbook.activeSheetId,
              axis: "row",
              index: 0,
              count: 1,
              operation: "delete",
              slice: null,
            } as unknown as WorkbookCommand,
          };
        },
      },
    ];

    for (const scenario of scenarios) {
      const { session, command } = scenario.create();
      const before = serializeWorkbook(session.workbook);
      let thrown: unknown;
      try {
        applyWorkbookCommand(session.workbook, command);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(WorkbookDomainError);
      const data = (thrown as WorkbookDomainError).data;
      expect(data.code).toBe(scenario.code);
      expect(serializeWorkbook(session.workbook)).toEqual(before);

      const result = tryApplyWorkbookCommand(session.workbook, command);
      expect(result).toEqual({ ok: false, error: data });
      if (result.ok) throw new Error("Expected a rejected command result.");
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(structuredClone(result.error)).toEqual(result.error);
      expect(JSON.parse(JSON.stringify(result.error))).toEqual(result.error);
    }
  });

  test("maps only unexpected command failures to workbook_operation_failed", () => {
    const session = createTestWorkbookSession();
    const sheetId = session.workbook.activeSheetId;
    const brokenWorkbook = {
      ...session.workbook,
      sheets: {
        get: () => {
          throw new TypeError("unexpected map failure");
        },
      },
    } as unknown as typeof session.workbook;

    const result = tryApplyWorkbookCommand(
      brokenWorkbook,
      createRenameSheetCommand(sheetId, "Renamed"),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "workbook_operation_failed",
        details: { reason: "unexpected map failure" },
      },
    });
  });

  test("stores stable operation codes rather than display descriptions in history", () => {
    const session: WorkbookSession = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 0 },
        { kind: "literal", value: "Draft" },
      ),
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
      createSetCellContentCommand(sheet.id, { row: 0, column: 0 }, { kind: "literal", value: "A" }),
      createBatchSetCellContentsCommand([
        {
          sheetId: sheet.id,
          address: { row: 0, column: 0 },
          content: { kind: "literal", value: "A" },
        },
      ]),
      createClearCellRangeCommand(sheet.id, {
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
      }),
      createMoveCellRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        { row: 1, column: 1 },
      ),
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
      createAdjustCellNumberFormatDecimalsCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        1,
      ),
      createRestoreCellStylesCommand(sheet.id, [{ address: { row: 0, column: 0 }, style: null }]),
      createResizeSheetDimensionCommand(sheet.id, "row", 0, 30),
      addSheet,
      createDeleteSheetCommand(session.workbook, "sheet-2"),
      createDuplicateSheetCommand(session.workbook, sheet.id, { id: "sheet-3" }),
      createRenameSheetCommand(sheet.id, "Renamed"),
      createMoveSheetCommand(session.workbook, "sheet-2", 0),
      createInsertSheetAxisCommand(sheet.id, "row", 0),
      createDeleteSheetAxisCommand(sheet.id, "column", 0),
      createRestoreSheetStateCommand(sheet.id, createSheetSparseState(sheet)),
    ];
    commands.forEach(expectTransportSafe);

    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 1, column: 0 }, { kind: "literal", value: "A" }),
    );
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 1, column: 1 }, { kind: "literal", value: "B" }),
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
