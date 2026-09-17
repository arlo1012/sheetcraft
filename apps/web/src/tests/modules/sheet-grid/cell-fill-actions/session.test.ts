import { describe, expect, test } from "vitest";
import { WorkbookDomainError } from "@idea10/core/errors";
import { reactive } from "vue";
import {
  createWorkbookSession,
  executeReplaceableWorkbookCommand,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createSetCellContentCommand } from "@idea10/core/commands";
import {
  getActiveSheet,
  getCellValue,
  getCellStyle,
  setCellValue,
  setCellStyle,
} from "@idea10/core/workbook";
import { createCellFillActions } from "../../../../modules/sheet-grid/cell-fill-actions";

function setup() {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  let revision = 0;
  const actions = createCellFillActions({
    getWorkbook: () => session.workbook,
    getSheetId: () => sheet.id,
    getRevision: () => revision,
    execute: (command, token) => {
      const result = executeReplaceableWorkbookCommand(session, token, command);
      if (result.changed) revision++;
      return result;
    },
  });
  const source = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
  const range = { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } };
  return {
    session,
    sheet,
    actions,
    fill: () => actions.apply({ type: "fill", sheetId: sheet.id, source, range, revision }),
  };
}

describe("auto fill sessions", () => {
  test("reports a duplicate rejection without changing the fill target", () => {
    const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "Ada");
    const actions = createCellFillActions({
      getWorkbook: () => session.workbook,
      getSheetId: () => sheet.id,
      getRevision: () => 0,
      execute: () => {
        throw new WorkbookDomainError({
          code: "invalid_command_payload",
          details: { field: "duplicate" },
        });
      },
    });
    expect(
      actions.apply({
        type: "fill",
        sheetId: sheet.id,
        revision: 0,
        source: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      }),
    ).toEqual({ ok: false, reason: "duplicate" });
    expect(getCellValue(sheet, { row: 1, column: 0 })).toBeNull();
  });

  test("mode changes from a Vue session preserve target content and one undo entry", () => {
    const { session, sheet, actions, fill } = setup();
    setCellValue(sheet, { row: 0, column: 0 }, 1);
    setCellValue(sheet, { row: 1, column: 0 }, 99);
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true });
    setCellStyle(sheet, { row: 1, column: 0 }, { italic: true });
    const first = fill();
    if (!first.ok) throw new Error(first.reason);
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe(1);
    expect(actions.apply({ type: "mode", sessionId: first.session.id, mode: "series" }).ok).toBe(
      true,
    );
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe(3);
    expect(
      actions.apply({ type: "mode", sessionId: first.session.id, mode: "fillFormatsOnly" }).ok,
    ).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 0 })).toBe(99);
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBeNull();
    expect(getCellStyle(sheet, { row: 1, column: 0 })?.bold).toBe(true);
    expect(
      actions.apply({ type: "mode", sessionId: first.session.id, mode: "fillWithoutFormatting" })
        .ok,
    ).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 0 })).toBe(1);
    expect(getCellStyle(sheet, { row: 1, column: 0 })?.italic).toBe(true);
    expect(
      actions.apply({ type: "mode", sessionId: first.session.id, mode: "fillFormatsOnly" }).ok,
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 0 })?.italic).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 0 })?.bold).toBe(true);
  });
  test("rejects an expired token even when the host revision is stale", () => {
    const { session, sheet, actions, fill } = setup();
    setCellValue(sheet, { row: 0, column: 0 }, 1);
    const first = fill();
    if (!first.ok) throw new Error(first.reason);
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 8, column: 1 }, { kind: "literal", value: 42 }),
    );
    expect(actions.apply({ type: "mode", sessionId: first.session.id, mode: "series" })).toEqual({
      ok: false,
      reason: "documentChanged",
    });
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe(1);
    expect(getCellValue(sheet, { row: 8, column: 1 })).toBe(42);
  });
  test("clear releases the previous fill and protected sheets refuse edits", () => {
    const { sheet, actions, fill } = setup();
    setCellValue(sheet, { row: 0, column: 0 }, 1);
    const first = fill();
    if (!first.ok) throw new Error(first.reason);
    actions.clear();
    expect(actions.apply({ type: "mode", sessionId: first.session.id, mode: "series" })).toEqual({
      ok: false,
      reason: "documentChanged",
    });
    sheet.properties.protected = true;
    expect(fill()).toEqual({ ok: false, reason: "readOnly" });
  });
});
