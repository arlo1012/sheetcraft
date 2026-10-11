import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import { getActiveSheet, cloneFloatingImage, type FloatingImage } from "../../workbook.js";
import { MAX_SHEET_ROWS, MAX_SHEET_COLUMNS } from "../../sheet-limits.js";
import { serializeWorkbook } from "../../serialization.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  applyWorkbookCommand,
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createResizeSheetDimensionCommand,
  createSetSheetDefaultColumnWidthCommand,
  type RestoreSheetDimensionStateCommand,
  type RestoreSheetAxisSliceCommand,
} from "../../commands/index.js";
function picture(id: string, row: number): FloatingImage {
  return {
    id,
    assetId: `asset-${id}`,
    altText: id,
    anchor: { row, column: 2 },
    offsetX: 400,
    offsetY: 2,
    width: 360,
    height: 240,
    groupId: "group",
    transform: {
      appearance: { opacity: 0.5 },
      annotations: [{ kind: "pen", color: "#FF0000", width: 0.01, points: [{ x: 0.2, y: 0.3 }] }],
    },
  };
}
function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  sheet.floatingImages = [picture("front", 8), picture("middle", 4), picture("back", 1)];
  return { session, sheet };
}
describe("exact ordered picture state in dimension inverses", () => {
  test.each(["column", "default-column"] as const)(
    "%s inverse restores full picture state",
    (kind) => {
      const { session, sheet } = fixture();
      const before = serializeWorkbook(session.workbook);
      const command =
        kind === "column"
          ? createResizeSheetDimensionCommand(sheet.id, "column", 2, 180)
          : createSetSheetDefaultColumnWidthCommand(sheet.id, 88);
      expect(executeWorkbookCommand(session, command)).toBe(true);
      sheet.floatingImages.reverse();
      sheet.floatingImages[0]!.offsetX = 8;
      const edited = serializeWorkbook(session.workbook);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(edited);
    },
  );
  test("captures detached complete state and restores retained objects, metadata, source and order", () => {
    const { session, sheet } = fixture();
    const before = serializeWorkbook(session.workbook);
    executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "row", 4, 64));
    const inverse = session.history.undoStack[0]!.command as RestoreSheetDimensionStateCommand;
    expect(inverse.floatingImageState?.map((image) => image.id)).toEqual([
      "front",
      "middle",
      "back",
    ]);
    sheet.floatingImages.reverse();
    sheet.floatingImages[0]!.width = 180;
    sheet.floatingImages[0]!.assetId = "changed-source";
    sheet.floatingImages[0]!.transform!.annotations![0]!.points[0]!.x = 0.9;
    expect(inverse.floatingImageState![2]!.width).toBe(360);
    expect(inverse.floatingImageState![2]!.transform!.annotations![0]!.points[0]!.x).toBe(0.2);
    const edited = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(edited);
  });
  test("explicit empty collection means restore empty; undefined preserves legacy images", () => {
    const { session, sheet } = fixture();
    const command: RestoreSheetDimensionStateCommand = {
      type: "restoreSheetDimensionState",
      sheetId: sheet.id,
      axis: "row",
      dimensions: [],
      hiddenIndexes: [],
      floatingImageState: [],
    };
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.floatingImages).toEqual([]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.floatingImages).toHaveLength(3);
    const images = sheet.floatingImages;
    const legacy = {
      ...command,
      floatingImageState: undefined,
      dimensions: [{ index: 4, size: 64 }],
    };
    expect(executeWorkbookCommand(session, legacy)).toBe(true);
    expect(sheet.floatingImages).toBe(images);
  });
  test.each(["invalid-second", "duplicate"] as const)(
    "%s state is rejected before any dimension or picture mutation",
    (kind) => {
      const { session, sheet } = fixture();
      const before = serializeWorkbook(session.workbook);
      const images = sheet.floatingImages.map(cloneFloatingImage);
      if (kind === "duplicate") images[1]!.id = images[0]!.id;
      else images[1]!.width = 0;
      const command: RestoreSheetDimensionStateCommand = {
        type: "restoreSheetDimensionState",
        sheetId: sheet.id,
        axis: "row",
        dimensions: [{ index: 4, size: 64 }],
        hiddenIndexes: [0],
        floatingImageState: images,
      };
      expect(() => executeWorkbookCommand(session, command)).toThrow();
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history.undoStack).toHaveLength(0);
    },
  );
  test("equivalent axis and picture state is a genuine no-op that preserves redo", () => {
    const { session, sheet } = fixture();
    executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "row", 4, 64));
    undoWorkbookCommand(session);
    expect(
      executeWorkbookCommand(session, {
        type: "restoreSheetDimensionState",
        sheetId: sheet.id,
        axis: "row",
        dimensions: [],
        hiddenIndexes: [],
        floatingImageState: sheet.floatingImages.map(cloneFloatingImage),
      }),
    ).toBe(false);
    expect(session.history.redoStack).toHaveLength(1);
  });
  test("a direct restore cannot smuggle object edits through protected formatRows permission", () => {
    const { session, sheet } = fixture();
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [], formatRows: true };
    const images = sheet.floatingImages.map(cloneFloatingImage);
    images[1]!.width = 180;
    const before = serializeWorkbook(session.workbook);
    const command: RestoreSheetDimensionStateCommand = {
      type: "restoreSheetDimensionState",
      sheetId: sheet.id,
      axis: "row",
      dimensions: [{ index: 4, size: 64 }],
      hiddenIndexes: [],
      floatingImageState: images,
    };
    expect(() => executeWorkbookCommand(session, command)).toThrow(/protected/);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    command.floatingImageState = sheet.floatingImages.map(cloneFloatingImage);
    expect(executeWorkbookCommand(session, command)).toBe(true);
  });
});
describe("exact ordered picture state in axis inverses", () => {
  test("an explicitly captured empty collection removes pictures created after the axis action", () => {
    const { session, sheet } = fixture();
    sheet.floatingImages = [];
    sheet.rowHeights.set(8, 40);
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 4, 1)),
    ).toBe(true);
    const inverse = session.history.undoStack[0]!.command as RestoreSheetAxisSliceCommand;
    expect(inverse.slice.floatingImageState).toEqual([]);
    sheet.floatingImages = [picture("later", 4)];
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });
  test.each(["row", "column"] as const)(
    "%s insertion restores pictures truncated at the sheet limit",
    (axis) => {
      const { session, sheet } = fixture();
      const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
      sheet.floatingImages[0]!.anchor[axis] = maximum - 1;
      const before = serializeWorkbook(session.workbook);
      expect(
        executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, axis, 4, 1)),
      ).toBe(true);
      expect(sheet.floatingImages.map((image) => image.id)).not.toContain("front");
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
    },
  );
  test.each(["insert", "delete"] as const)(
    "%s stores the entire original collection independently of the removed slice",
    (operation) => {
      const { session, sheet } = fixture();
      const before = serializeWorkbook(session.workbook);
      const command =
        operation === "insert"
          ? createInsertSheetAxisCommand(sheet.id, "row", 4, 1)
          : createDeleteSheetAxisCommand(sheet.id, "row", 4, 1);
      executeWorkbookCommand(session, command);
      const after = serializeWorkbook(session.workbook);
      const inverse = session.history.undoStack[0]!.command as RestoreSheetAxisSliceCommand;
      expect(inverse.slice.floatingImageState?.map((image) => image.id)).toEqual([
        "front",
        "middle",
        "back",
      ]);
      expect(inverse.slice.floatingImages).toHaveLength(operation === "delete" ? 1 : 0);
      const detached = structuredClone(inverse.slice.floatingImageState);
      sheet.floatingImages[0]!.transform!.annotations![0]!.points[0]!.x = 0.8;
      sheet.floatingImages.reverse();
      expect(inverse.slice.floatingImageState).toEqual(detached);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    },
  );
  test("legacy axis inverses without full-state field still restore removed pictures", () => {
    const { session, sheet } = fixture();
    const before = serializeWorkbook(session.workbook);
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 4, 1));
    const inverse = session.history.undoStack[0]!.command as RestoreSheetAxisSliceCommand;
    delete inverse.slice.floatingImageState;
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });
  test("invalid full-state rejects before the reverse axis operation mutates cells or dimensions", () => {
    const { session, sheet } = fixture();
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 4, 1));
    const before = serializeWorkbook(session.workbook);
    const inverse = structuredClone(
      session.history.undoStack[0]!.command,
    ) as RestoreSheetAxisSliceCommand;
    inverse.slice.floatingImageState![1]!.width = 0;
    expect(() => applyWorkbookCommand(session.workbook, inverse, { fromHistory: true })).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(1);
  });
});
