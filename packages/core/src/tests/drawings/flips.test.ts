import { describe, expect, test } from "vitest";
import {
  normalizeSheetDrawing,
  requireLegacySheetDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "../../sheet-drawings.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { createInsertSheetAxisCommand } from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { getActiveSheet, setCellContent } from "../../workbook.js";
import { framedCellImage } from "../cell-picture-frame/fixture.js";
import { createTestWorkbookSession } from "../helpers.js";

const flipFields = ["shapeFlipX", "shapeFlipY"] as const;
function legacy(): SheetGraphicDrawing {
  return {
    id: "shape",
    kind: "shape",
    name: "Synthetic triangle",
    anchor: { row: 3, column: 2 },
    offsetX: 12,
    offsetY: 8,
    width: 180,
    height: 90,
    text: "Label",
    shape: "triangle",
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
function standard(): SheetGraphicDrawing {
  return { ...legacy(), shapeGeometry: { preset: "rtTriangle" } };
}

describe("standard shape flips", () => {
  test.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const)("preserves quadrant X=%s Y=%s with exact command history and snapshots", (x, y) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [legacy()];
    const before = serializeWorkbook(session.workbook),
      input: SheetGraphicDrawing = {
        ...standard(),
        ...(x ? { shapeFlipX: true } : {}),
        ...(y ? { shapeFlipY: true } : {}),
      },
      expected = structuredClone(input),
      command = createSetSheetDrawingsCommand(sheet.id, [input]);
    delete input.shapeFlipX;
    delete input.shapeFlipY;
    input.anchor.row = 99;
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.drawings).toEqual([expected]);
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(session.workbook),
      sheetSnapshot = serializeSheet(sheet);
    expect(after.version).toBe(x || y ? 56 : 54);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(serializeSheet(deserializeSheet(sheetSnapshot))).toEqual(sheetSnapshot);
    delete (command.drawings[0] as SheetGraphicDrawing).shapeFlipX;
    delete (command.drawings[0] as SheetGraphicDrawing).shapeFlipY;
    requireLegacySheetDrawing(command.drawings[0]!).anchor.row = 88;
    expect(sheet.drawings).toEqual([expected]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("false values canonicalize away and do not create history or upgrade older features", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      defaults = { ...standard(), shapeFlipX: false, shapeFlipY: false } as unknown as SheetDrawing;
    expect(normalizeSheetDrawing(defaults)).toEqual(standard());
    sheet.drawings = [normalizeSheetDrawing(standard())];
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [defaults])),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(session.workbook).version).toBe(54);
    expect(serializeSheet(sheet).drawings?.[0]).not.toHaveProperty("shapeFlipX");
    expect(serializeSheet(sheet).drawings?.[0]).not.toHaveProperty("shapeFlipY");
    sheet.drawings = [legacy()];
    expect(serializeWorkbook(session.workbook).version).toBe(43);
    sheet.drawings = [
      {
        ...standard(),
        shapeGeometry: { preset: "bentConnector3" },
        shapeLineEnds: { begin: { kind: "triangle" } },
      },
    ];
    expect(serializeWorkbook(session.workbook).version).toBe(55);
  });

  test.each(flipFields)("strictly validates %s without reading accessors", (field) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [standard()];
    const before = serializeWorkbook(session.workbook);
    for (const invalid of [undefined, null, 0, 1, "true", {}, []]) {
      const input = { ...standard(), [field]: invalid } as SheetDrawing;
      expect(() => normalizeSheetDrawing(input)).toThrow(/booleans/);
      expect(() => createSetSheetDrawingsCommand(sheet.id, [input])).toThrow();
      expect(() => deserializeSheet({ ...serializeSheet(sheet), drawings: [input] })).toThrow();
      expect(() =>
        deserializeWorkbook({
          ...before,
          version: 56,
          sheets: [{ ...before.sheets[0], drawings: [input] }],
        }),
      ).toThrow();
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history.undoStack).toHaveLength(0);
    }
    let reads = 0;
    const input = standard();
    Object.defineProperty(input, field, {
      enumerable: true,
      get() {
        reads++;
        return true;
      },
    });
    expect(() => normalizeSheetDrawing(input)).toThrow(/accessors/);
    expect(() => createSetSheetDrawingsCommand(sheet.id, [input])).toThrow(/accessors/);
    expect(() => deserializeSheet({ ...serializeSheet(sheet), drawings: [input] })).toThrow(
      /accessors/,
    );
    expect(() =>
      deserializeWorkbook({
        ...before,
        version: 56,
        sheets: [{ ...before.sheets[0], drawings: [input] }],
      }),
    ).toThrow(/accessors/);
    for (const version of [43, 54, 55])
      expect(() =>
        deserializeWorkbook({
          ...before,
          version,
          sheets: [{ ...before.sheets[0], drawings: [input] }],
        }),
      ).toThrow(/version 56/);
    expect(reads).toBe(0);
    const setter = standard();
    Object.defineProperty(setter, field, {
      set() {
        reads++;
      },
    });
    expect(() => normalizeSheetDrawing(setter)).toThrow(/accessors/);
    expect(reads).toBe(0);
  });

  test.each(flipFields)("requires own %s data and supports nonenumerable true data", (field) => {
    let reads = 0;
    const inherited = Object.create({
      get [field]() {
        reads++;
        return true;
      },
    }) as SheetGraphicDrawing;
    Object.assign(inherited, standard());
    expect(() => normalizeSheetDrawing(inherited)).toThrow(/own data/);
    expect(reads).toBe(0);
    const input = standard();
    Object.defineProperty(input, field, { value: true });
    expect(normalizeSheetDrawing(input)).toEqual({ ...standard(), [field]: true });
  });

  test.each(flipFields)("rejects %s on unrelated graphic kinds, including false", (field) => {
    for (const value of [true, false])
      for (const kind of ["wordArt", "icon", "equation"] as const)
        expect(() =>
          normalizeSheetDrawing({ ...legacy(), kind, [field]: value } as SheetDrawing),
        ).toThrow(/shapes or text boxes/);
  });

  test.each([43, 54, 55])(
    "protocol %s rejects flip presence before canonicalization",
    (version) => {
      const session = createTestWorkbookSession(),
        snapshot = serializeWorkbook(session.workbook);
      for (const field of flipFields)
        for (const value of [true, false, undefined])
          expect(() =>
            deserializeWorkbook({
              ...snapshot,
              version,
              sheets: [{ ...snapshot.sheets[0], drawings: [{ ...standard(), [field]: value }] }],
            }),
          ).toThrow(/version 56/);
    },
  );

  test("sheet inference retains flipped connector ends, vertical text, rich text and cell frames", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "literal",
        value: "aΩ",
        fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Serif" }],
      },
    );
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "image", image: framedCellImage() });
    sheet.drawings = [
      {
        ...standard(),
        shapeGeometry: { preset: "bentConnector3" },
        shapeLineEnds: { begin: { kind: "triangle" }, end: { kind: "open" } },
        shapeFlipX: true,
        shapeFlipY: true,
      },
      { ...legacy(), id: "vertical", kind: "textBox", textDirection: "vertical" },
    ];
    const snapshot = serializeWorkbook(session.workbook),
      sheetSnapshot = serializeSheet(sheet);
    expect(snapshot.version).toBe(56);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(sheetSnapshot))).toEqual(sheetSnapshot);
    for (const drawing of sheet.drawings)
      if (drawing.kind === "shape") {
        delete drawing.shapeFlipX;
        delete drawing.shapeFlipY;
      }
    expect(serializeWorkbook(session.workbook).version).toBe(55);
    expect(snapshot.sheets[0]!.drawings?.[0]).toMatchObject({ shapeFlipX: true, shapeFlipY: true });
  });

  test("structure command history preserves flips with geometry and placement", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [{ ...standard(), shapeFlipX: true, shapeFlipY: true }];
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1, 2)),
    ).toBe(true);
    expect(sheet.drawings?.[0]).toMatchObject({
      anchor: { row: 5 },
      shapeFlipX: true,
      shapeFlipY: true,
    });
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });
});
