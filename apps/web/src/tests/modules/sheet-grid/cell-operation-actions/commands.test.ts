import { describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  getActiveSheet,
  getCellContent,
  getCellValue,
  setCellContent,
  setCellValue,
} from "@sheetcraft/core/workbook";
import { createCellOperationActions } from "../../../../modules/sheet-grid/cell-operation-actions";

function fixture() {
  const session = createWorkbookSession({
    idFactory: createSequentialIdFactory(),
  });
  const sheet = getActiveSheet(session.workbook);
  const flush = vi.fn(() => true);
  const error = vi.fn();
  const actions = createCellOperationActions({
    getSheet: () => sheet,
    flushPendingEdits: flush,
    execute: (command) => executeWorkbookCommand(session, command),
    onError: error,
  });
  return { session, sheet, actions, flush, error };
}

describe("cell operation actions", () => {
  test("routes directional and entire-axis operations through one undoable core command", () => {
    const { session, sheet, actions } = fixture();
    setCellValue(sheet, { row: 0, column: 1 }, "right");
    actions.cellOperation({
      operation: "insert",
      range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      direction: "right",
    });
    expect(getCellValue(sheet, { row: 0, column: 2 })).toBe("right");
    expect(session.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(session);
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe("right");

    setCellValue(sheet, { row: 2, column: 0 }, "row");
    actions.cellOperation({
      operation: "insert",
      range: { start: { row: 1, column: 4 }, end: { row: 2, column: 5 } },
      direction: "row",
    });
    expect(getCellValue(sheet, { row: 4, column: 0 })).toBe("row");
  });

  test("deletes only fully empty selected rows as one history entry and restores them", () => {
    const { session, sheet, actions } = fixture();
    setCellValue(sheet, { row: 1, column: 200 }, "kept");
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "formula", formula: { source: "=1" } });
    sheet.floatingImages.push({
      id: "image-row-4",
      assetId: "asset",
      altText: "image",
      anchor: { row: 4, column: 1 },
      offsetX: 0,
      offsetY: 0,
      width: 10,
      height: 10,
    });
    setCellContent(
      sheet,
      { row: 5, column: 0 },
      {
        kind: "image",
        image: { assetId: "embedded-asset", altText: "embedded image" },
      },
    );
    sheet.mergedCells.push({
      start: { row: 6, column: 0 },
      end: { row: 7, column: 1 },
    });

    actions.deleteEmptyRows({
      start: { row: 0, column: 0 },
      end: { row: 7, column: 0 },
    });
    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellValue(sheet, { row: 0, column: 200 })).toBe("kept");
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=1" },
    });
    expect(sheet.floatingImages[0]?.anchor?.row).toBe(2);
    expect(getCellContent(sheet, { row: 3, column: 0 })).toEqual({
      kind: "image",
      image: { assetId: "embedded-asset", altText: "embedded image" },
    });
    expect(sheet.mergedCells).toEqual([
      { start: { row: 4, column: 0 }, end: { row: 5, column: 1 } },
    ]);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 200 })).toBe("kept");
    expect(sheet.floatingImages[0]?.anchor?.row).toBe(4);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.mergedCells).toEqual([
      { start: { row: 4, column: 0 }, end: { row: 5, column: 1 } },
    ]);
  });

  test("flushes drafts and refuses protected sheets before inspecting or changing rows", () => {
    const { session, sheet, actions, flush } = fixture();
    flush.mockReturnValue(false);
    actions.deleteEmptyRows({
      start: { row: 0, column: 0 },
      end: { row: 2, column: 0 },
    });
    expect(session.history.undoStack).toHaveLength(0);
    flush.mockReturnValue(true);
    sheet.properties.protected = true;
    actions.cellOperation({
      operation: "delete",
      range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      direction: "up",
    });
    expect(session.history.undoStack).toHaveLength(0);
  });
});
