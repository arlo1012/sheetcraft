import { describe, expect, test } from "vitest";
import {
  createApplyCellStyleCommand,
  createClearCellRangeCommand,
} from "../../../../modules/workbook/commands";
import { createClearCellStylePatch } from "../../../../modules/workbook/cell-style";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../../modules/workbook/history";
import {
  getActiveSheet,
  getCellStyle,
  getCellValue,
  setCellStyle,
  setCellValue,
} from "../../../../modules/workbook/workbook";

describe("cell style commands", () => {
  test("applies a range patch as one entry and restores mixed styles exactly", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true, textColor: "#112233" });
    setCellStyle(sheet, { row: 0, column: 1 }, { italic: true });

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellStyleCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 2 } },
          { bold: true, fillColor: "#FDE68A", verticalAlign: "top" },
        ),
      ),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({
      bold: true,
      textColor: "#112233",
      fillColor: "#fde68a",
      verticalAlign: "top",
    });
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toEqual({
      italic: true,
      bold: true,
      fillColor: "#fde68a",
      verticalAlign: "top",
    });
    expect(getCellStyle(sheet, { row: 0, column: 2 })).toEqual({
      bold: true,
      fillColor: "#fde68a",
      verticalAlign: "top",
    });

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({
      bold: true,
      textColor: "#112233",
    });
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toEqual({ italic: true });
    expect(getCellStyle(sheet, { row: 0, column: 2 })).toBeUndefined();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 2 })?.bold).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 2 })?.verticalAlign).toBe("top");
  });

  test("clears values without clearing styles", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 1 }, "keep style");
    setCellStyle(sheet, { row: 1, column: 1 }, { underline: true });

    executeWorkbookCommand(
      session,
      createClearCellRangeCommand(sheet.id, {
        start: { row: 1, column: 1 },
        end: { row: 1, column: 1 },
      }),
    );

    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toEqual({ underline: true });
    undoWorkbookCommand(session);
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("keep style");
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toEqual({ underline: true });
  });

  test("toggles wrapping as one reversible range style action", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "first");
    setCellValue(sheet, { row: 0, column: 1 }, "second");
    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true, bold: true });
    setCellStyle(sheet, { row: 0, column: 1 }, { wrapText: true, italic: true });

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellStyleCommand(
          sheet.id,
          { start: { row: 0, column: 1 }, end: { row: 0, column: 0 } },
          { wrapText: null },
        ),
      ),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({ bold: true });
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toEqual({ italic: true });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("first");

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({ wrapText: true, bold: true });
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toEqual({ wrapText: true, italic: true });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({ bold: true });
  });

  test("clears mixed styles without changing values and restores them exactly", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const firstStyle = {
      fontFamily: "Arial",
      fontSize: 18,
      bold: true,
      italic: true,
      underline: true,
      textColor: "#112233",
      fillColor: "#abcdef",
      horizontalAlign: "right",
      verticalAlign: "top",
    } as const;
    const secondStyle = {
      fontSize: 14,
      fillColor: "#fedcba",
      verticalAlign: "bottom",
    } as const;
    const styleOnly = { italic: true, horizontalAlign: "center" } as const;
    setCellValue(sheet, { row: 0, column: 0 }, "text");
    setCellValue(sheet, { row: 0, column: 1 }, 42);
    setCellStyle(sheet, { row: 0, column: 0 }, firstStyle);
    setCellStyle(sheet, { row: 0, column: 1 }, secondStyle);
    setCellStyle(sheet, { row: 0, column: 2 }, styleOnly);

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellStyleCommand(
          sheet.id,
          { start: { row: 0, column: 2 }, end: { row: 0, column: 0 } },
          createClearCellStylePatch(),
        ),
      ),
    ).toBe(true);

    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("text");
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe(42);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 0, column: 2 })).toBeUndefined();
    expect(sheet.cells.size).toBe(2);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual(firstStyle);
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toEqual(secondStyle);
    expect(getCellStyle(sheet, { row: 0, column: 2 })).toEqual(styleOnly);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("text");
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe(42);

    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 0, column: 2 })).toBeUndefined();
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("text");
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe(42);
  });

  test("does not record clearing an unformatted range", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellStyleCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 1 } },
          createClearCellStylePatch(),
        ),
      ),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
    expect(sheet.cells.size).toBe(0);
  });

  test("rejects style patches that would materialize an excessive range", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    expect(() =>
      createApplyCellStyleCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 1000, column: 100 } },
        { bold: true },
      ),
    ).toThrow(RangeError);
    expect(sheet.cells.size).toBe(0);
  });
});
