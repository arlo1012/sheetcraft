import { describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  getCellSparkline,
  insertSheet,
} from "@sheetcraft/core/workbook";
import { useSparklineActions } from "../../../modules/sparklines/useSparklineActions";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";

function fixture() {
  let workbook = createWorkbook({ id: "sparklines", sheetId: "first" });
  let sheet = getActiveSheet(workbook);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let busy = false;
  const flush = vi.fn(() => true);
  const execute = vi.fn((command) => executeWorkbookCommand(session, command));
  const actions = useSparklineActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getRange: () => ({ start: { row: 0, column: 0 }, end: { row: 1, column: 2 } }),
    flush,
    isBusy: () => busy,
    execute,
  });
  return {
    actions,
    session,
    execute,
    flush,
    get sheet() {
      return sheet;
    },
    switchSheet() {
      sheet = createSheet("Other", "other");
      insertSheet(workbook, sheet);
    },
    replaceWorkbook() {
      workbook = createWorkbook({ id: "replacement", sheetId: sheet.id });
    },
    setBusy() {
      busy = true;
    },
  };
}

describe("sparkline actions", () => {
  test("creates one sparkline per source row in one undoable command", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.draft.value!);
    expect(f.execute).toHaveBeenCalledTimes(1);
    for (let row = 0; row < 2; row++)
      expect(getCellSparkline(f.sheet, { row, column: 3 })?.source).toEqual({
        start: { row, column: 0 },
        end: { row, column: 2 },
      });
    expect(f.actions.draft.value).toBeUndefined();
    undoWorkbookCommand(f.session);
    expect(getCellSparkline(f.sheet, { row: 0, column: 3 })).toBeUndefined();
    expect(getCellSparkline(f.sheet, { row: 1, column: 3 })).toBeUndefined();
  });

  test("creates one sparkline per source column for a horizontal destination", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm({ ...f.actions.draft.value!, source: "A1:C2", destination: "A4:C4" });
    for (let column = 0; column < 3; column++)
      expect(getCellSparkline(f.sheet, { row: 3, column })?.source).toEqual({
        start: { row: 0, column },
        end: { row: 1, column },
      });
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  test.each(["D1:D3", "D1:E2", "D1"])("rejects incompatible destination %s", (destination) => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm({ ...f.actions.draft.value!, destination });
    expect(f.actions.error.value).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.draft.value).toBeDefined();
  });

  test.each(["switchSheet", "replaceWorkbook", "setBusy"] as const)(
    "rejects a draft after %s",
    (change) => {
      const f = fixture();
      f.actions.open();
      const draft = f.actions.draft.value!;
      f[change]();
      f.actions.confirm(draft);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test("rechecks sheet permissions when a draft is confirmed", () => {
    const f = fixture();
    f.actions.open();
    const draft = f.actions.draft.value!;
    f.sheet.properties.protected = true;
    f.actions.confirm(draft);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("does not open when editing cannot be flushed", () => {
    const f = fixture();
    f.flush.mockReturnValue(false);
    f.actions.open();
    expect(f.actions.draft.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
