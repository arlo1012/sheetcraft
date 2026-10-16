import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  applyWorkbookCommand,
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  createResetSheetDimensionSizesCommand,
  createResizeSheetDimensionCommand,
  createResizeSheetDimensionsCommand,
  createSetSheetDimensionHiddenCommand,
  createSetSheetDimensionSizesCommand,
} from "../../commands/index.js";
import {
  createSheetSparseState,
  getActiveSheet,
  getDefaultRowHeight,
  getRowHeight,
  setRowHeight,
  setSheetDimensionHidden,
} from "../../workbook.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { resolvePictureFrame } from "../../picture-frame.js";
import type { FramedFloatingImage } from "../../picture-object.js";

function setup() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  sheet.defaultRowHeight = 20;
  return { session, sheet };
}
function picture(): FramedFloatingImage {
  return {
    id: "picture",
    assetId: "asset",
    altText: "Picture",
    frame: {
      kind: "object-frame-v1",
      anchor: {
        mode: "move-and-size",
        offsetMode: "free-pixels",
        start: { column: { index: 0, offset: 0 }, row: { index: 2, offset: 3 } },
        end: { column: { index: 2, offset: 0 }, row: { index: 5, offset: 7 } },
      },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 0,
    },
  };
}

describe("default row height command/history propagation", () => {
  test("resizes, resets, hides and restores explicit24 against the20 baseline", () => {
    const { session, sheet } = setup();
    expect(
      executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "row", 2, 24)),
    ).toBe(true);
    expect(sheet.rowHeights.get(2)).toBe(24);
    executeWorkbookCommand(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "row", [2], true),
    );
    expect(getRowHeight(sheet, 2)).toBe(0);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getRowHeight(sheet, 2)).toBe(24);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getRowHeight(sheet, 2)).toBe(20);
    expect(getDefaultRowHeight(sheet)).toBe(20);
    expect(redoWorkbookCommand(session)).toBe(true);
    executeWorkbookCommand(session, createResetSheetDimensionSizesCommand(sheet.id, "row", [2]));
    expect(sheet.rowHeights.size).toBe(0);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.rowHeights.get(2)).toBe(24);
  });

  test("bulk resize no-op checks use20 and retain redo history", () => {
    const { session, sheet } = setup();
    executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "row", 4, 24));
    undoWorkbookCommand(session);
    expect(
      executeWorkbookCommand(
        session,
        createResizeSheetDimensionsCommand(sheet.id, "row", [3, 4], 20),
      ),
    ).toBe(false);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDimensionSizesCommand(sheet.id, "row", [{ index: 3, size: 20 }]),
      ),
    ).toBe(false);
    expect(session.history.redoStack).toHaveLength(1);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getRowHeight(sheet, 4)).toBe(24);
  });

  test("deleted explicit24/hidden rows restore through a target-baseline slice", () => {
    const { session, sheet } = setup();
    setRowHeight(sheet, 3, 24);
    setSheetDimensionHidden(sheet, "row", 3, true);
    const before = createSheetSparseState(sheet);
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 3, 1));
    expect(sheet.rowHeights.size).toBe(0);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getDefaultRowHeight(sheet)).toBe(20);
  });

  test("insert and move rows inherit20 and preserve manual/hidden overrides and full history", () => {
    const { session, sheet } = setup();
    setRowHeight(sheet, 2, 24);
    setSheetDimensionHidden(sheet, "row", 2, true);
    const before = createSheetSparseState(sheet);
    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1, 2));
    expect(getRowHeight(sheet, 1)).toBe(20);
    expect(sheet.rowHeights.get(4)).toBe(24);
    executeWorkbookCommand(session, createMoveSheetAxisCommand(sheet.id, "row", 4, 1, 7));
    expect(sheet.rowHeights.get(7)).toBe(24);
    expect(sheet.hiddenRows?.has(7)).toBe(true);
    undoWorkbookCommand(session);
    undoWorkbookCommand(session);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("legacy row dimension inverses retain the current baseline instead of resetting it", () => {
    const { session, sheet } = setup();
    setRowHeight(sheet, 4, 36);
    applyWorkbookCommand(session.workbook, {
      type: "restoreSheetDimensionState",
      sheetId: sheet.id,
      axis: "row",
      dimensions: [{ index: 4, size: 24 }],
      hiddenIndexes: [],
    });
    expect(getDefaultRowHeight(sheet)).toBe(20);
    expect(getRowHeight(sheet, 4)).toBe(24);
  });

  test("explicit default changes in exact row inverses are reversible", () => {
    const { session, sheet } = setup();
    const before = createSheetSparseState(sheet);
    executeWorkbookCommand(session, {
      type: "restoreSheetDimensionState",
      sheetId: sheet.id,
      axis: "row",
      defaultRowHeight: 24,
      dimensions: [{ index: 4, size: 20 }],
      hiddenIndexes: [4],
    });
    expect(getDefaultRowHeight(sheet)).toBe(24);
    expect(sheet.rowHeights.get(4)).toBe(20);
    undoWorkbookCommand(session);
    expect(createSheetSparseState(sheet)).toEqual(before);
    redoWorkbookCommand(session);
    expect(getDefaultRowHeight(sheet)).toBe(24);
    expect(sheet.rowHeights.get(4)).toBe(20);
  });

  test("pictures reflow from20px metrics through resize, insert, delete and undo", () => {
    const { session, sheet } = setup();
    const image = picture();
    sheet.floatingImages = [image];
    const rect = () =>
      resolvePictureFrame(
        (sheet.floatingImages[0] as FramedFloatingImage).frame,
        createPictureSheetMetrics(sheet),
      ).rect;
    expect(rect()).toMatchObject({ y: 43, height: 64 });
    const before = createSheetSparseState(sheet);
    executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "row", 3, 24));
    expect(rect()).toMatchObject({ y: 43, height: 68 });
    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1, 1));
    expect(rect()).toMatchObject({ y: 63, height: 68 });
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 4, 1));
    expect(rect()).toMatchObject({ y: 63, height: 44 });
    undoWorkbookCommand(session);
    undoWorkbookCommand(session);
    undoWorkbookCommand(session);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(rect()).toMatchObject({ y: 43, height: 64 });
  });
});
