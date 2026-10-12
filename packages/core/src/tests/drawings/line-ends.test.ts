import { describe, expect, test } from "vitest";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "../../sheet-drawings.js";
import { normalizeShapeLineEnds } from "../../shape-line-ends.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { getActiveSheet } from "../../workbook.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";
const line: SheetGraphicDrawing = {
  id: "line",
  kind: "shape",
  name: "Line",
  anchor: { row: 0, column: 0 },
  offsetX: 8,
  offsetY: 8,
  width: 180,
  height: 90,
  text: "",
  shape: "line",
  shapeGeometry: { preset: "bentConnector3" },
  fill: "transparent",
  stroke: "#000000",
  strokeWidth: 2,
  color: "#000000",
  fontSize: 12,
  bold: false,
  italic: false,
  rotation: 37,
};
describe("standard line endpoints", () => {
  test.each(["triangle", "open", "stealth", "diamond", "oval"] as const)(
    "clones %s sizes and precise command/snapshot history",
    (kind) => {
      const s = createTestWorkbookSession(),
        sheet = getActiveSheet(s.workbook);
      const input: SheetGraphicDrawing = {
        ...line,
        shapeLineEnds: { begin: { kind, width: "small" }, end: { kind, length: "large" } },
      };
      const cmd = createSetSheetDrawingsCommand(sheet.id, [input]);
      input.shapeLineEnds!.begin!.width = "large";
      expect(executeWorkbookCommand(s, cmd)).toBe(true);
      expect(sheet.drawings?.[0]).toMatchObject({
        shapeLineEnds: { begin: { kind, width: "small" }, end: { kind, length: "large" } },
      });
      const snapshot = serializeWorkbook(s.workbook);
      expect(snapshot.version).toBe(55);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(
        serializeSheet(sheet),
      );
      expect(undoWorkbookCommand(s)).toBe(true);
      expect(sheet.drawings ?? []).toEqual([]);
      expect(redoWorkbookCommand(s)).toBe(true);
      expect(serializeWorkbook(s.workbook)).toEqual(snapshot);
    },
  );
  test("defaults stay sparse and plain standard lines still use54", () => {
    expect(normalizeShapeLineEnds({})).toBeUndefined();
    expect(
      normalizeShapeLineEnds({ end: { kind: "triangle", width: "medium", length: "medium" } }),
    ).toEqual({ end: { kind: "triangle" } });
    const s = createTestWorkbookSession();
    getActiveSheet(s.workbook).drawings = [line];
    expect(serializeWorkbook(s.workbook).version).toBe(54);
  });
  test.each([
    null,
    [],
    { end: { kind: "unknown" } },
    { end: { kind: "triangle", width: "huge" } },
    { end: { kind: "triangle", length: 2 } },
    { extra: true },
    { end: { kind: "triangle", source: "url" } },
  ])("rejects malformed endpoint record %#", (value) =>
    expect(() => normalizeShapeLineEnds(value)).toThrow(),
  );
  test("does not read accessors or attach line ends to closed/legacy/nonshape objects", () => {
    let reads = 0;
    const ends = {
      get end() {
        reads++;
        return { kind: "triangle" };
      },
    };
    expect(() => normalizeShapeLineEnds(ends)).toThrow(/accessor/);
    expect(reads).toBe(0);
    for (const other of [
      { ...line, shapeGeometry: undefined },
      { ...line, shapeGeometry: { preset: "rect" as const } },
      { ...line, kind: "textBox" as const },
    ])
      expect(() =>
        normalizeSheetDrawing({ ...other, shapeLineEnds: { end: { kind: "triangle" } } }),
      ).toThrow();
  });
  test.each([43, 53, 54])("old protocol%d refuses explicit line ends", (version) => {
    const s = createTestWorkbookSession();
    getActiveSheet(s.workbook).drawings = [
      { ...line, shapeLineEnds: { end: { kind: "triangle" } } },
    ];
    expect(() => deserializeWorkbook({ ...serializeWorkbook(s.workbook), version })).toThrow(
      /version 55/,
    );
  });
});

test("vertical text boxes opt in without migrating legacy text or shape geometry", () => {
  const s = createTestWorkbookSession(),
    sheet = getActiveSheet(s.workbook);
  const { shapeGeometry: _shapeGeometry, ...base } = line;
  const input: SheetGraphicDrawing = {
    ...base,
    kind: "textBox",
    textDirection: "vertical",
    text: "中文\nAB",
  };
  sheet.drawings = [normalizeSheetDrawing(input)];
  const snapshot = serializeWorkbook(s.workbook);
  expect(snapshot.version).toBe(55);
  expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
  expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
  expect(() => deserializeWorkbook({ ...snapshot, version: 54 })).toThrow(/version 55/);
  const { textDirection: _textDirection, ...legacy } = input;
  sheet.drawings = [legacy];
  expect(serializeWorkbook(s.workbook).version).toBe(43);
  expect(() => normalizeSheetDrawing({ ...line, textDirection: "vertical" })).toThrow();
});
