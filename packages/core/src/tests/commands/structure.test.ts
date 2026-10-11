import { describe, expect, test } from "vitest";
import type { StandalonePictureObject } from "../../picture-object.js";
import { isPictureGroup } from "../../picture-group.js";
import { createTestWorkbookSession } from "../helpers.js";
import {
  applyWorkbookCommand,
  createDeleteSheetAxisCommand,
  createAddSheetCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  createSetFloatingImageCommand,
  tryApplyWorkbookCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  createSheetSparseState,
  getCellStyle,
  getActiveSheet,
  getCellContent,
  getCellValue,
  getColumnWidth,
  getRowHeight,
  setCellValue,
  setCellContent,
  setCellStyle,
  setColumnWidth,
  setSheetMetadata,
  setSheetDimensionHidden,
  setRowHeight,
  type FloatingImage,
} from "../../workbook.js";

function requireStandalone(image: FloatingImage | undefined): StandalonePictureObject | undefined {
  if (isPictureGroup(image)) throw new Error("Expected a standalone picture.");
  return image;
}

describe("sheet axis structure commands", () => {
  test("moves and restores hidden dimensions with their manual sizes", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setRowHeight(sheet, 2, 48);
    setSheetDimensionHidden(sheet, "row", 2, true);
    executeWorkbookCommand(session, createMoveSheetAxisCommand(sheet.id, "row", 2, 1, 5));
    expect(sheet.hiddenRows).toEqual(new Set([5]));
    expect(sheet.rowHeights.get(5)).toBe(48);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.hiddenRows).toEqual(new Set([2]));
    expect(sheet.rowHeights.get(2)).toBe(48);
  });

  test("reorders complete rows with styles, dimensions, images, metadata, formulas, and history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 0 }, "move");
    setCellStyle(sheet, { row: 1, column: 0 }, { bold: true });
    setCellValue(sheet, { row: 2, column: 0 }, "between");
    setCellContent(sheet, { row: 4, column: 2 }, { kind: "formula", formula: { source: "=A2" } });
    setRowHeight(sheet, 1, 44);
    applyWorkbookCommand(
      session.workbook,
      createSetFloatingImageCommand(sheet.id, {
        id: "move-image",
        assetId: "asset",
        altText: "Moved image",
        anchor: { row: 1, column: 3 },
        offsetX: 0,
        offsetY: 0,
        width: 100,
        height: 60,
      }),
    );
    setSheetMetadata(sheet, {
      freezePanes: { rows: 1, columns: 0 },
      filter: null,
      mergedCells: [{ start: { row: 1, column: 4 }, end: { row: 1, column: 5 } }],
    });
    const before = createSheetSparseState(sheet);

    expect(
      executeWorkbookCommand(session, createMoveSheetAxisCommand(sheet.id, "row", 1, 1, 3)),
    ).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 0 })).toBe("between");
    expect(getCellValue(sheet, { row: 3, column: 0 })).toBe("move");
    expect(getCellStyle(sheet, { row: 3, column: 0 })).toEqual({ bold: true });
    expect(getRowHeight(sheet, 3)).toBe(44);
    expect(requireStandalone(sheet.floatingImages[0])?.anchor).toEqual({ row: 3, column: 3 });
    expect(sheet.mergedCells).toEqual([
      { start: { row: 3, column: 4 }, end: { row: 3, column: 5 } },
    ]);
    expect(getCellContent(sheet, { row: 4, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=A4" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 3, column: 0 })).toBe("move");
  });

  test("reorders columns and rejects moves that would split merged or formula ranges atomically", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 1 }, "move");
    setColumnWidth(sheet, 1, 180);
    expect(
      executeWorkbookCommand(session, createMoveSheetAxisCommand(sheet.id, "column", 1, 1, 3)),
    ).toBe(true);
    expect(getCellValue(sheet, { row: 0, column: 3 })).toBe("move");
    expect(getColumnWidth(sheet, 3)).toBe(180);

    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: null,
      mergedCells: [{ start: { row: 2, column: 1 }, end: { row: 2, column: 2 } }],
    });
    const beforeMergeReject = createSheetSparseState(sheet);
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createMoveSheetAxisCommand(sheet.id, "column", 1, 1, 4),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(sheet)).toEqual(beforeMergeReject);

    sheet.mergedCells = [];
    setCellContent(
      sheet,
      { row: 5, column: 5 },
      { kind: "formula", formula: { source: "=B1:C1" } },
    );
    const beforeFormulaReject = createSheetSparseState(sheet);
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createMoveSheetAxisCommand(sheet.id, "column", 1, 1, 4),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(sheet)).toEqual(beforeFormulaReject);
  });

  test("transforms metadata-only sheets and restores exact frozen, merged, and filter state", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setSheetMetadata(sheet, {
      freezePanes: { rows: 5, columns: 1 },
      mergedCells: [{ start: { row: 5, column: 2 }, end: { row: 6, column: 3 } }],
      filter: {
        range: { start: { row: 8, column: 0 }, end: { row: 12, column: 1 } },
        columns: [{ column: 1, allowedValues: [{ kind: "string", value: "keep" }] }],
      },
    });
    const before = createSheetSparseState(sheet);

    expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 3))).toBe(
      true,
    );
    expect(sheet.freezePanes).toEqual({ rows: 6, columns: 1 });
    expect(sheet.mergedCells).toEqual([
      { start: { row: 6, column: 2 }, end: { row: 7, column: 3 } },
    ]);
    expect(sheet.filter?.range).toEqual({
      start: { row: 9, column: 0 },
      end: { row: 13, column: 1 },
    });

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("allows fully frozen sheet boundaries and clamps structural inserts at the sheet limit", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setSheetMetadata(sheet, {
      freezePanes: { rows: MAX_SHEET_ROWS - 1, columns: MAX_SHEET_COLUMNS },
      filter: null,
      mergedCells: [],
    });
    const before = createSheetSparseState(sheet);

    expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 0))).toBe(
      true,
    );
    expect(sheet.freezePanes).toEqual({ rows: MAX_SHEET_ROWS, columns: MAX_SHEET_COLUMNS });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("clears a filter when its header is deleted and restores it through undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: {
        range: { start: { row: 8, column: 2 }, end: { row: 11, column: 3 } },
        columns: [{ column: 2, allowedValues: [{ kind: "string", value: "keep" }] }],
      },
      mergedCells: [],
    });

    expect(executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 8))).toBe(
      true,
    );
    expect(sheet.filter).toBeNull();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.filter?.range).toEqual({
      start: { row: 8, column: 2 },
      end: { row: 11, column: 3 },
    });
  });

  test("clears a filter when deleting its final data row", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: {
        range: { start: { row: 5, column: 0 }, end: { row: 6, column: 0 } },
        columns: [],
      },
      mergedCells: [],
    });

    expect(executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 6))).toBe(
      true,
    );
    expect(sheet.filter).toBeNull();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.filter?.range).toEqual({
      start: { row: 5, column: 0 },
      end: { row: 6, column: 0 },
    });
  });

  test("shifts filter rows and columns through structural edits and restores their criteria", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: {
        range: { start: { row: 4, column: 2 }, end: { row: 7, column: 4 } },
        columns: [
          { column: 2, allowedValues: [{ kind: "number", value: 1 }] },
          { column: 4, allowedValues: [{ kind: "boolean", value: true }] },
        ],
      },
      mergedCells: [],
    });
    const before = createSheetSparseState(sheet);

    expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 6))).toBe(
      true,
    );
    expect(sheet.filter?.range).toEqual({
      start: { row: 4, column: 2 },
      end: { row: 8, column: 4 },
    });
    expect(
      executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "column", 3)),
    ).toBe(true);
    expect(sheet.filter?.range).toEqual({
      start: { row: 4, column: 2 },
      end: { row: 8, column: 3 },
    });
    expect(sheet.filter?.columns.map((column) => column.column)).toEqual([2, 3]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("rewrites formula references and restores exact raw sources across undo and redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(
      sheet,
      { row: 3, column: 1 },
      { kind: "formula", formula: { source: "=A1+A2+$A$2" } },
    );

    expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1))).toBe(
      true,
    );
    expect(getCellContent(sheet, { row: 4, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A1+A3+$A$3" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 3, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A1+A2+$A$2" },
    });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 4, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A1+A3+$A$3" },
    });
  });

  test("inserts rows by shifting sparse cells and row dimensions while dropping the tail", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 3 }, "above");
    setCellValue(sheet, { row: 2, column: 1 }, "move");
    setCellStyle(sheet, { row: 2, column: 1 }, { bold: true });
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 4 }, "tail");
    setRowHeight(sheet, 2, 40);
    setRowHeight(sheet, MAX_SHEET_ROWS - 1, 48);
    setColumnWidth(sheet, 1, 144);

    expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 2))).toBe(
      true,
    );
    expect(getCellValue(sheet, { row: 1, column: 3 })).toBe("above");
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe("move");
    expect(getCellStyle(sheet, { row: 3, column: 1 })).toEqual({ bold: true });
    expect(getCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 4 })).toBeNull();
    expect(getRowHeight(sheet, 3)).toBe(40);
    expect(getRowHeight(sheet, MAX_SHEET_ROWS - 1)).toBe(DEFAULT_ROW_HEIGHT);
    expect(getColumnWidth(sheet, 1)).toBe(144);
  });

  test("deletes multiple rows, including their dimensions, and leaves the tail default", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 0 }, "above");
    setCellValue(sheet, { row: 2, column: 0 }, "delete-1");
    setCellValue(sheet, { row: 3, column: 0 }, "delete-2");
    setCellValue(sheet, { row: 4, column: 0 }, "move");
    setRowHeight(sheet, 2, 40);
    setRowHeight(sheet, 4, 48);

    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 2, 2));

    expect(getCellValue(sheet, { row: 1, column: 0 })).toBe("above");
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe("move");
    expect(getCellValue(sheet, { row: 3, column: 0 })).toBeNull();
    expect(getRowHeight(sheet, 2)).toBe(48);
    expect(getRowHeight(sheet, 3)).toBe(DEFAULT_ROW_HEIGHT);
  });

  test("inserts and deletes columns without changing row dimensions", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 5, column: 1 }, "left");
    setCellValue(sheet, { row: 5, column: 2 }, "move");
    setCellValue(sheet, { row: 6, column: MAX_SHEET_COLUMNS - 1 }, "tail");
    setColumnWidth(sheet, 2, 144);
    setColumnWidth(sheet, MAX_SHEET_COLUMNS - 1, 160);
    setRowHeight(sheet, 5, 40);

    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "column", 2));
    expect(getCellValue(sheet, { row: 5, column: 1 })).toBe("left");
    expect(getCellValue(sheet, { row: 5, column: 2 })).toBeNull();
    expect(getCellValue(sheet, { row: 5, column: 3 })).toBe("move");
    expect(getCellValue(sheet, { row: 6, column: MAX_SHEET_COLUMNS - 1 })).toBeNull();
    expect(getColumnWidth(sheet, 3)).toBe(144);
    expect(getColumnWidth(sheet, MAX_SHEET_COLUMNS - 1)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(getRowHeight(sheet, 5)).toBe(40);

    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "column", 1, 2));
    expect(getCellValue(sheet, { row: 5, column: 1 })).toBe("move");
    expect(getColumnWidth(sheet, 1)).toBe(144);
    expect(getRowHeight(sheet, 5)).toBe(40);
  });

  test("round-trips inserted tail overflow and deleted cells through undo and redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 0 }, "selected");
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 0 }, "overflow");
    setCellStyle(
      sheet,
      { row: MAX_SHEET_ROWS - 1, column: 0 },
      {
        borderTop: { style: "double", color: "#123456" },
      },
    );
    setRowHeight(sheet, 1, 40);
    setRowHeight(sheet, MAX_SHEET_ROWS - 1, 48);
    const beforeInsert = createSheetSparseState(sheet);

    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(beforeInsert);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 0 })).toBeNull();

    const beforeDelete = createSheetSparseState(sheet);
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 1));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(beforeDelete);
    expect(redoWorkbookCommand(session)).toBe(true);
  });

  test("stores and round-trips a populated multi-row deletion slice", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 10, column: 1 }, "deleted-value");
    setCellStyle(
      sheet,
      { row: 10, column: 1 },
      {
        borderBottom: { style: "double", color: "#123456" },
      },
    );
    setCellStyle(sheet, { row: 11, column: 2 }, { italic: true });
    setRowHeight(sheet, 11, 52);
    setCellValue(sheet, { row: 12, column: 3 }, "shifted-value");
    const before = createSheetSparseState(sheet);

    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 10, 2));

    const after = createSheetSparseState(sheet);
    const inverse = session.history.undoStack.at(-1)?.command;
    expect(inverse).toMatchObject({
      type: "restoreSheetState",
      sheetId: sheet.id,
      axis: "row",
      index: 10,
      count: 2,
      operation: "delete",
    });
    if (!inverse || !("slice" in inverse)) {
      throw new Error("Expected a deleted row axis slice history inverse.");
    }
    expect(inverse.slice.cells).toEqual([
      {
        address: { row: 10, column: 1 },
        content: { kind: "literal", value: "deleted-value" },
        style: { borderBottom: { style: "double", color: "#123456" } },
      },
      { address: { row: 11, column: 2 }, style: { italic: true } },
    ]);
    expect(inverse.slice.dimensions).toEqual([{ index: 11, size: 52 }]);
    expect(getCellValue(sheet, { row: 10, column: 3 })).toBe("shifted-value");

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(after);
  });

  test("stores and round-trips a populated multi-column deletion slice", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 20 }, "deleted-value");
    setCellStyle(
      sheet,
      { row: 1, column: 20 },
      {
        borderRight: { style: "dashed", color: "#abcdef" },
      },
    );
    setCellStyle(sheet, { row: 2, column: 21 }, { bold: true });
    setColumnWidth(sheet, 21, 180);
    setCellValue(sheet, { row: 3, column: 22 }, "shifted-value");
    const before = createSheetSparseState(sheet);

    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "column", 20, 2));

    const after = createSheetSparseState(sheet);
    const inverse = session.history.undoStack.at(-1)?.command;
    expect(inverse).toMatchObject({
      type: "restoreSheetState",
      sheetId: sheet.id,
      axis: "column",
      index: 20,
      count: 2,
      operation: "delete",
    });
    if (!inverse || !("slice" in inverse)) {
      throw new Error("Expected a deleted column axis slice history inverse.");
    }
    expect(inverse.slice.cells).toEqual([
      {
        address: { row: 1, column: 20 },
        content: { kind: "literal", value: "deleted-value" },
        style: { borderRight: { style: "dashed", color: "#abcdef" } },
      },
      { address: { row: 2, column: 21 }, style: { bold: true } },
    ]);
    expect(inverse.slice.dimensions).toEqual([{ index: 21, size: 180 }]);
    expect(getCellValue(sheet, { row: 3, column: 20 })).toBe("shifted-value");

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(after);
  });

  test("stores only an affected axis slice in large sparse structure history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (let row = 0; row < 512; row += 1) {
      setCellValue(sheet, { row, column: 0 }, `unaffected-${row}`);
    }
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 2, column: 1 }, "tail-1");
    setCellStyle(sheet, { row: MAX_SHEET_ROWS - 2, column: 1 }, { bold: true });
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 2 }, "tail-2");
    setCellStyle(
      sheet,
      { row: MAX_SHEET_ROWS - 1, column: 2 },
      {
        borderLeft: { style: "medium", color: "#654321" },
      },
    );
    setRowHeight(sheet, MAX_SHEET_ROWS - 1, 48);
    const before = createSheetSparseState(sheet);

    executeWorkbookCommand(
      session,
      createInsertSheetAxisCommand(sheet.id, "row", MAX_SHEET_ROWS - 2, 2),
    );

    const inverse = session.history.undoStack.at(-1)?.command;
    expect(inverse).toMatchObject({
      type: "restoreSheetState",
      sheetId: sheet.id,
      axis: "row",
      index: MAX_SHEET_ROWS - 2,
      count: 2,
      operation: "insert",
    });
    if (!inverse || !("slice" in inverse)) {
      throw new Error("Expected an axis slice history inverse.");
    }
    expect(inverse.slice.cells).toHaveLength(2);
    expect(inverse.slice.dimensions).toEqual([{ index: MAX_SHEET_ROWS - 1, size: 48 }]);
    expect(inverse.slice.cells.every((cell) => cell.address.row >= MAX_SHEET_ROWS - 2)).toBe(true);
    expect(JSON.parse(JSON.stringify(inverse))).toEqual(inverse);
    expect(JSON.stringify(inverse)).not.toContain("unaffected-0");

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("round-trips column insert truncation and deleted column slices", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 2, column: 1 }, "before");
    setCellValue(sheet, { row: 2, column: MAX_SHEET_COLUMNS - 1 }, "tail");
    setCellStyle(
      sheet,
      { row: 2, column: MAX_SHEET_COLUMNS - 1 },
      {
        borderRight: { style: "dashed", color: "#abcdef" },
      },
    );
    setColumnWidth(sheet, 1, 144);
    setColumnWidth(sheet, MAX_SHEET_COLUMNS - 1, 160);
    setRowHeight(sheet, 2, 40);
    const beforeInsert = createSheetSparseState(sheet);

    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "column", 1));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(beforeInsert);
    expect(redoWorkbookCommand(session)).toBe(true);

    const beforeDelete = createSheetSparseState(sheet);
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "column", 1));
    const inverse = session.history.undoStack.at(-1)?.command;
    if (!inverse || !("slice" in inverse)) {
      throw new Error("Expected a deleted column axis slice history inverse.");
    }
    expect(inverse.slice.cells.every((cell) => cell.address.column === 1)).toBe(true);
    expect(inverse.slice.dimensions.every((dimension) => dimension.index === 1)).toBe(true);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(beforeDelete);
    expect(redoWorkbookCommand(session)).toBe(true);
  });

  test("supports the first and final valid axis bands", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "first");
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 3, column: 0 }, "near-tail");
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 0 }, "last");

    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 0, 2));
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe("first");
    expect(getCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 0 })).toBe("near-tail");

    executeWorkbookCommand(
      session,
      createDeleteSheetAxisCommand(sheet.id, "row", MAX_SHEET_ROWS - 2, 2),
    );
    expect(getCellValue(sheet, { row: MAX_SHEET_ROWS - 2, column: 0 })).toBeNull();
  });

  test("does not record an empty structure change or discard redo history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "redo");
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 0));
    undoWorkbookCommand(session);

    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 100)),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
    expect(session.history.redoStack).toHaveLength(1);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
  });

  test("rejects invalid axis ranges atomically", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 2, column: 2 }, "keep");
    setRowHeight(sheet, 2, 40);
    const before = createSheetSparseState(sheet);

    for (const command of [
      createInsertSheetAxisCommand(sheet.id, "row", -1),
      createDeleteSheetAxisCommand(sheet.id, "column", 0, 0),
      createInsertSheetAxisCommand(sheet.id, "row", MAX_SHEET_ROWS, 1),
      createDeleteSheetAxisCommand(sheet.id, "column", MAX_SHEET_COLUMNS - 1, 2),
    ]) {
      expect(() => executeWorkbookCommand(session, command)).toThrowError(
        expect.objectContaining({
          data: expect.objectContaining({ code: "invalid_command_payload" }),
        }),
      );
      expect(createSheetSparseState(sheet)).toEqual(before);
      expect(session.history.undoStack).toHaveLength(0);
    }
  });

  test("rejects an out-of-slice axis inverse before mutating the target sheet", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 2, column: 2 }, "keep");
    const before = createSheetSparseState(sheet);
    const command = {
      type: "restoreSheetState",
      sheetId: sheet.id,
      axis: "row",
      index: 2,
      count: 1,
      operation: "delete",
      slice: {
        cells: [
          { address: { row: 10, column: 2 }, content: { kind: "literal", value: "outside" } },
        ],
        dimensions: [],
        metadata: {
          freezePanes: { ...sheet.freezePanes },
          filter: sheet.filter,
          mergedCells: sheet.mergedCells,
        },
      },
    } as unknown as WorkbookCommand;

    expect(() => applyWorkbookCommand(session.workbook, command)).toThrow(
      "outside the restored slice",
    );
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("validates an internal sparse-state replacement before mutating the sheet", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 2, column: 2 }, "keep");
    const before = createSheetSparseState(sheet);
    const command = {
      type: "restoreSheetState",
      sheetId: sheet.id,
      state: {
        cells: [
          { address: { row: 0, column: 0 }, content: { kind: "literal", value: "first" } },
          { address: { row: 0, column: 0 }, content: { kind: "literal", value: "duplicate" } },
        ],
        rowHeights: [],
        columnWidths: [],
      },
    } as unknown as WorkbookCommand;

    expect(() => applyWorkbookCommand(session.workbook, command)).toThrow("duplicate cell");
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("rebases a deleted conditional-format anchor before rewriting its relative formula", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.conditionalFormats = [
      {
        id: "formula-rule",
        ranges: [{ start: { row: 1, column: 0 }, end: { row: 4, column: 0 } }],
        anchor: { row: 1, column: 0 },
        condition: { kind: "formula", formula: "=A2>0" },
        style: { fillColor: "#FF0000" },
      },
    ];

    expect(executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 1))).toBe(
      true,
    );
    expect(sheet.conditionalFormats).toEqual([
      {
        id: "formula-rule",
        ranges: [{ start: { row: 1, column: 0 }, end: { row: 3, column: 0 } }],
        anchor: { row: 1, column: 0 },
        condition: { kind: "formula", formula: "=A2>0" },
        style: { fillColor: "#FF0000" },
      },
    ]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.conditionalFormats?.[0]?.condition).toEqual({ kind: "formula", formula: "=A2>0" });
  });

  test("moves conditional-format ranges, anchors, and local or qualified formulas reversibly", () => {
    const session = createTestWorkbookSession();
    const source = getActiveSheet(session.workbook);
    source.conditionalFormats = [
      {
        id: "local",
        ranges: [{ start: { row: 1, column: 0 }, end: { row: 1, column: 0 } }],
        anchor: { row: 1, column: 0 },
        condition: { kind: "formula", formula: "=A2>0" },
        style: { fillColor: "#FF0000" },
      },
    ];
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "other" }));
    const other = session.workbook.sheets.get("other")!;
    other.conditionalFormats = [
      {
        id: "qualified",
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
        anchor: { row: 0, column: 0 },
        condition: { kind: "formula", formula: "=Sheet1!A2>0" },
        style: { textColor: "#FF0000" },
      },
    ];

    expect(
      executeWorkbookCommand(session, createMoveSheetAxisCommand(source.id, "row", 1, 1, 3)),
    ).toBe(true);
    expect(source.conditionalFormats?.[0]).toMatchObject({
      ranges: [{ start: { row: 3, column: 0 }, end: { row: 3, column: 0 } }],
      anchor: { row: 3, column: 0 },
      condition: { kind: "formula", formula: "=A4>0" },
    });
    expect(other.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "=Sheet1!A4>0",
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(source.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "=A2>0",
    });
    expect(other.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "=Sheet1!A2>0",
    });
  });

  test("rewrites every dynamic conditional-format operand independently through structural edits", () => {
    const session = createTestWorkbookSession();
    const source = getActiveSheet(session.workbook);
    setCellValue(source, { row: 1, column: 0 }, 1);
    setCellValue(source, { row: 2, column: 0 }, 2);
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "other" }));
    const other = session.workbook.sheets.get("other")!;
    other.conditionalFormats = [
      {
        id: "dynamic-operands",
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
        anchor: { row: 0, column: 0 },
        condition: {
          kind: "cellValue",
          operator: "between",
          value: { formula: "=Sheet1!A2" },
          secondValue: { formula: "=Sheet1!A3" },
        },
        style: { fillColor: "#FF0000" },
      },
    ];
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(source.id, "row", 1, 1)),
    ).toBe(true);
    expect(other.conditionalFormats?.[0]?.condition).toMatchObject({
      value: { formula: "=Sheet1!A3" },
      secondValue: { formula: "=Sheet1!A4" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(other.conditionalFormats?.[0]?.condition).toMatchObject({
      value: { formula: "=Sheet1!A2" },
      secondValue: { formula: "=Sheet1!A3" },
    });
  });

  test("rejects external relative conditional formulas applied over multiple changed-axis cells", () => {
    const session = createTestWorkbookSession();
    const source = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "other" }));
    const other = session.workbook.sheets.get("other")!;
    other.conditionalFormats = [
      {
        id: "ambiguous",
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 1, column: 0 } }],
        anchor: { row: 0, column: 0 },
        condition: { kind: "formula", formula: "=Sheet1!A1>0" },
        style: { fillColor: "#FF0000" },
      },
    ];
    const sourceBefore = createSheetSparseState(source);
    const otherBefore = createSheetSparseState(other);

    expect(
      tryApplyWorkbookCommand(session.workbook, createDeleteSheetAxisCommand(source.id, "row", 1)),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(source)).toEqual(sourceBefore);
    expect(createSheetSparseState(other)).toEqual(otherBefore);
  });
});
