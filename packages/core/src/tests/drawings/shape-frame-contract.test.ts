import { describe, expect, test } from "vitest";
import {
  normalizeSheetDrawing,
  normalizeSheetDrawings,
  requireLegacySheetDrawing,
  type SheetDrawing,
} from "../../sheet-drawings.js";
import {
  normalizeShapeObjectProperties,
  getShapeObjectProperties,
} from "../../shape-object-properties.js";
import {
  deserializeWorkbook,
  deserializeSheet,
  serializeWorkbook,
  serializeSheet,
} from "../../serialization.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedShapeDrawing } from "./shape-frame-fixture.js";
import { textDrawing } from "./shape-text-fixture.js";

describe("source-free canonical shape contract", () => {
  test("frame is the only placement source and appearance remains deep-owned", () => {
    const input = framedShapeDrawing();
    input.shapeProperties = {
      locked: false,
      lockAspectRatio: true,
      altTitle: "Title",
      altDescription: "Description",
    };
    const result = normalizeSheetDrawing(input);
    expect(result).toEqual(input);
    expect("anchor" in result || "width" in result || "height" in result).toBe(false);
    if (result.shapeFrame.anchor.mode === "move-and-size")
      result.shapeFrame.anchor.start.row.index = 99;
    result.shapeText!.layout.marginsPt.topPt = 99;
    result.shapeProperties!.altTitle = "Other";
    expect(input.shapeProperties.altTitle).toBe("Title");
    expect(input.shapeText!.layout.marginsPt.topPt).not.toBe(99);
    expect(() => requireLegacySheetDrawing(input)).toThrow(/canonical shape frames/);
  });
  test.each(["anchor", "offsetX", "offsetY", "width", "height", "frame", "source"])(
    "rejects conflicting legacy or picture placement field %s",
    (field) => {
      expect(() =>
        normalizeSheetDrawing({ ...framedShapeDrawing(), [field]: 1 } as SheetDrawing),
      ).toThrow(/conflicting/);
    },
  );
  test("rejects unknown/accessor/inherited placement before evaluating getters", () => {
    let reads = 0;
    const input = framedShapeDrawing();
    Object.defineProperty(input, "shapeFrame", {
      enumerable: true,
      get() {
        reads++;
        return null;
      },
    });
    expect(() => normalizeSheetDrawing(input)).toThrow(/data fields/);
    expect(reads).toBe(0);
    expect(() =>
      normalizeSheetDrawing(
        Object.assign(
          Object.create({ shapeFrame: framedShapeDrawing().shapeFrame }),
          textDrawing(),
        ) as SheetDrawing,
      ),
    ).toThrow(/ordinary/);
  });
  test("legacy objects keep their existing placement and cannot carry orphan properties", () => {
    const legacy = textDrawing();
    expect(normalizeSheetDrawing(legacy)).toEqual(legacy);
    expect(() => normalizeSheetDrawing({ ...legacy, shapeProperties: {} } as SheetDrawing)).toThrow(
      /canonical shape frame/,
    );
    expect(() => normalizeSheetDrawings([framedShapeDrawing(), framedShapeDrawing()])).toThrow(
      /Duplicate/,
    );
  });
  test("properties are sparse, safe and device-path independent", () => {
    expect(
      normalizeShapeObjectProperties({
        locked: true,
        printObject: true,
        lockAspectRatio: false,
        altTitle: "",
        altDescription: "",
      }),
    ).toBeUndefined();
    expect(getShapeObjectProperties()).toEqual({
      locked: true,
      printObject: true,
      lockAspectRatio: false,
      altTitle: "",
      altDescription: "",
    });
    expect(
      normalizeShapeObjectProperties({ locked: false, printObject: false, lockAspectRatio: true }),
    ).toEqual({ locked: false, printObject: false, lockAspectRatio: true });
    for (const input of [
      { locked: 0 },
      { altTitle: null },
      { altDescription: "x".repeat(32769) },
      { unknown: true },
      Object.create({ locked: false }),
    ])
      expect(() => normalizeShapeObjectProperties(input)).toThrow();
    let reads = 0;
    expect(() =>
      normalizeShapeObjectProperties({
        get locked() {
          reads++;
          return false;
        },
      }),
    ).toThrow(/accessors/);
    expect(reads).toBe(0);
  });
  test("version60 preserves frame and properties, older protocols reject even orphan presence", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [textDrawing()];
    expect(serializeWorkbook(session.workbook).version).toBe(59);
    sheet.drawings = [framedShapeDrawing()];
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(60);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const { dateSystem, ...withoutDateSystem } = snapshot;
    for (let version = 1; version < 60; version++)
      expect(() =>
        deserializeWorkbook({
          ...withoutDateSystem,
          ...(version >= 3 ? { dateSystem } : {}),
          version,
        }),
      ).toThrow(/version 60/);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    expect(() =>
      deserializeWorkbook({
        ...snapshot,
        version: 59,
        sheets: [{ ...snapshot.sheets[0], drawings: [{ ...textDrawing(), shapeProperties: {} }] }],
      }),
    ).toThrow(/version 60/);
  });
  test("one command and history restore exact authoritative placement and metadata", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [textDrawing()];
    const before = serializeWorkbook(session.workbook);
    const input = framedShapeDrawing();
    input.shapeProperties = { altDescription: "Test", printObject: false };
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.shapeProperties.altDescription = "Mutated";
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(executeWorkbookCommand(session, command)).toBe(false);
  });
});

test("drawing collections reject custom methods, sparse entries and accessors before normalization", () => {
  const custom = [framedShapeDrawing()];
  custom.map = (() => []) as typeof custom.map;
  expect(() => normalizeSheetDrawings(custom)).toThrow();
  const sparse: SheetDrawing[] = [];
  sparse.length = 1;
  expect(() => normalizeSheetDrawings(sparse)).toThrow();
  const accessor = [framedShapeDrawing()];
  Object.defineProperty(accessor, "0", { get: () => framedShapeDrawing() });
  expect(() => normalizeSheetDrawings(accessor)).toThrow();
});
