import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  createInsertSheetAxisCommand,
  createRestoreSheetStateCommand,
} from "../../commands/structure.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import {
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "../../sheet-drawings.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import { traverseShapeGroup } from "../../shape-group.js";
import { createSheetSparseState, getActiveSheet, getSheetMetadata } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { freePathDrawing } from "../drawings/free-path-fixture.js";
import { framedWarpedDrawing, textWarpLeaf, warpedDrawing, warpedTree } from "./model-fixtures.js";

function target(drawing: SheetDrawing) {
  return drawing.kind === "shapeGroup" ? textWarpLeaf(drawing) : (drawing as SheetGraphicDrawing);
}

describe("standard text-warp Core commands and history", () => {
  test("root and owned updates detach warp at input, command, inverse and redo boundaries", () => {
    for (const input of [
      warpedDrawing(),
      warpedDrawing("textBox"),
      framedWarpedDrawing(),
      warpedTree(),
      warpedTree("textBox"),
    ]) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      const before = serializeWorkbook(session.workbook),
        expected = normalizeSheetDrawing(input);
      const command = createSetSheetDrawingsCommand(sheet.id, [input]);
      target(input).shapeText!.warp = { preset: "textCircle" };
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(sheet.drawings).toEqual([expected]);
      expect(session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(session.workbook);
      target(command.drawings[0]!).shapeText!.warp = { preset: "textArchUp" };
      expect(serializeWorkbook(session.workbook)).toEqual(after);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    }
  });

  test("None is one reversible warp-only command retaining frame, geometry, flips, text and styles", () => {
    for (const drawing of [
      warpedDrawing(),
      framedWarpedDrawing(),
      { ...warpedDrawing(), shapePath: freePathDrawing().shapePath },
      warpedTree(),
    ]) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [normalizeSheetDrawing(drawing)];
      const before = serializeWorkbook(session.workbook),
        input = normalizeSheetDrawing(drawing);
      const { warp: _warp, ...none } = target(input).shapeText!;
      target(input).shapeText = none;
      const expected = normalizeSheetDrawing(input);
      expect(
        executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [input])),
      ).toBe(true);
      expect(sheet.drawings).toEqual([expected]);
      expect(target(sheet.drawings[0]!).shapeText).not.toHaveProperty("warp");
      const after = serializeWorkbook(session.workbook);
      expect(after.version).toBe(66);
      expect(
        executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [input])),
      ).toBe(false);
      expect(session.history.undoStack).toHaveLength(1);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    }
  });

  test("canonical default adjustments are a no-op while textPlain adds active semantics", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const drawing = warpedDrawing();
    drawing.shapeText!.warp = { preset: "textPlain" };
    sheet.drawings = [normalizeSheetDrawing(drawing)];
    const before = serializeWorkbook(session.workbook),
      revision = session.history.revision;
    drawing.shapeText!.warp = { preset: "textPlain", adjustments: { adj: 50000 } };
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing])),
    ).toBe(false);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
    const { warp: _warp, ...none } = drawing.shapeText!;
    drawing.shapeText = none;
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing])),
    ).toBe(true);
    drawing.shapeText!.warp = { preset: "textPlain" };
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing])),
    ).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });

  test("root/owned clipboard, metadata and sparse restore deeply preserve independent warp overrides", () => {
    for (const drawing of [warpedDrawing(), warpedTree()]) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [normalizeSheetDrawing(drawing)];
      const before = serializeWorkbook(session.workbook);
      let id = 0;
      const copy = cloneShapeRootsForClipboard(sheet.drawings, {
        createId: () => `copy-${++id}`,
      })[0]!;
      const copiedTarget =
        copy.kind === "shapeGroup"
          ? traverseShapeGroup(copy).find(
              ({ node }) =>
                (node.kind === "shape" || node.kind === "textBox") && node.shapeText?.warp,
            )!.node
          : copy;
      if (copiedTarget.kind !== "shape" && copiedTarget.kind !== "textBox")
        throw Error("Expected copied text-warp leaf.");
      expect(copiedTarget.shapeText!.warp).toEqual(target(sheet.drawings[0]!).shapeText!.warp);
      expect(copiedTarget.shapeText!.warp!.adjustments).not.toBe(
        target(sheet.drawings[0]!).shapeText!.warp!.adjustments,
      );
      (copiedTarget.shapeText!.warp!.adjustments as Record<string, number>).adj1 = 1;
      const metadata = getSheetMetadata(sheet);
      target(metadata.drawings![0]!).shapeText!.warp = { preset: "textPlain" };
      const state = createSheetSparseState(sheet),
        restore = createRestoreSheetStateCommand(sheet.id, state);
      target(state.drawings![0]!).shapeText!.warp = { preset: "textCircle" };
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, []))).toBe(
        true,
      );
      expect(executeWorkbookCommand(session, restore)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      target(restore.state.drawings![0]!).shapeText!.warp = { preset: "textArchDown" };
      expect(serializeWorkbook(session.workbook)).toEqual(before);
    }
  });

  test("structural commands preserve warp while malformed direct commands fail atomically before reads", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [normalizeSheetDrawing(warpedDrawing())];
    const original = target(sheet.drawings[0]!);
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1, 2)),
    ).toBe(true);
    expect(target(sheet.drawings[0]!).shapeText).toEqual(original.shapeText);
    expect(target(sheet.drawings[0]!).shapeText!.warp).not.toBe(original.shapeText!.warp);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    const revision = session.history.revision,
      undoLength = session.history.undoStack.length,
      redoLength = session.history.redoStack.length;
    let reads = 0;
    const bad = warpedDrawing();
    Object.defineProperty(bad.shapeText!, "warp", {
      get() {
        reads++;
        return { preset: "textCircle" };
      },
    });
    for (const invalid of [
      bad,
      { ...warpedDrawing(), shapeText: { ...warpedDrawing().shapeText!, warp: undefined } },
    ]) {
      const drawings = [
        { ...warpedDrawing(), id: "valid" },
        { ...invalid, id: "invalid" },
      ];
      expect(() => createSetSheetDrawingsCommand(sheet.id, drawings)).toThrow();
      expect(() =>
        executeWorkbookCommand(session, { type: "setSheetDrawings", sheetId: sheet.id, drawings }),
      ).toThrow();
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history.revision).toBe(revision);
      expect(session.history.undoStack).toHaveLength(undoLength);
      expect(session.history.redoStack).toHaveLength(redoLength);
    }
    expect(reads).toBe(0);
  });
});
