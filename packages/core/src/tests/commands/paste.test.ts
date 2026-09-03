import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import { createPasteCellValuesCommand } from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  getActiveSheet,
  getCellStyle,
  getCellValue,
  setCellStyle,
  setCellValue,
} from "../../workbook.js";

describe("paste cell values command", () => {
  test("pastes a matrix as one history entry", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    executeWorkbookCommand(
      session,
      createPasteCellValuesCommand(sheet.id, { row: 2, column: 3 }, [
        ["A", "B"],
        ["C", "D"],
      ]),
    );

    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellValue(sheet, { row: 2, column: 3 })).toBe("A");
    expect(getCellValue(sheet, { row: 3, column: 4 })).toBe("D");
    undoWorkbookCommand(session);
    expect(getCellValue(sheet, { row: 2, column: 3 })).toBeNull();
    expect(getCellValue(sheet, { row: 3, column: 4 })).toBeNull();
    redoWorkbookCommand(session);
    expect(getCellValue(sheet, { row: 3, column: 4 })).toBe("D");
  });

  test("pastes semantic number formatting with local styles and restores it", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const target = { row: 2, column: 3 };
    setCellValue(sheet, target, 12.5);
    setCellStyle(sheet, target, { numberFormat: { kind: "percent", fractionDigits: 1 } });

    executeWorkbookCommand(
      session,
      createPasteCellValuesCommand(sheet.id, target, [[12.5]], {
        styles: [[{ numberFormat: { kind: "currency", currency: "cny", fractionDigits: 2 } }]],
      }),
    );

    expect(getCellStyle(sheet, target)?.numberFormat).toEqual({
      kind: "currency",
      currency: "CNY",
      fractionDigits: 2,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, target)?.numberFormat).toEqual({
      kind: "percent",
      fractionDigits: 1,
    });
  });

  test("moves an overlapping cut range atomically", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "A");
    setCellValue(sheet, { row: 0, column: 1 }, "B");
    setCellValue(sheet, { row: 1, column: 0 }, "C");
    setCellValue(sheet, { row: 1, column: 1 }, "D");

    executeWorkbookCommand(
      session,
      createPasteCellValuesCommand(
        sheet.id,
        { row: 1, column: 1 },
        [
          ["A", "B"],
          ["C", "D"],
        ],
        { clearRange: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } } },
      ),
    );

    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("A");
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe("D");

    undoWorkbookCommand(session);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("A");
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("D");
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBeNull();
  });

  test("makes pasted local border styles win against conflicting neighboring edges", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const border = { style: "medium" as const, color: "#123456" };
    const oldBorder = { style: "dashed" as const, color: "#abcdef" };
    setCellStyle(sheet, { row: 1, column: 2 }, { borderBottom: oldBorder });
    setCellStyle(sheet, { row: 2, column: 3 }, { borderLeft: oldBorder });
    setCellStyle(sheet, { row: 3, column: 2 }, { borderTop: oldBorder });
    setCellStyle(sheet, { row: 2, column: 1 }, { borderRight: oldBorder });

    expect(
      executeWorkbookCommand(
        session,
        createPasteCellValuesCommand(sheet.id, { row: 2, column: 2 }, [["pasted"]], {
          styles: [
            [
              {
                borderTop: border,
                borderRight: border,
                borderBottom: border,
                borderLeft: border,
              },
            ],
          ],
        }),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, { row: 2, column: 2 })).toEqual({
      borderTop: border,
      borderRight: border,
      borderBottom: border,
      borderLeft: border,
    });
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 2, column: 3 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 3, column: 2 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 2, column: 1 })).toBeUndefined();

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBeNull();
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toEqual({ borderBottom: oldBorder });
    expect(getCellStyle(sheet, { row: 2, column: 3 })).toEqual({ borderLeft: oldBorder });
    expect(getCellStyle(sheet, { row: 3, column: 2 })).toEqual({ borderTop: oldBorder });
    expect(getCellStyle(sheet, { row: 2, column: 1 })).toEqual({ borderRight: oldBorder });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toBeUndefined();
  });

  test("clears external edges for a pasted null style and restores them through history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const oldBorder = { style: "dotted" as const, color: "#abcdef" };
    setCellStyle(sheet, { row: 1, column: 2 }, { borderBottom: oldBorder });
    setCellStyle(sheet, { row: 2, column: 3 }, { borderLeft: oldBorder });
    setCellStyle(sheet, { row: 3, column: 2 }, { borderTop: oldBorder });
    setCellStyle(sheet, { row: 2, column: 1 }, { borderRight: oldBorder });

    executeWorkbookCommand(
      session,
      createPasteCellValuesCommand(sheet.id, { row: 2, column: 2 }, [["plain"]], {
        styles: [[null]],
      }),
    );

    expect(getCellStyle(sheet, { row: 2, column: 2 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 2, column: 3 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 3, column: 2 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 2, column: 1 })).toBeUndefined();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toEqual({ borderBottom: oldBorder });
    expect(getCellStyle(sheet, { row: 2, column: 3 })).toEqual({ borderLeft: oldBorder });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toBeUndefined();
  });

  test("clears external edges for a pasted style with no border fields", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const oldBorder = { style: "double" as const, color: "#abcdef" };
    setCellStyle(sheet, { row: 4, column: 5 }, { borderBottom: oldBorder });
    setCellStyle(sheet, { row: 5, column: 6 }, { borderLeft: oldBorder });
    setCellStyle(sheet, { row: 6, column: 5 }, { borderTop: oldBorder });
    setCellStyle(sheet, { row: 5, column: 4 }, { borderRight: oldBorder });

    executeWorkbookCommand(
      session,
      createPasteCellValuesCommand(sheet.id, { row: 5, column: 5 }, [["formatted"]], {
        styles: [[{ bold: true }]],
      }),
    );

    expect(getCellStyle(sheet, { row: 5, column: 5 })).toEqual({ bold: true });
    expect(getCellStyle(sheet, { row: 4, column: 5 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 5, column: 6 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 6, column: 5 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 5, column: 4 })).toBeUndefined();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 4, column: 5 })).toEqual({ borderBottom: oldBorder });
    expect(getCellStyle(sheet, { row: 5, column: 6 })).toEqual({ borderLeft: oldBorder });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 5, column: 5 })).toEqual({ bold: true });
  });

  test("resolves conflicting pasted internal edges with the left and upper owner", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const rightOwner = { style: "thin" as const, color: "#123456" };
    const leftFallback = { style: "double" as const, color: "#abcdef" };
    const bottomOwner = { style: "medium" as const, color: "#345678" };
    const topFallback = { style: "dashed" as const, color: "#fedcba" };

    executeWorkbookCommand(
      session,
      createPasteCellValuesCommand(
        sheet.id,
        { row: 8, column: 8 },
        [
          ["upper-left", "upper-right"],
          ["lower-left", "lower-right"],
        ],
        {
          styles: [
            [{ borderRight: rightOwner, borderBottom: bottomOwner }, { borderLeft: leftFallback }],
            [{ borderTop: topFallback }, null],
          ],
        },
      ),
    );

    expect(getCellStyle(sheet, { row: 8, column: 8 })).toEqual({
      borderRight: rightOwner,
      borderBottom: bottomOwner,
    });
    expect(getCellStyle(sheet, { row: 8, column: 9 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 9, column: 8 })).toBeUndefined();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 8, column: 8 })).toBeUndefined();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 8, column: 8 })?.borderRight).toEqual(rightOwner);
    expect(getCellStyle(sheet, { row: 8, column: 9 })).toBeUndefined();
  });

  test("keeps an internal fallback border when the left or upper owner has no border", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const verticalFallback = { style: "thin" as const, color: "#123456" };
    const horizontalFallback = { style: "medium" as const, color: "#abcdef" };

    executeWorkbookCommand(
      session,
      createPasteCellValuesCommand(sheet.id, { row: 11, column: 11 }, [["left", "right"]], {
        styles: [[{ bold: true }, { borderLeft: verticalFallback }]],
      }),
    );
    expect(getCellStyle(sheet, { row: 11, column: 11 })).toEqual({ bold: true });
    expect(getCellStyle(sheet, { row: 11, column: 12 })).toEqual({
      borderLeft: verticalFallback,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 11, column: 11 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 11, column: 12 })).toBeUndefined();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 11, column: 12 })).toEqual({
      borderLeft: verticalFallback,
    });

    executeWorkbookCommand(
      session,
      createPasteCellValuesCommand(sheet.id, { row: 14, column: 11 }, [["upper"], ["lower"]], {
        styles: [[{ italic: true }], [{ borderTop: horizontalFallback }]],
      }),
    );
    expect(getCellStyle(sheet, { row: 14, column: 11 })).toEqual({ italic: true });
    expect(getCellStyle(sheet, { row: 15, column: 11 })).toEqual({
      borderTop: horizontalFallback,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 14, column: 11 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 15, column: 11 })).toBeUndefined();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, { row: 15, column: 11 })).toEqual({
      borderTop: horizontalFallback,
    });
  });

  test("rejects an empty, uneven, or overflowing matrix before mutation", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);

    expect(() => createPasteCellValuesCommand(sheet.id, { row: 0, column: 0 }, [])).toThrow();
    expect(() =>
      createPasteCellValuesCommand(sheet.id, { row: 0, column: 0 }, [[1], [2, 3]]),
    ).toThrow();
    expect(() =>
      createPasteCellValuesCommand(sheet.id, { row: 1_048_575, column: 16_383 }, [[1, 2]]),
    ).toThrow();
    expect(sheet.cells.size).toBe(0);
  });
});
