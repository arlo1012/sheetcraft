import { describe, expect, test } from "vitest";
import {
  createBatchSetCellContentsCommand,
  createPasteCellContentsCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { getActiveSheet, getCellContent } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("content commands", () => {
  test("records a multi-cell formula edit as one history command and restores raw source", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const command = createBatchSetCellContentsCommand([
      { sheetId: sheet.id, address: { row: 0, column: 0 }, content: { kind: "literal", value: 2 } },
      {
        sheetId: sheet.id,
        address: { row: 0, column: 1 },
        content: { kind: "formula", formula: { source: "=A1+1" } },
      },
    ]);

    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A1+1" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toBeNull();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A1+1" },
    });
  });

  test("keeps formula content raw through paste command transport", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const command = structuredClone(
      createPasteCellContentsCommand(sheet.id, { row: 3, column: 4 }, [
        [{ kind: "formula", formula: { source: "=A1" } }],
      ]),
    );

    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellContent(sheet, { row: 3, column: 4 })).toEqual({
      kind: "formula",
      formula: { source: "=A1" },
    });
  });
});
