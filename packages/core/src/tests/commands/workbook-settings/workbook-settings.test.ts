import { describe, expect, test } from "vitest";
import {
  createSetWorkbookDateSystemCommand,
  tryApplyWorkbookCommand,
  type WorkbookCommand,
} from "../../../commands/index.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../history.js";
import { serializeWorkbook } from "../../../serialization.js";
import { getActiveSheet, setCellContent, setCellValue } from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

describe("workbook date-system commands", () => {
  test("changes interpretation atomically without converting numeric cells or formula sources", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, 1462);
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "= a1 + 1 " } },
    );
    const before = serializeWorkbook(session.workbook);
    expect(executeWorkbookCommand(session, createSetWorkbookDateSystemCommand("1900"))).toBe(false);
    expect(executeWorkbookCommand(session, createSetWorkbookDateSystemCommand("1904"))).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(after).toEqual({ ...before, dateSystem: "1904" });
    expect(session.history.undoStack).toHaveLength(1);
    expect(session.history.undoStack[0]?.operation).toBe("workbook.dateSystem");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("rejects invalid settings before changing state or history", () => {
    const session = createTestWorkbookSession();
    const before = serializeWorkbook(session.workbook);
    const command = {
      type: "setWorkbookDateSystem",
      dateSystem: "1901",
    } as unknown as WorkbookCommand;
    expect(tryApplyWorkbookCommand(session.workbook, command)).toMatchObject({
      ok: false,
      error: { code: "invalid_command_payload" },
    });
    expect(() => executeWorkbookCommand(session, command)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(0);
  });
});
