import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  createInsertSheetAxisCommand,
  createRestoreSheetStateCommand,
} from "../../commands/structure.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "../../sheet-drawings.js";
import type { ShapeDetailedStyle } from "../../shape-style.js";
import { serializeWorkbook } from "../../serialization.js";
import { createSheetSparseState, getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import {
  legacyShapeDrawing,
  styledShapeDrawing,
  textureShapeStyle,
} from "./shape-style-fixture.js";

function mutateNestedStyle(style: ShapeDetailedStyle) {
  if (style.fill?.kind === "value") {
    const fill = style.fill.value;
    if (fill.kind === "linear") {
      fill.stops[1]!.opacity = 0;
      const color = fill.stops[1]!.color;
      if (color.kind === "theme") color.reference.tint = -0.5;
    } else if (fill.kind === "picture" && fill.layout.kind === "tile") {
      fill.layout.offsetXPt = 1;
    }
  }
  if (style.line?.kind === "value") {
    const paint = style.line.value.paint;
    if (paint.kind === "picture" && paint.layout.kind === "tile") paint.layout.scaleY = 1;
    else if (paint.kind === "linear") paint.stops[0]!.brightness = 1;
  }
  if (style.shadow?.kind === "value") style.shadow.value.opacity = 0;
}

describe("typed shape style cloning and command history", () => {
  test("source inputs, command payloads, snapshots and history detach every nested style branch", () => {
    for (const style of [fullStyle(), textureShapeStyle()]) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [legacyShapeDrawing()];
      const before = serializeWorkbook(session.workbook),
        input = styledShapeDrawing(style),
        expected = structuredClone(input),
        command = createSetSheetDrawingsCommand(sheet.id, [input]);
      mutateNestedStyle(input.shapeStyle!);
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(sheet.drawings).toEqual([expected]);
      expect(session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(session.workbook);
      expect(after.version).toBe(58);
      mutateNestedStyle((command.drawings[0] as SheetGraphicDrawing).shapeStyle!);
      expect(sheet.drawings).toEqual([expected]);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
      mutateNestedStyle((after.sheets[0]!.drawings![0] as SheetGraphicDrawing).shapeStyle!);
      expect(sheet.drawings).toEqual([expected]);
      const revision = session.history.revision;
      expect(
        executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [expected])),
      ).toBe(false);
      expect(session.history.revision).toBe(revision);
      expect(session.history.undoStack).toHaveLength(1);
    }
  });

  test("canonical color, angle and record ordering produce a no-op instead of an extra history entry", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      original = styledShapeDrawing();
    sheet.drawings = [normalizeSheetDrawing(original)];
    const input = fullStyle();
    if (input.fill?.kind !== "value" || input.fill.value.kind !== "linear")
      throw Error("Expected gradient");
    input.fill.value.angleDeg = -330;
    const color = input.fill.value.stops[0]!.color;
    if (color.kind !== "rgb") throw Error("Expected RGB color");
    color.rgb = "#abcdef";
    if (input.line?.kind !== "value") throw Error("Expected line");
    const line = input.line;
    input.line.value = Object.fromEntries(
      Object.entries(input.line.value).reverse(),
    ) as typeof line.value;
    const reordered = Object.fromEntries(Object.entries(input).reverse()) as ShapeDetailedStyle,
      before = serializeWorkbook(session.workbook),
      revision = session.history.revision;
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [styledShapeDrawing(reordered)]),
      ),
    ).toBe(false);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("sparse styles are no-ops while explicit None and removal each create one reversible edit", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      plain = normalizeSheetDrawing(legacyShapeDrawing());
    sheet.drawings = [plain];
    for (const shapeStyle of [{}, undefined])
      expect(
        executeWorkbookCommand(
          session,
          createSetSheetDrawingsCommand(sheet.id, [{ ...legacyShapeDrawing(), shapeStyle }]),
        ),
      ).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
    const none = styledShapeDrawing({
      fill: { kind: "none" },
      line: { kind: "none" },
      shadow: { kind: "none" },
    });
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [none]))).toBe(
      true,
    );
    expect(sheet.drawings).toEqual([none]);
    expect(serializeWorkbook(session.workbook).version).toBe(58);
    expect(session.history.undoStack).toHaveLength(1);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [legacyShapeDrawing()]),
      ),
    ).toBe(true);
    expect(sheet.drawings).toEqual([plain]);
    expect(serializeWorkbook(session.workbook).version).toBe(43);
    expect(session.history.undoStack).toHaveLength(2);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([none]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([plain]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([none]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([plain]);
  });

  test("axis edits and sparse-state restore retain detached styles and exact inverses", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [styledShapeDrawing()];
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1, 2)),
    ).toBe(true);
    expect(sheet.drawings).toEqual([{ ...styledShapeDrawing(), anchor: { row: 5, column: 2 } }]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    const state = createSheetSparseState(sheet),
      restore = createRestoreSheetStateCommand(sheet.id, state);
    mutateNestedStyle((state.drawings![0] as SheetGraphicDrawing).shapeStyle!);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    sheet.drawings = [];
    expect(executeWorkbookCommand(session, restore)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    mutateNestedStyle((restore.state.drawings![0] as SheetGraphicDrawing).shapeStyle!);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });

  test("invalid and accessor styles fail atomically at command construction and raw execution", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [styledShapeDrawing()];
    const before = serializeWorkbook(session.workbook),
      revision = session.history.revision;
    let reads = 0;
    const accessor = legacyShapeDrawing();
    Object.defineProperty(accessor, "shapeStyle", {
      get() {
        reads++;
        return fullStyle();
      },
    });
    const inherited = Object.assign(
      Object.create({
        get shapeStyle() {
          reads++;
          return fullStyle();
        },
      }),
      legacyShapeDrawing(),
    );
    for (const drawing of [
      styledShapeDrawing({
        softEdges: { kind: "value", value: { sizePt: NaN } },
      }),
      {
        ...legacyShapeDrawing(),
        shapeStyle: { unexpected: true },
      } as unknown as SheetGraphicDrawing,
      accessor,
      inherited,
    ]) {
      expect(() => createSetSheetDrawingsCommand(sheet.id, [drawing])).toThrow();
      expect(() =>
        executeWorkbookCommand(session, {
          type: "setSheetDrawings",
          sheetId: sheet.id,
          drawings: [drawing],
        }),
      ).toThrow();
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history.revision).toBe(revision);
      expect(session.history.undoStack).toHaveLength(0);
    }
    expect(reads).toBe(0);
  });
});
