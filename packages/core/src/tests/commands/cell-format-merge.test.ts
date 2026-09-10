import { describe, expect, test } from "vitest";
import { createApplyCellFormatCommand, createMergeCellsCommand } from "../../commands/index.js";
import { WorkbookDomainError } from "../../errors.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createSheetSparseState,
  getActiveSheet,
  getCellStyle,
  getCellValue,
  setCellValue,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("cell format merge commands", () => {
  test("merges with formatting as one reversible history entry", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 1, column: 1 }, end: { row: 1, column: 2 } };
    setCellValue(sheet, range.start, "anchor");
    setCellValue(sheet, range.end, "discarded");

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellFormatCommand(sheet.id, range, {
          style: { horizontalAlign: "center" },
          merge: true,
        }),
      ),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(sheet.mergedCells).toEqual([range]);
    expect(getCellValue(sheet, range.end)).toBeNull();
    expect(getCellStyle(sheet, range.start)).toMatchObject({ horizontalAlign: "center" });

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.mergedCells).toEqual([]);
    expect(getCellValue(sheet, range.end)).toBe("discarded");
    expect(getCellStyle(sheet, range.start)).toBeUndefined();
  });

  test("rolls formatting back when the requested merge overlaps an existing merge", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const existing = { start: { row: 1, column: 1 }, end: { row: 1, column: 2 } };
    expect(executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, existing))).toBe(true);
    const before = createSheetSparseState(sheet);

    expect(() =>
      executeWorkbookCommand(
        session,
        createApplyCellFormatCommand(
          sheet.id,
          { start: { row: 1, column: 2 }, end: { row: 1, column: 3 } },
          { style: { bold: true }, merge: true },
        ),
      ),
    ).toThrow(WorkbookDomainError);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("unmerges before applying the format to every cell in the former merged range", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 1, column: 1 }, end: { row: 1, column: 2 } };
    expect(executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range))).toBe(true);

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellFormatCommand(sheet.id, range, {
          style: { horizontalAlign: "right" },
          merge: false,
        }),
      ),
    ).toBe(true);
    expect(sheet.mergedCells).toEqual([]);
    expect(getCellStyle(sheet, range.start)).toEqual({ horizontalAlign: "right" });
    expect(getCellStyle(sheet, range.end)).toEqual({ horizontalAlign: "right" });

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.mergedCells).toEqual([range]);
    expect(getCellStyle(sheet, range.start)).toBeUndefined();
    expect(getCellStyle(sheet, range.end)).toBeUndefined();
  });
});
