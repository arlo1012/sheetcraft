import { describe, expect, expectTypeOf, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV66,
} from "../../serialization.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { createRestoreSheetStateCommand } from "../../commands/structure.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createSheetSparseState, getActiveSheet } from "../../workbook.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import {
  collectShapeGroupAssetIds,
  traverseShapeGroup,
  type ShapeGroupDrawing,
} from "../../shape-group.js";
import type { SheetGraphicDrawing } from "../../sheet-drawings.js";
import { createTestWorkbookSession } from "../helpers.js";
import { shapeText } from "./shape-text-fixture.js";
import { legacyShapeDrawing, textureShapeStyle } from "./shape-style-fixture.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";

function attributed(): SheetGraphicDrawing {
  return {
    ...legacyShapeDrawing(),
    text: "alpha beta",
    shapeText: {
      ...shapeText(),
      characterRuns: [
        {
          start: 0,
          end: 6,
          fontFamily: "Exact",
          fontSize: 20.5,
          bold: false,
          italic: true,
          underline: false,
          strike: true,
          color: "#abcdef",
        },
      ],
    },
  };
}
function tree(): ShapeGroupDrawing {
  const inner = nested();
  inner.members = [{ ...leaf("rich"), text: attributed().text, shapeText: attributed().shapeText }];
  return { ...group(), members: [inner, leaf("plain")] };
}
function richLeaf(root: ShapeGroupDrawing) {
  const result = traverseShapeGroup(root).find(({ node }) => node.id === "rich")!.node;
  if (result.kind !== "shape" && result.kind !== "textBox") throw Error("Expected leaf");
  return result;
}

describe("conditional V66 attributed shape internal persistence", () => {
  test("public V66 root and deeply owned text-box/shape ranges roundtrip without aliases", () => {
    expectTypeOf<WorkbookSnapshotV66>().toExtend<WorkbookSnapshot>();
    for (const drawing of [attributed(), { ...attributed(), kind: "textBox" as const }, tree()]) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [drawing];
      const snapshot = serializeWorkbook(session.workbook);
      expect(snapshot.version).toBe(66);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      const standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      const saved = snapshot.sheets[0]!.drawings![0]!;
      const target = saved.kind === "shapeGroup" ? richLeaf(saved) : (saved as SheetGraphicDrawing);
      const original = drawing.kind === "shapeGroup" ? richLeaf(drawing) : drawing;
      expect(target.shapeText!.characterRuns).not.toBe(original.shapeText!.characterRuns);
      expect(target.shapeText!.characterRuns![0]).not.toBe(original.shapeText!.characterRuns![0]);
      target.shapeText!.characterRuns![0]!.fontSize = 99;
      expect(original.shapeText!.characterRuns![0]!.fontSize).toBe(20.5);
    }
  });

  test("V59..65 reject own empty/undefined/inherited/accessor presence before reading run getters", () => {
    const base = serializeWorkbook(createTestWorkbookSession().workbook);
    let reads = 0;
    const accessor = Object.defineProperty(shapeText(), "characterRuns", {
      get() {
        reads++;
        return [];
      },
    });
    const inherited = Object.assign(
      Object.create({
        get characterRuns() {
          reads++;
          return [];
        },
      }),
      shapeText(),
    );
    for (const model of [
      { ...shapeText(), characterRuns: [] },
      { ...shapeText(), characterRuns: undefined },
      accessor,
      inherited,
    ])
      for (const owned of [false, true]) {
        const drawing = owned ? tree() : attributed();
        if (drawing.kind === "shapeGroup") richLeaf(drawing).shapeText = model;
        else drawing.shapeText = model;
        for (let version = owned ? 61 : 59; version <= 65; version++)
          expect(() =>
            deserializeWorkbook({
              ...base,
              version,
              sheets: [{ ...base.sheets[0]!, drawings: [drawing] }],
            }),
          ).toThrow(/version 66/);
        const newest = {
          ...base,
          version: 66,
          sheets: [{ ...base.sheets[0]!, drawings: [drawing] }],
        };
        const field = Object.getOwnPropertyDescriptor(model, "characterRuns");
        if (field && "value" in field && Array.isArray(field.value))
          expect(serializeWorkbook(deserializeWorkbook(newest)).version).toBe(owned ? 61 : 59);
        else expect(() => deserializeWorkbook(newest)).toThrow();
      }
    expect(reads).toBe(0);
  });

  test("empty canonical lists remove V66 while preserving existing uniform/group and mixed feature minima", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    for (const owned of [false, true]) {
      const drawing = owned ? tree() : attributed();
      const target = drawing.kind === "shapeGroup" ? richLeaf(drawing) : drawing;
      target.shapeText!.characterRuns = [];
      sheet.drawings = [drawing];
      expect(serializeWorkbook(session.workbook).version).toBe(owned ? 61 : 59);
      delete target.shapeText!.characterRuns;
      expect(serializeWorkbook(session.workbook).version).toBe(owned ? 61 : 59);
    }
    const effects = {
      ...group("effects"),
      groupEffects: { glow: { kind: "none" as const } },
      hidden: true as const,
    };
    for (const drawings of [
      [tree(), effects, legacyShapeDrawing()],
      [legacyShapeDrawing(), effects, tree()],
    ]) {
      sheet.drawings = drawings;
      const raw = serializeSheet(sheet);
      expect(serializeWorkbook(session.workbook).version).toBe(66);
      expect(serializeSheet(deserializeSheet(raw))).toEqual(raw);
    }
    sheet.drawings = [effects];
    expect(serializeWorkbook(session.workbook).version).toBe(65);
    sheet.drawings = [legacyShapeDrawing()];
    expect(serializeWorkbook(session.workbook).version).toBe(43);
  });

  test("nested offsets validate actual leaf text and descriptor-safe malformed owner graphs fail", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const drawing = tree();
    richLeaf(drawing).text = "x";
    const base = serializeWorkbook(session.workbook);
    expect(() =>
      deserializeWorkbook({
        ...base,
        version: 66,
        sheets: [{ ...base.sheets[0]!, drawings: [drawing] }],
      }),
    ).toThrow();
    expect(() => deserializeSheet({ ...serializeSheet(sheet), drawings: [drawing] })).toThrow();
    const cyclic = tree();
    cyclic.members.push(cyclic as never);
    expect(() =>
      deserializeWorkbook({
        ...base,
        version: 66,
        sheets: [{ ...base.sheets[0]!, drawings: [cyclic] }],
      }),
    ).toThrow();
    let reads = 0;
    const accessor = tree();
    Object.defineProperty(richLeaf(accessor), "shapeText", {
      get() {
        reads++;
        return shapeText();
      },
    });
    expect(() =>
      deserializeWorkbook({
        ...base,
        version: 66,
        sheets: [{ ...base.sheets[0]!, drawings: [accessor] }],
      }),
    ).toThrow();
    expect(reads).toBe(0);
  });

  test("one same-text style command, inverse, redo, clipboard and sparse restore independently detach nested metadata", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [tree()];
    const before = serializeWorkbook(session.workbook);
    const input = tree();
    richLeaf(input).shapeText!.characterRuns![0]!.bold = true;
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    richLeaf(input).shapeText!.characterRuns![0]!.color = "#000000";
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(session.workbook);
    richLeaf(command.drawings[0] as ShapeGroupDrawing).shapeText!.characterRuns![0]!.fontSize = 111;
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    let id = 0;
    const copied = cloneShapeRootsForClipboard(sheet.drawings!, {
      createId: () => `copy-${++id}`,
    })[0] as ShapeGroupDrawing;
    const copiedLeaf = traverseShapeGroup(copied).find(
      ({ node }) =>
        (node.kind === "shape" || node.kind === "textBox") && node.shapeText?.characterRuns,
    )?.node;
    if (!copiedLeaf || (copiedLeaf.kind !== "shape" && copiedLeaf.kind !== "textBox"))
      throw Error("Expected copied attributed leaf");
    copiedLeaf.shapeText!.characterRuns![0]!.italic = false;
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    const sparse = createSheetSparseState(sheet),
      restore = createRestoreSheetStateCommand(sheet.id, sparse);
    richLeaf(sparse.drawings![0] as ShapeGroupDrawing).shapeText!.characterRuns![0]!.strike = false;
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, []))).toBe(true);
    expect(executeWorkbookCommand(session, restore)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("asset collection validates rich leaf text while preserving existing glyph texture references", () => {
    const drawing = tree();
    richLeaf(drawing).shapeText!.style = textureShapeStyle("glyph-fill", "glyph-line");
    expect([...collectShapeGroupAssetIds(drawing)]).toEqual(["glyph-fill", "glyph-line"]);
  });
});
