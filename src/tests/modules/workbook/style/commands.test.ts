import { describe, expect, test } from "vitest";
import {
  createApplyCellBordersCommand,
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
  const border = { style: "thin" as const, color: "#123456" };

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

  test("applies all borders to a single cell and restores its exact prior style", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellStyle(sheet, { row: 3, column: 4 }, { bold: true });

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(
          sheet.id,
          { start: { row: 3, column: 4 }, end: { row: 3, column: 4 } },
          { preset: "all", border },
        ),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, { row: 3, column: 4 })).toEqual({
      bold: true,
      borderTop: border,
      borderRight: border,
      borderBottom: border,
      borderLeft: border,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 3, column: 4 })).toEqual({ bold: true });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 3, column: 4 })?.borderTop).toEqual(border);
  });

  test("applies outer borders without clearing existing internal edges", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const preservedBorder = { style: "dotted" as const, color: "#abcdef" };
    setCellStyle(sheet, { row: 1, column: 1 }, { borderLeft: preservedBorder });

    executeWorkbookCommand(
      session,
      createApplyCellBordersCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 1, column: 2 } },
        { preset: "outer", border },
      ),
    );

    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({
      borderTop: border,
      borderLeft: border,
    });
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toEqual({ borderTop: border });
    expect(getCellStyle(sheet, { row: 0, column: 2 })).toEqual({
      borderTop: border,
      borderRight: border,
    });
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toEqual({
      borderLeft: preservedBorder,
      borderBottom: border,
    });
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toEqual({
      borderRight: border,
      borderBottom: border,
    });
  });

  test("applies both diagonal directions per cell and restores them through history", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 1, column: 1 }, end: { row: 1, column: 2 } };

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(sheet.id, range, { preset: "diagonalUp", border }),
      ),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(sheet.id, range, { preset: "diagonalDown", border }),
      ),
    ).toBe(true);
    for (let column = 1; column <= 2; column += 1) {
      expect(getCellStyle(sheet, { row: 1, column })).toEqual({
        borderDiagonalUp: border,
        borderDiagonalDown: border,
      });
    }

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toEqual({ borderDiagonalUp: border });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 1 })?.borderDiagonalDown).toEqual(border);
  });

  test("uses right and bottom edges for internal borders and clears every edge with none", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } };

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(sheet.id, range, { preset: "inner", border }),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({
      borderRight: border,
      borderBottom: border,
    });
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toEqual({ borderBottom: border });
    expect(getCellStyle(sheet, { row: 1, column: 0 })).toEqual({ borderRight: border });
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toBeUndefined();

    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        ...getCellStyle(sheet, { row: 0, column: 0 }),
        borderDiagonalUp: border,
        borderDiagonalDown: border,
      },
    );

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(sheet.id, range, { preset: "none" }),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 1, column: 0 })).toBeUndefined();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({
      borderRight: border,
      borderBottom: border,
      borderDiagonalUp: border,
      borderDiagonalDown: border,
    });
  });

  test("does not record an internal border preset for a single cell", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
          { preset: "inner", border },
        ),
      ),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("makes outer borders win against each conflicting external neighbor and restores them", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const oldBorder = { style: "double" as const, color: "#abcdef" };
    const range = { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } };
    setCellStyle(sheet, { row: 0, column: 1 }, { borderBottom: oldBorder });
    setCellStyle(sheet, { row: 1, column: 0 }, { borderRight: oldBorder });
    setCellStyle(sheet, { row: 3, column: 1 }, { borderTop: oldBorder });
    setCellStyle(sheet, { row: 1, column: 3 }, { borderLeft: oldBorder });

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(sheet.id, range, { preset: "outer", border }),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toEqual({
      borderTop: border,
      borderLeft: border,
    });
    expect(getCellStyle(sheet, { row: 2, column: 2 })).toEqual({
      borderRight: border,
      borderBottom: border,
    });
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 1, column: 0 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 3, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 1, column: 3 })).toBeUndefined();

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toEqual({ borderBottom: oldBorder });
    expect(getCellStyle(sheet, { row: 1, column: 0 })).toEqual({ borderRight: oldBorder });
    expect(getCellStyle(sheet, { row: 3, column: 1 })).toEqual({ borderTop: oldBorder });
    expect(getCellStyle(sheet, { row: 1, column: 3 })).toEqual({ borderLeft: oldBorder });
  });

  test("keeps matching intended all borders while clearing conflicting external edges", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const oldBorder = { style: "dashed" as const, color: "#abcdef" };
    const range = { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } };
    setCellStyle(sheet, { row: 0, column: 1 }, { borderBottom: oldBorder });
    setCellStyle(sheet, { row: 1, column: 0 }, { borderRight: oldBorder });
    setCellStyle(sheet, { row: 3, column: 2 }, { borderTop: oldBorder });
    setCellStyle(sheet, { row: 2, column: 3 }, { borderLeft: oldBorder });

    executeWorkbookCommand(
      session,
      createApplyCellBordersCommand(sheet.id, range, { preset: "all", border }),
    );

    expect(getCellStyle(sheet, { row: 1, column: 1 })).toEqual({
      borderTop: border,
      borderRight: border,
      borderBottom: border,
      borderLeft: border,
    });
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toEqual({
      borderTop: border,
      borderRight: border,
      borderBottom: border,
      borderLeft: border,
    });
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 1, column: 0 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 3, column: 2 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 2, column: 3 })).toBeUndefined();
  });

  test("clears conflicting internal and external shared edges for inner and none presets", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const oldBorder = { style: "dotted" as const, color: "#abcdef" };
    const innerRange = { start: { row: 4, column: 4 }, end: { row: 5, column: 5 } };
    setCellStyle(sheet, { row: 4, column: 5 }, { borderLeft: oldBorder });
    setCellStyle(sheet, { row: 5, column: 4 }, { borderTop: oldBorder });

    executeWorkbookCommand(
      session,
      createApplyCellBordersCommand(sheet.id, innerRange, { preset: "inner", border }),
    );
    expect(getCellStyle(sheet, { row: 4, column: 5 })).toEqual({ borderBottom: border });
    expect(getCellStyle(sheet, { row: 5, column: 4 })).toEqual({ borderRight: border });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 4, column: 5 })).toEqual({ borderLeft: oldBorder });
    expect(getCellStyle(sheet, { row: 5, column: 4 })).toEqual({ borderTop: oldBorder });

    const noneRange = { start: { row: 7, column: 7 }, end: { row: 7, column: 7 } };
    setCellStyle(
      sheet,
      { row: 7, column: 7 },
      {
        borderTop: oldBorder,
        borderRight: oldBorder,
        borderBottom: oldBorder,
        borderLeft: oldBorder,
      },
    );
    setCellStyle(sheet, { row: 6, column: 7 }, { borderBottom: oldBorder });
    setCellStyle(sheet, { row: 7, column: 8 }, { borderLeft: oldBorder });
    setCellStyle(sheet, { row: 8, column: 7 }, { borderTop: oldBorder });
    setCellStyle(sheet, { row: 7, column: 6 }, { borderRight: oldBorder });

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellBordersCommand(sheet.id, noneRange, { preset: "none" }),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, { row: 7, column: 7 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 6, column: 7 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 7, column: 8 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 8, column: 7 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 7, column: 6 })).toBeUndefined();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 7, column: 7 })?.borderTop).toEqual(oldBorder);
    expect(getCellStyle(sheet, { row: 6, column: 7 })).toEqual({ borderBottom: oldBorder });
    expect(getCellStyle(sheet, { row: 7, column: 8 })).toEqual({ borderLeft: oldBorder });
  });

  test("clears neighboring shared edges when clear formatting explicitly removes borders", () => {
    const session = createWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const oldBorder = { style: "medium" as const, color: "#abcdef" };
    const range = { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } };
    setCellStyle(
      sheet,
      { row: 1, column: 1 },
      {
        bold: true,
        borderTop: oldBorder,
        borderRight: oldBorder,
        borderBottom: oldBorder,
        borderLeft: oldBorder,
      },
    );
    setCellStyle(sheet, { row: 0, column: 1 }, { borderBottom: oldBorder });
    setCellStyle(sheet, { row: 1, column: 0 }, { borderRight: oldBorder });
    setCellStyle(sheet, { row: 2, column: 1 }, { borderTop: oldBorder });
    setCellStyle(sheet, { row: 1, column: 2 }, { borderLeft: oldBorder });

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellStyleCommand(sheet.id, range, createClearCellStylePatch()),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 1, column: 0 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 2, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toBeUndefined();

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 1 })?.borderTop).toEqual(oldBorder);
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toEqual({ borderBottom: oldBorder });
    expect(getCellStyle(sheet, { row: 1, column: 0 })).toEqual({ borderRight: oldBorder });
    expect(getCellStyle(sheet, { row: 2, column: 1 })).toEqual({ borderTop: oldBorder });
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toEqual({ borderLeft: oldBorder });
  });
});
