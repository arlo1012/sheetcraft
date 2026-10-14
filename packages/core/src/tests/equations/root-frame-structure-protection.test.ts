import { describe, expect, test } from "vitest";
import {
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import { createDeleteCellsCommand, createInsertCellsCommand } from "../../commands/cell-shift.js";
import {
  createResizeSheetDimensionCommand,
  createSetSheetDimensionHiddenCommand,
} from "../../commands/dimensions.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { resolveShapeFrame } from "../../shape-frame.js";
import { assertShapeObjectsForSheet, getShapeObjectOriginCell } from "../../shape-object-sheet.js";
import { canEditShapeObject, canEditSheetDrawingCollection } from "../../shape-protection.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  isFramedEquationDrawing,
  type SheetDrawing,
  type SheetFramedEquationDrawing,
} from "../../sheet-drawings.js";
import {
  getActiveSheet,
  setCellValue,
  setColumnWidth,
  setRowHeight,
  setSheetDimensionHidden,
  type Sheet,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { equationDrawing } from "./fixtures.js";
import {
  equationPoint,
  framedEquationDrawing,
  opaqueEquationSource,
} from "./root-frame-fixtures.js";

function fixed(opaque = false): SheetFramedEquationDrawing {
  return {
    ...framedEquationDrawing(
      { mode: "fixed", x: 317, y: 107, size: { width: 180, height: 90 } },
      opaque,
    ),
    id: "fixed",
  };
}
function stretching(opaque = false): SheetFramedEquationDrawing {
  return {
    ...framedEquationDrawing(
      { mode: "move-and-size", start: equationPoint(3, 4), end: equationPoint(5, 8) },
      opaque,
    ),
    id: "stretching",
  };
}
function requireFrame(value: SheetDrawing | undefined) {
  if (!value || !isFramedEquationDrawing(value)) throw Error("Expected Equation frame");
  return value;
}
function layout(sheet: Sheet, index = 0) {
  const drawing = requireFrame(sheet.drawings?.[index]);
  return resolveShapeFrame(drawing.shapeFrame, createPictureSheetMetrics(sheet), drawing.rotation);
}
function expectRejectedWithoutMutation(
  session: ReturnType<typeof createTestWorkbookSession>,
  command: WorkbookCommand,
) {
  const before = serializeWorkbook(session.workbook),
    history = structuredClone(session.history);
  expect(() => executeWorkbookCommand(session, command)).toThrow();
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(session.history).toEqual(history);
}

describe("Equation frames through actual axis, geometry and protection consumers", () => {
  test.each(["row", "column"] as const)(
    "%s insertion/deletion retains raw and structured source with exact reversible snapshots",
    (axis) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      setRowHeight(sheet, 4, 39);
      setColumnWidth(sheet, 3, 123);
      setSheetDimensionHidden(sheet, axis, axis === "row" ? 6 : 4, true);
      const moving = { ...framedEquationDrawing(), id: "moving" },
        opaque = { ...framedEquationDrawing(undefined, true), id: "opaque" };
      sheet.drawings = [moving, opaque, fixed(), stretching(true)];
      const before = serializeWorkbook(session.workbook);
      expect(
        executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, axis, 2, 2)),
      ).toBe(true);
      expect(requireFrame(sheet.drawings?.[0]).shapeFrame.anchor).toMatchObject({
        origin: { [axis]: { index: axis === "row" ? 6 : 5, offset: axis === "row" ? 9 : 7 } },
        size: { width: 180, height: 90 },
      });
      expect(requireFrame(sheet.drawings?.[0]).equationDocument).toEqual(moving.equationDocument);
      expect(requireFrame(sheet.drawings?.[0]).text).toBe(moving.text);
      expect(requireFrame(sheet.drawings?.[1]).text).toBe(opaqueEquationSource);
      expect("equationDocument" in requireFrame(sheet.drawings?.[1])).toBe(false);
      expect(sheet.drawings?.[2]).toEqual(fixed());
      const after = serializeWorkbook(session.workbook);
      expect(after.version).toBe(76);
      expect(getActiveSheet(deserializeWorkbook(after)).drawings).toEqual(sheet.drawings);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
      expect(
        executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, 2, 2)),
      ).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
    },
  );

  test.each(["row", "column"] as const)(
    "erased %s origin resets only its inset; erased logical spans delete the root with exact undo",
    (axis) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [framedEquationDrawing(undefined, true), fixed()];
      const before = serializeWorkbook(session.workbook),
        index = axis === "row" ? 4 : 3;
      expect(
        executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, index)),
      ).toBe(true);
      expect(requireFrame(sheet.drawings?.[0]).shapeFrame.anchor).toMatchObject({
        origin: { [axis]: { index, offset: 0 } },
        size: { width: 180, height: 90 },
      });
      expect(requireFrame(sheet.drawings?.[0]).text).toBe(opaqueEquationSource);
      expect(layout(sheet).rect).toMatchObject({ width: 180, height: 90 });
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      sheet.drawings = [fixed(), stretching(true)];
      const spans = serializeWorkbook(session.workbook);
      expect(
        executeWorkbookCommand(
          session,
          createDeleteSheetAxisCommand(sheet.id, axis, index, axis === "row" ? 4 : 2),
        ),
      ).toBe(true);
      expect(sheet.drawings).toEqual([fixed()]);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(spans);
    },
  );

  test.each(["row", "column"] as const)(
    "%s hide/resize derives Equation geometry without source/frame caches and preserves history",
    (axis) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [stretching(), framedEquationDrawing(undefined, true), fixed()];
      const before = serializeWorkbook(session.workbook),
        original = structuredClone(sheet.drawings),
        rect = layout(sheet).rect;
      expect(
        executeWorkbookCommand(
          session,
          createResizeSheetDimensionCommand(
            sheet.id,
            axis,
            axis === "row" ? 4 : 3,
            axis === "row" ? 32 : 110,
          ),
        ),
      ).toBe(true);
      expect(layout(sheet).rect).not.toEqual(rect);
      expect(sheet.drawings).toEqual(original);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      const indexes = axis === "row" ? [4, 5, 6, 7] : [3, 4];
      expect(
        executeWorkbookCommand(
          session,
          createSetSheetDimensionHiddenCommand(sheet.id, axis, indexes, true),
        ),
      ).toBe(true);
      expect(layout(sheet).collapsed).toBe(true);
      expect(layout(sheet).rect[axis === "row" ? "height" : "width"]).toBe(0);
      expect(sheet.drawings).toEqual(original);
      const hidden = serializeWorkbook(session.workbook);
      expect(serializeWorkbook(deserializeWorkbook(hidden))).toEqual(hidden);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(hidden);
    },
  );

  test("geometry and origin consumers use Equation frames and reject derived overflow atomically", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const moving = framedEquationDrawing();
    expect(getShapeObjectOriginCell(moving, sheet)).toEqual({ row: 4, column: 3 });
    expect(getShapeObjectOriginCell(stretching(), sheet)).toEqual({ row: 4, column: 3 });
    expect(getShapeObjectOriginCell(fixed(), sheet)).toEqual({ row: 4, column: 3 });
    sheet.drawings = [
      framedEquationDrawing(
        {
          mode: "move-and-size",
          start: equationPoint(0, 0),
          end: equationPoint(170, 1, 64),
        },
        true,
      ),
    ];
    expect(layout(sheet).rect.width).toBe(16384);
    expectRejectedWithoutMutation(
      session,
      createResizeSheetDimensionCommand(sheet.id, "column", 1, 97),
    );
    const invalid = framedEquationDrawing({
      mode: "move-and-size",
      start: equationPoint(0, 0),
      end: equationPoint(171, 1),
    });
    expect(() => assertShapeObjectsForSheet([invalid], sheet)).toThrow(/0–16384/);
    expectRejectedWithoutMutation(session, createSetSheetDrawingsCommand(sheet.id, [invalid]));
  });

  test.each(["move-only", "move-and-size"] as const)(
    "unsupported %s reorder and partial shifts reject without mutation or permission expansion",
    (mode) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [mode === "move-only" ? framedEquationDrawing() : stretching(true)];
      setCellValue(sheet, { row: 0, column: 0 }, "keep");
      const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
      for (const command of [
        createMoveSheetAxisCommand(sheet.id, "row", 0, 1, 2),
        createMoveSheetAxisCommand(sheet.id, "column", 0, 1, 2),
        createInsertCellsCommand(sheet.id, range, "down"),
        createDeleteCellsCommand(sheet.id, range, "up"),
      ])
        expectRejectedWithoutMutation(session, command);
    },
  );

  test("fixed Equation roots survive reorder and partial shifts with exact source and reversible history", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [fixed(true)];
    const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
    for (const command of [
      createMoveSheetAxisCommand(sheet.id, "row", 0, 1, 2),
      createInsertCellsCommand(sheet.id, range, "right"),
      createDeleteCellsCommand(sheet.id, range, "left"),
    ]) {
      setCellValue(sheet, { row: 0, column: 0 }, "move");
      const before = serializeWorkbook(session.workbook);
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(sheet.drawings).toEqual([fixed(true)]);
      const after = serializeWorkbook(session.workbook);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    }
  });

  test("only existing unlocked Equation roots can be edited on protected sheets, with exact undo/redo", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const locked = { ...fixed(), id: "locked" },
      unlocked = {
        ...framedEquationDrawing(undefined, true),
        shapeProperties: { locked: false as const },
      };
    const legacy = { ...equationDrawing(), id: "legacy" };
    sheet.drawings = [locked, unlocked, legacy];
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [] };
    expect(canEditShapeObject(sheet, locked)).toBe(false);
    expect(canEditShapeObject(sheet, legacy)).toBe(false);
    expect(canEditShapeObject(sheet, unlocked)).toBe(true);
    const before = serializeWorkbook(session.workbook),
      changed = { ...unlocked, text: "  raw changed  ", rotation: 37 };
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [locked, changed, legacy]),
      ),
    ).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(canEditSheetDrawingCollection(sheet, [locked, legacy])).toBe(true);
  });

  test("incoming unlocks/new IDs, lock changes and locked edits cannot authorize protected batches", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const locked = fixed(),
      unlocked = {
        ...framedEquationDrawing(undefined, true),
        shapeProperties: { locked: false as const },
      };
    sheet.drawings = [locked, unlocked];
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [] };
    const { shapeProperties: _properties, ...lockedAgain } = unlocked;
    for (const next of [
      [{ ...locked, shapeProperties: { locked: false as const } }, unlocked],
      [locked, { ...unlocked, id: "new" }],
      [locked, lockedAgain],
      [
        { ...locked, rotation: 45 },
        { ...unlocked, text: "allowed raw source" },
      ],
      [unlocked],
    ]) {
      expect(canEditSheetDrawingCollection(sheet, next)).toBe(false);
      expectRejectedWithoutMutation(session, createSetSheetDrawingsCommand(sheet.id, next));
    }
    sheet.protection.editObjects = true;
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [
          { ...locked, shapeProperties: { locked: false } },
          unlocked,
        ]),
      ),
    ).toBe(true);
  });
});
