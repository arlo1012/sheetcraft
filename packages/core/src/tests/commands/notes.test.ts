import { describe, expect, test } from "vitest";
import {
  createClearCellRangeCommand,
  createClearCellNotesCommand,
  createMoveCellRangeCommand,
  createPasteCellContentsCommand,
  createSetCellNoteCommand,
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createSortSheetRangeCommand,
} from "../../commands/index.js";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import {
  createSheet,
  getActiveSheet,
  getCellNote,
  setCellNote,
  setCellValue,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("cell notes", () => {
  test("edits a note through history and preserves its content cell", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 2, column: 3 };
    setCellValue(sheet, address, "Budget");

    expect(
      executeWorkbookCommand(
        session,
        createSetCellNoteCommand(session.workbook, sheet.id, address, {
          text: "Please confirm this amount.",
          author: "Mia",
        }),
      ),
    ).toBe(true);
    expect(getCellNote(sheet, address)).toEqual({
      text: "Please confirm this amount.",
      author: "Mia",
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellNote(sheet, address)).toBeUndefined();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellNote(sheet, address)?.author).toBe("Mia");
  });

  test("round-trips notes in V20 snapshots and copies, pastes, and clears them with cells", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const source = { row: 0, column: 0 };
    const target = { row: 1, column: 1 };
    setCellValue(sheet, source, "Source");
    setCellNote(sheet, source, { text: "Review source", author: "Mia" });

    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(20);
    expect(deserializeWorkbook(snapshot).sheets.get(sheet.id)?.cells.get("0:0")?.note).toEqual({
      text: "Review source",
      author: "Mia",
    });

    expect(
      executeWorkbookCommand(
        session,
        createPasteCellContentsCommand(sheet.id, target, [[{ kind: "literal", value: "Source" }]], {
          notes: [[getCellNote(sheet, source) ?? null]],
        }),
      ),
    ).toBe(true);
    expect(getCellNote(sheet, target)).toEqual({ text: "Review source", author: "Mia" });

    expect(
      executeWorkbookCommand(
        session,
        createMoveCellRangeCommand(sheet.id, { start: target, end: target }, { row: 3, column: 3 }),
      ),
    ).toBe(true);
    expect(getCellNote(sheet, { row: 3, column: 3 })?.text).toBe("Review source");
    expect(getCellNote(sheet, target)).toBeUndefined();

    const moved = { row: 3, column: 3 };
    expect(
      executeWorkbookCommand(
        session,
        createClearCellRangeCommand(sheet.id, { start: moved, end: moved }),
      ),
    ).toBe(true);
    expect(getCellNote(sheet, moved)?.text).toBe("Review source");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellNote(sheet, moved)?.text).toBe("Review source");
    expect(
      executeWorkbookCommand(
        session,
        createClearCellNotesCommand(session.workbook, sheet.id, { start: moved, end: moved })!,
      ),
    ).toBe(true);
    expect(getCellNote(sheet, moved)).toBeUndefined();
  });

  test("validates a note batch before changing any cell", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    expect(() =>
      executeWorkbookCommand(session, {
        type: "setCellNotes",
        sheetId: sheet.id,
        changes: [
          { address: { row: 0, column: 0 }, note: { text: "Would be valid" } },
          { address: { row: -1, column: 0 }, note: { text: "Invalid address" } },
        ],
      }),
    ).toThrow();
    expect(getCellNote(sheet, { row: 0, column: 0 })).toBeUndefined();
  });

  test("infers V20 for a standalone note-only sheet", () => {
    const sheet = createSheet("Notes", "notes");
    setCellNote(sheet, { row: 0, column: 0 }, { text: "Standalone" });
    expect(getCellNote(deserializeSheet(serializeSheet(sheet)), { row: 0, column: 0 })?.text).toBe(
      "Standalone",
    );
  });

  test("carries notes through axes, sorting, and copy autofill", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellNote(sheet, { row: 2, column: 0 }, { text: "Structural" });
    expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1))).toBe(
      true,
    );
    expect(getCellNote(sheet, { row: 3, column: 0 })?.text).toBe("Structural");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 2))).toBe(
      true,
    );
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellNote(sheet, { row: 2, column: 0 })?.text).toBe("Structural");

    setCellValue(sheet, { row: 4, column: 0 }, "B");
    setCellValue(sheet, { row: 5, column: 0 }, "A");
    setCellNote(sheet, { row: 4, column: 0 }, { text: "B note" });
    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 4, column: 0 }, end: { row: 5, column: 0 } },
          0,
        ),
      ),
    ).toBe(true);
    expect(getCellNote(sheet, { row: 5, column: 0 })?.text).toBe("B note");
    const plan = captureCellFill(
      session.workbook,
      sheet.id,
      { start: { row: 5, column: 0 }, end: { row: 5, column: 0 } },
      { start: { row: 5, column: 0 }, end: { row: 6, column: 0 } },
    );
    expect(
      executeWorkbookCommand(session, createCellFillCommand(session.workbook, plan, "copy")),
    ).toBe(true);
    expect(getCellNote(sheet, { row: 6, column: 0 })?.text).toBe("B note");
  });
});
