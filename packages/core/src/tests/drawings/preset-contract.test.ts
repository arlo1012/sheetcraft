import { describe, expect, test } from "vitest";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "../../sheet-drawings.js";
import { SHAPE_PRESET_NAMES } from "../../shape-presets/catalog.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { getActiveSheet, setCellContent } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedCellImage } from "../cell-picture-frame/fixture.js";

function drawing(): SheetGraphicDrawing {
  return {
    id: "shape",
    kind: "shape",
    name: "Synthetic shape",
    anchor: { row: 3, column: 2 },
    offsetX: 12,
    offsetY: 8,
    width: 180,
    height: 90,
    text: "Label",
    shape: "rectangle",
    fill: "#abcdef",
    stroke: "#000000",
    strokeWidth: 2,
    color: "#123456",
    fontSize: 14,
    bold: false,
    italic: true,
    rotation: 37,
  };
}
function preset(): SheetGraphicDrawing {
  return { ...drawing(), shapeGeometry: { preset: "roundRect", adjustments: { adj: 30000 } } };
}

describe("explicit standard drawing geometry", () => {
  test.each([
    "rectangle",
    "roundedRectangle",
    "ellipse",
    "triangle",
    "diamond",
    "arrow",
    "line",
    "star",
    "heart",
  ] as const)("legacy %s remains unchanged and does not infer standard geometry", (shape) => {
    const original = { ...drawing(), shape };
    expect(normalizeSheetDrawing(original)).toEqual(original);
    const session = createTestWorkbookSession();
    getActiveSheet(session.workbook).drawings = [original];
    expect(serializeWorkbook(session.workbook).version).toBe(43);
  });
  test("explicit standard rectangle is retained, not collapsed into legacy rectangle", () => {
    expect(
      normalizeSheetDrawing({ ...drawing(), shapeGeometry: { preset: "rect" } }),
    ).toMatchObject({ shapeGeometry: { preset: "rect" } });
  });
  test("all declared standard identities are accepted without copying a UI gallery", () => {
    expect(SHAPE_PRESET_NAMES).toHaveLength(187);
    for (const name of SHAPE_PRESET_NAMES) {
      const normalized = normalizeSheetDrawing({ ...drawing(), shapeGeometry: { preset: name } });
      expect("shapeGeometry" in normalized && normalized.shapeGeometry?.preset).toBe(name);
    }
  });
  test("command/snapshot detach geometry parameters and preserve exact UndoRedo", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [drawing()];
    const before = structuredClone(sheet.drawings),
      input = preset();
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    (input.shapeGeometry!.adjustments as Record<string, number>).adj = 60000;
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const after = structuredClone(sheet.drawings);
    expect(sheet.drawings?.[0]).toMatchObject({
      shapeGeometry: { preset: "roundRect", adjustments: { adj: 30000 } },
    });
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual(after);
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(54);
    const restored = deserializeWorkbook(snapshot);
    expect(serializeWorkbook(restored)).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    (command.drawings[0] as SheetGraphicDrawing).shapeGeometry = { preset: "ellipse" };
    expect(sheet.drawings).toEqual(after);
  });
  test("snapshot feature inference takes the maximum over rich text, cell frames and preset drawings", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "literal", value: "aΩ", fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Serif" }] },
    );
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "image", image: framedCellImage() });
    sheet.drawings = [preset()];
    expect(serializeWorkbook(session.workbook).version).toBe(54);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    sheet.drawings = [drawing()];
    expect(serializeWorkbook(session.workbook).version).toBe(53);
  });
  test.each([1, 3, 24, 25, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53])(
    "version %s cannot silently discard a standard shape",
    (version) => {
      const session = createTestWorkbookSession();
      getActiveSheet(session.workbook).drawings = [preset()];
      const raw = serializeWorkbook(session.workbook),
        { dateSystem, ...old } = raw;
      expect(() =>
        deserializeWorkbook({ ...old, ...(version >= 3 ? { dateSystem } : {}), version }),
      ).toThrow(/version 54/);
    },
  );
  test.each(["textBox", "wordArt", "icon", "equation"] as const)(
    "a %s cannot carry the shape-only contract",
    (kind) => {
      expect(() => normalizeSheetDrawing({ ...preset(), kind })).toThrow(/Only a shape/);
    },
  );
  test.each([
    { preset: "unknown" },
    { preset: "roundRect", adjustments: { unknown: 1 } },
    { preset: "roundRect", adjustments: { adj: NaN } },
    { preset: "roundRect", adjustments: { adj: Infinity } },
    { preset: "roundRect", adjustments: { adj: 2147483648 } },
    { preset: "ellipse", source: "external" },
    null,
  ])("invalid parameters are rejected before any document edit ($preset)", (value) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [drawing()];
    expect(() =>
      createSetSheetDrawingsCommand(sheet.id, [
        { ...preset(), shapeGeometry: value } as SheetGraphicDrawing,
      ]),
    ).toThrow();
    expect(sheet.drawings).toEqual([drawing()]);
    expect(session.history.undoStack).toHaveLength(0);
  });
  test("geometry accessors are never evaluated and old versions reject presence before parsing", () => {
    const original = drawing();
    let reads = 0;
    Object.defineProperty(original, "shapeGeometry", {
      enumerable: true,
      get() {
        reads++;
        return { preset: "ellipse" };
      },
    });
    expect(() => normalizeSheetDrawing(original)).toThrow(/accessor/);
    const session = createTestWorkbookSession(),
      raw = serializeWorkbook(session.workbook);
    raw.sheets[0]!.drawings = [original];
    expect(() => deserializeWorkbook({ ...raw, version: 53 })).toThrow(/version 54/);
    expect(() => deserializeWorkbook({ ...raw, version: 54 })).toThrow(/accessor/);
    expect(reads).toBe(0);
  });
  test("structure command inverse preserves new parameters without silently migrating old placement", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [preset()];
    const before = structuredClone(sheet.drawings);
    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1, 2));
    expect(sheet.drawings?.[0]).toMatchObject({
      anchor: { row: 5 },
      shapeGeometry: preset().shapeGeometry,
    });
    undoWorkbookCommand(session);
    expect(sheet.drawings).toEqual(before);
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", 3));
    expect(sheet.drawings).toEqual([]);
    undoWorkbookCommand(session);
    expect(sheet.drawings).toEqual(before);
  });
});
