import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  createInsertSheetAxisCommand,
  createRestoreSheetStateCommand,
} from "../../commands/structure.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import {
  collectShapeGroupAssetIds,
  traverseShapeGroup,
  type ShapeGroupDrawing,
} from "../../shape-group.js";
import { canEditSheetDrawingCollection } from "../../shape-protection.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "../../sheet-drawings.js";
import { createSheetSparseState, getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { group, leaf, nested, textModel, texture } from "../shape-groups/fixtures.js";
import { framedShapeDrawing } from "./shape-frame-fixture.js";
import { legacyShapeDrawing } from "./shape-style-fixture.js";

function owner(): ShapeGroupDrawing {
  const target = {
    ...leaf("target"),
    shapeGeometry: { preset: "rect" as const },
    hidden: true as const,
    shapeStyle: { fill: { kind: "value" as const, value: texture("body") } },
    shapeText: {
      ...textModel(),
      style: { fill: { kind: "value" as const, value: texture("glyph") } },
    },
  };
  const connection = {
    ...leaf("connection"),
    shapeGeometry: { preset: "bentConnector3" as const },
    text: "",
    shapeConnector: {
      kind: "shape-connector-v1" as const,
      begin: { kind: "site" as const, targetId: "target", preset: "rect" as const, siteIndex: 3 },
      end: { kind: "free" as const, xRatio: 1, yRatio: 1 },
    },
  };
  return {
    ...group("owner"),
    hidden: true,
    members: [
      { ...nested("inner"), hidden: true, members: [target, connection] },
      { ...leaf("text", "textBox"), hidden: true, shapeFlipX: true, shapeFlipY: true },
    ],
  };
}

describe("shape controls model history and clipboard", () => {
  test("legacy and text-box hide/show plus flips are exact reversible edits with detached command payloads", () => {
    for (const kind of ["shape", "textBox"] as const) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      const original = normalizeSheetDrawing({
        ...legacyShapeDrawing(),
        kind,
      }) as SheetGraphicDrawing;
      sheet.drawings = [original];
      const before = serializeWorkbook(session.workbook);
      const input: SheetGraphicDrawing = {
        ...structuredClone(original),
        hidden: true as const,
        shapeFlipX: true as const,
        shapeFlipY: true as const,
      };
      const expected = structuredClone(input),
        command = createSetSheetDrawingsCommand(sheet.id, [input]);
      delete input.hidden;
      delete input.shapeFlipX;
      input.anchor.row = 99;
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(sheet.drawings).toEqual([expected]);
      const after = serializeWorkbook(session.workbook);
      expect(after.version).toBe(64);
      expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
      Object.defineProperty(command.drawings[0]!, "hidden", { value: false });
      expect(sheet.drawings).toEqual([expected]);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
      expect(
        executeWorkbookCommand(
          session,
          createSetSheetDrawingsCommand(sheet.id, [
            { ...expected, hidden: false } as unknown as SheetDrawing,
          ]),
        ),
      ).toBe(true);
      expect(sheet.drawings![0]).not.toHaveProperty("hidden");
      expect(sheet.drawings![0]).toHaveProperty("shapeFlipX", true);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(sheet.drawings![0]).not.toHaveProperty("hidden");
    }
  });

  test("copy remaps hidden owner/leaf identities and connector associations without losing body/glyph assets or placement", () => {
    const source = owner(),
      before = structuredClone(source);
    let count = 0;
    const copied = cloneShapeRootsForClipboard([source], { createId: () => `copy-${++count}` })[0]!;
    if (copied.kind !== "shapeGroup") throw Error("Expected copied owner");
    const sourceVisits = traverseShapeGroup(source),
      copiedVisits = traverseShapeGroup(copied);
    expect(copiedVisits.map(({ node }) => node.hidden)).toEqual(
      sourceVisits.map(({ node }) => node.hidden),
    );
    expect(copied.members[1]).toMatchObject({
      kind: "textBox",
      hidden: true,
      shapeFlipX: true,
      shapeFlipY: true,
    });
    expect(copied.shapeFrame).toEqual(source.shapeFrame);
    expect(copied.shapeFrame).not.toBe(source.shapeFrame);
    expect([...collectShapeGroupAssetIds(copied)]).toEqual(["body", "glyph"]);
    expect(copied).toHaveProperty("members.0.members.1.shapeConnector.begin.targetId", "copy-3");
    expect(copiedVisits.map(({ node }) => node.id)).toEqual([
      "copy-1",
      "copy-2",
      "copy-3",
      "copy-4",
      "copy-5",
    ]);
    expect(source).toEqual(before);
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [source];
    const original = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [source, copied])),
    ).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(original);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("axis and sparse-state restore retain new flags with exact Undo/Redo", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [{ ...legacyShapeDrawing(), hidden: true, shapeFlipX: true }];
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1, 2)),
    ).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(sheet.drawings![0]).toMatchObject({ hidden: true, shapeFlipX: true });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    const command = createRestoreSheetStateCommand(sheet.id, createSheetSparseState(sheet));
    sheet.drawings = [];
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("protected locked source refusal is atomic for root/nested visibility and flips, regardless of incoming unlock claims", () => {
    for (const drawing of [
      framedShapeDrawing(),
      { ...framedShapeDrawing(), kind: "textBox" as const },
      owner(),
    ]) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [drawing];
      sheet.properties.protected = true;
      sheet.protection = { editableRanges: [] };
      const before = serializeWorkbook(session.workbook);
      for (const key of ["hidden", "shapeFlipX", "shapeFlipY"] as const) {
        const changed = normalizeSheetDrawing(drawing);
        if (changed.kind === "shapeGroup") {
          if (key === "hidden") delete changed.hidden;
          else Object.defineProperty(changed.members[1]!, key, { value: false });
        } else Object.defineProperty(changed, key, { value: true, enumerable: true });
        for (const claim of [false, true]) {
          const input = {
            ...changed,
            ...(claim ? { shapeProperties: { locked: false as const } } : {}),
          };
          expect(canEditSheetDrawingCollection(sheet, [input])).toBe(false);
          expect(() =>
            executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [input])),
          ).toThrow(/protected/);
          expect(serializeWorkbook(session.workbook)).toEqual(before);
          expect(session.history.undoStack).toHaveLength(0);
        }
      }
    }
  });
});
