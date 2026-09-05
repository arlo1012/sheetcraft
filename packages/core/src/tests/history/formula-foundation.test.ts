import { describe, expect, test } from "vitest";
import {
  createBatchSetCellContentsCommand,
  createInsertSheetAxisCommand,
  createMoveCellRangeCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import { createFormulaError } from "../../formula/types.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { getActiveSheet, getCellContent } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("formula foundation history", () => {
  test("keeps typed errors, empty strings and exact raw references through edits, move, and axis history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const empty = serializeWorkbook(session.workbook);
    const contents = [
      { kind: "error", error: createFormulaError("NA") },
      { kind: "literal", value: "" },
      { kind: "formula", formula: { source: "= a1 + $A$1 " } },
    ] as const;
    executeWorkbookCommand(
      session,
      createBatchSetCellContentsCommand(
        contents.map((content, row) => ({
          sheetId: sheet.id,
          address: { row, column: 0 },
          content,
        })),
      ),
    );
    const filled = serializeWorkbook(session.workbook);
    expect(session.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(session.workbook)).toEqual(empty);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(session.workbook)).toEqual(filled);
    for (const command of [
      createMoveCellRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        { row: 0, column: 2 },
      ),
      createInsertSheetAxisCommand(sheet.id, "row", 0),
    ]) {
      executeWorkbookCommand(session, command);
      const after = serializeWorkbook(session.workbook);
      undoWorkbookCommand(session);
      expect(serializeWorkbook(session.workbook)).toEqual(filled);
      redoWorkbookCommand(session);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
      undoWorkbookCommand(session);
    }
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual(contents[2]);
  });

  test("preflights a corrupt error in a batch before mutating any cell or history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const before = serializeWorkbook(session.workbook);
    const command = {
      type: "setCellContents",
      changes: [
        {
          sheetId: sheet.id,
          address: { row: 0, column: 0 },
          content: { kind: "literal", value: "valid" },
        },
        {
          sheetId: sheet.id,
          address: { row: 0, column: 1 },
          content: { kind: "error", error: { kind: "formula-error", code: "UNKNOWN" } },
        },
      ],
    } as unknown as WorkbookCommand;
    expect(() => executeWorkbookCommand(session, command)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(0);
  });
});
