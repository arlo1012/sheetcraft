import { describe, expect, test } from "vitest";
import {
  createApplyCellBordersCommand,
  createApplyCellFormatCommand,
  createMergeCellsCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createSheetSparseState,
  getActiveSheet,
  getCellStyle,
  setCellStyle,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("merged cell perimeter borders", () => {
  test("normalizes existing outer borders to the anchor and restores every source style on undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 3, column: 4 }, end: { row: 4, column: 5 } };
    const top = { style: "thin" as const, color: "#112233" };
    const topLater = { style: "double" as const, color: "#223344" };
    const right = { style: "medium" as const, color: "#334455" };
    const bottom = { style: "dashed" as const, color: "#445566" };
    const left = { style: "dotted" as const, color: "#556677" };
    const internal = { style: "thick" as const, color: "#667788" };
    const external = { style: "hair" as const, color: "#778899" };

    setCellStyle(
      sheet,
      { row: 3, column: 4 },
      {
        bold: true,
        borderTop: top,
        borderRight: internal,
        borderBottom: internal,
      },
    );
    setCellStyle(sheet, { row: 3, column: 5 }, { borderTop: topLater, borderRight: right });
    setCellStyle(sheet, { row: 4, column: 4 }, { borderBottom: bottom, borderLeft: left });
    setCellStyle(sheet, { row: 4, column: 5 }, { borderRight: right, borderBottom: bottom });
    setCellStyle(sheet, { row: 2, column: 4 }, { borderBottom: external });
    const before = createSheetSparseState(sheet);

    expect(executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range))).toBe(true);
    expect(getCellStyle(sheet, range.start)).toEqual({
      bold: true,
      borderTop: top,
      borderRight: right,
      borderBottom: bottom,
      borderLeft: left,
    });
    expect(getCellStyle(sheet, { row: 3, column: 5 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 4, column: 4 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 4, column: 5 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 2, column: 4 })).toEqual({ borderBottom: external });

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("does not promote an anchor's internal right or bottom border to the merged perimeter", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 3, column: 4 }, end: { row: 4, column: 5 } };
    setCellStyle(sheet, range.start, {
      bold: true,
      borderRight: { style: "thin", color: "#112233" },
      borderBottom: { style: "thin", color: "#112233" },
    });

    expect(executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range))).toBe(true);
    expect(getCellStyle(sheet, range.start)).toEqual({ bold: true });
  });

  test("materializes an anchor from a far perimeter border when it did not previously exist", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 3, column: 4 }, end: { row: 4, column: 5 } };
    const right = { style: "medium" as const, color: "#112233" };
    const bottom = { style: "double" as const, color: "#445566" };
    setCellStyle(sheet, { row: 3, column: 5 }, { borderRight: right });
    setCellStyle(sheet, { row: 4, column: 5 }, { borderBottom: bottom });

    expect(executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range))).toBe(true);
    expect(getCellStyle(sheet, range.start)).toEqual({ borderRight: right, borderBottom: bottom });
  });

  test("keeps the full merged perimeter through legacy border, format-color, and clear commands", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 5, column: 4 }, end: { row: 12, column: 7 } };
    const outer = { style: "mediumDashed" as const, color: "#112233" };
    const all = { style: "double" as const, color: "#445566" };
    expect(executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range))).toBe(true);

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(sheet.id, range, { preset: "outer", border: outer }),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, range.start)).toMatchObject({
      borderTop: outer,
      borderRight: outer,
      borderBottom: outer,
      borderLeft: outer,
    });
    expect(
      executeWorkbookCommand(
        session,
        createApplyCellFormatCommand(sheet.id, range, { borderFormat: { color: "#abcdef" } }),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, range.start)).toMatchObject({
      borderTop: { style: outer.style, color: "#abcdef" },
      borderRight: { style: outer.style, color: "#abcdef" },
      borderBottom: { style: outer.style, color: "#abcdef" },
      borderLeft: { style: outer.style, color: "#abcdef" },
    });
    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(sheet.id, range, { preset: "none" }),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, range.start)).toBeUndefined();
    for (const preset of ["inner", "innerHorizontal", "innerVertical"] as const) {
      expect(
        executeWorkbookCommand(
          session,
          createApplyCellBordersCommand(sheet.id, range, { preset, border: all }),
        ),
      ).toBe(false);
      expect(getCellStyle(sheet, range.start)).toBeUndefined();
    }

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(sheet.id, range, { preset: "all", border: all }),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, range.start)).toEqual({
      borderTop: all,
      borderRight: all,
      borderBottom: all,
      borderLeft: all,
    });
  });

  test("keeps only real internal selection edges when a merged range is selected with regular cells", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const merged = { start: { row: 5, column: 4 }, end: { row: 6, column: 5 } };
    const selection = { start: merged.start, end: { row: 6, column: 6 } };
    const inner = { style: "thin" as const, color: "#112233" };
    expect(executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, merged))).toBe(true);

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(sheet.id, selection, { preset: "inner", border: inner }),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, merged.start)).toEqual({ borderRight: inner });
    expect(getCellStyle(sheet, { row: 5, column: 6 })).toEqual({ borderBottom: inner });
    expect(getCellStyle(sheet, { row: 6, column: 6 })).toBeUndefined();
  });
});
