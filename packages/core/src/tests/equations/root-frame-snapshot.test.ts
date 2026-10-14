import { describe, expect, expectTypeOf, test } from "vitest";
import {
  createReplaceSheetDrawingCollectionsCommand,
  createSetSheetDrawingsCommand,
} from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV76,
} from "../../serialization.js";
import { isFramedEquationDrawing, type SheetDrawing } from "../../sheet-drawings.js";
import {
  createSheet,
  createSheetSparseState,
  createWorkbook,
  getActiveSheet,
  getSheetMetadata,
  insertSheet,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";
import { equationDrawing } from "./fixtures.js";
import { framedEquationDrawing, opaqueEquationSource } from "./root-frame-fixtures.js";

function raw(drawing: unknown, version = 76) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "owner" }));
  const result = {
    ...snapshot,
    version,
    sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}

describe("canonical Equation conditional snapshot76 and history", () => {
  test.each([false, true])(
    "structured/opaque=%s roots alone require76 and roundtrip standalone sheets",
    (opaque) => {
      expectTypeOf<WorkbookSnapshotV76>().toExtend<WorkbookSnapshot>();
      const input = framedEquationDrawing(undefined, opaque);
      input.hidden = true;
      input.shapeProperties = { locked: false, printObject: false, altTitle: "Source" };
      const workbook = deserializeWorkbook(raw(input)),
        saved = serializeWorkbook(workbook);
      expect(saved.version).toBe(76);
      expect(saved.sheets[0]!.drawings).toEqual([input]);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      const sheet = getActiveSheet(workbook),
        standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      const restored = standalone.drawings![0]!;
      if (!isFramedEquationDrawing(restored)) throw new Error("Expected a canonical Equation.");
      expect(restored.shapeFrame).not.toBe(input.shapeFrame);
      if (opaque) expect(restored.text).toBe(opaqueEquationSource);
      else expect(restored.equationDocument).not.toBe(input.equationDocument);
    },
  );

  test("empty, raw legacy, structured75 and canonical body60 snapshots are unchanged", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      sheet = getActiveSheet(workbook);
    expect(serializeWorkbook(workbook).version).toBe(43);
    const { equationDocument: _document, ...opaque } = equationDrawing();
    opaque.text = opaqueEquationSource;
    sheet.drawings = [opaque];
    expect(serializeWorkbook(workbook).version).toBe(43);
    expect(serializeWorkbook(deserializeWorkbook(raw(opaque, 43))).sheets[0]!.drawings).toEqual([
      opaque,
    ]);
    sheet.drawings = [equationDrawing()];
    expect(serializeWorkbook(workbook).version).toBe(75);
    expect(serializeWorkbook(deserializeWorkbook(raw(equationDrawing(), 75))).version).toBe(75);
    sheet.drawings = [framedShapeDrawing()];
    expect(serializeWorkbook(workbook).version).toBe(60);
  });

  test("every V1–75 rejects raw/structured and malformed/getter/inherited frame or property presence before reads", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    const input = framedEquationDrawing(),
      opaque = framedEquationDrawing(undefined, true);
    const { shapeFrame: _frame, ...withoutFrame } = opaque;
    const inherited = Object.assign(
      Object.create(Object.defineProperty({}, "shapeFrame", getter)),
      withoutFrame,
    );
    const choices = [
      input,
      opaque,
      { ...opaque, shapeFrame: undefined },
      Object.defineProperty({ ...opaque }, "shapeFrame", getter),
      inherited,
      { ...withoutFrame, shapeProperties: undefined },
      Object.defineProperty({ ...withoutFrame }, "shapeProperties", getter),
    ];
    for (let version = 1; version <= 75; version++)
      for (const drawing of choices)
        expect(() => deserializeWorkbook(raw(drawing, version))).toThrow(/version 76/);
    expect(reads).toBe(0);
    for (const drawing of choices.slice(2))
      expect(() => deserializeWorkbook(raw(drawing))).toThrow();
    expect(reads).toBe(0);
    for (const drawing of [
      { ...input, text: "stale" },
      { ...input, shapeStyle: {} },
      { ...input, equationDocument: undefined },
    ])
      expect(() => deserializeWorkbook(raw(drawing))).toThrow();
  });

  test("mixed legacy and structured roots infer76 last in workbook and standalone sheet", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      sheet = getActiveSheet(workbook);
    sheet.drawings = [
      { ...framedEquationDrawing(undefined, true), id: "raw-frame" },
      { ...equationDrawing(), id: "legacy-document" },
      { ...framedShapeDrawing(), id: "body-frame" },
    ];
    const before = serializeSheet(sheet);
    expect(serializeSheet(deserializeSheet(before))).toEqual(before);
    expect(serializeWorkbook(workbook).version).toBe(76);
    expect(serializeWorkbook(deserializeWorkbook(serializeWorkbook(workbook)))).toEqual(
      serializeWorkbook(workbook),
    );
  });

  test("commands, sparse state, metadata and snapshots detach canonical source and preserve exact undo/redo", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const before = serializeWorkbook(session.workbook),
      input = framedEquationDrawing(),
      expected = structuredClone(input);
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.equationDocument!.body.children = [];
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.drawings).toEqual([expected]);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(76);
    for (const values of [
      command.drawings,
      createSheetSparseState(sheet).drawings!,
      getSheetMetadata(sheet).drawings!,
      after.sheets[0]!.drawings!,
    ]) {
      const clone = values[0]!;
      expect(isFramedEquationDrawing(clone)).toBe(true);
      if (!isFramedEquationDrawing(clone)) throw Error("Expected Equation frame");
      clone.equationDocument!.body.children = [];
      if (clone.shapeFrame.anchor.mode === "move-only")
        clone.shapeFrame.anchor.origin.row.index = 40;
      expect(sheet.drawings).toEqual([expected]);
    }
    const unchanged = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(unchanged);
  });

  test("generic cross-sheet replacement moves a canonical raw root with exact reversible collection history", () => {
    const session = createTestWorkbookSession(),
      first = getActiveSheet(session.workbook),
      second = createSheet("Second", "second");
    insertSheet(session.workbook, second);
    const input = framedEquationDrawing(undefined, true);
    first.drawings = [input];
    const before = serializeWorkbook(session.workbook);
    const command = createReplaceSheetDrawingCollectionsCommand([
      { sheetId: first.id, expectedDrawings: first.drawings, drawings: [] },
      { sheetId: second.id, expectedDrawings: [], drawings: [input] },
    ]);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(first.drawings).toEqual([]);
    expect(second.drawings).toEqual([input]);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("forged source mismatch and invalid batch admission leave state and history unchanged", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetSheetDrawingsCommand(sheet.id, [framedEquationDrawing()]),
    );
    const forged = createSetSheetDrawingsCommand(sheet.id, [framedEquationDrawing()]);
    if (!isFramedEquationDrawing(forged.drawings[0]!)) throw Error("Expected Equation frame");
    forged.drawings[0]!.text = "stale";
    const before = serializeWorkbook(session.workbook),
      history = structuredClone(session.history);
    expect(() => executeWorkbookCommand(session, forged)).toThrow();
    expect(() =>
      createSetSheetDrawingsCommand(sheet.id, [
        framedEquationDrawing(),
        { ...framedEquationDrawing(), id: "bad", text: "stale" } as SheetDrawing,
      ]),
    ).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history).toEqual(history);
  });
});
