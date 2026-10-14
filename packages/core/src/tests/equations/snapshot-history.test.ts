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
  type WorkbookSnapshotV75,
} from "../../serialization.js";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "../../sheet-drawings.js";
import {
  createSheet,
  createSheetSparseState,
  createWorkbook,
  getActiveSheet,
  getSheetMetadata,
  insertSheet,
  setSheetMetadata,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { equationDocument, equationDrawing, equationFactory } from "./fixtures.js";

function raw(drawing: unknown, version = 75) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "owner" }));
  const result = {
    ...snapshot,
    version,
    sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}

function reverseRecords(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseRecords);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reverseRecords(item)]),
  );
}

function mutate(drawing: SheetGraphicDrawing) {
  drawing.equationDocument!.body.children = [];
}

describe("equation document snapshots and reversible commands", () => {
  test("V75 is conditional and explicit documents roundtrip workbook and standalone sheet", () => {
    expectTypeOf<WorkbookSnapshotV75>().toExtend<WorkbookSnapshot>();
    const workbook = deserializeWorkbook(raw(equationDrawing())),
      saved = serializeWorkbook(workbook);
    expect(saved.version).toBe(75);
    expect(saved.sheets[0]!.drawings).toEqual([equationDrawing()]);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    const sheet = getActiveSheet(workbook);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    const snapshotDrawing = saved.sheets[0]!.drawings![0] as SheetGraphicDrawing;
    expect(snapshotDrawing.equationDocument).not.toBe(
      (sheet.drawings![0] as SheetGraphicDrawing).equationDocument,
    );
    mutate(snapshotDrawing);
    expect((sheet.drawings![0] as SheetGraphicDrawing).equationDocument).toEqual(
      equationDocument(),
    );
  });

  test("legacy opaque equation source never migrates on read, write or normalization", () => {
    const { equationDocument: _document, ...legacy } = equationDrawing();
    legacy.text = "  \\frac{a}{b}\n\\unknown{exact}  ";
    const workbook = deserializeWorkbook(raw(legacy, 43));
    expect(serializeWorkbook(workbook).version).toBe(43);
    expect(serializeWorkbook(workbook).sheets[0]!.drawings).toEqual([legacy]);
    expect(normalizeSheetDrawing(legacy)).toEqual(legacy);
    expect(
      serializeSheet(deserializeSheet(serializeSheet(getActiveSheet(workbook)))).drawings,
    ).toEqual([legacy]);
    expect(serializeWorkbook(createWorkbook({ id: "empty", sheetId: "empty-sheet" })).version).toBe(
      43,
    );
  });

  test("new semantic slots roundtrip V75 and exact undo/redo without migrating older trees", () => {
    const { id, sequence, text } = equationFactory();
    const drawing = equationDrawing({
      kind: "equation-document-v1",
      body: sequence({
        id: id(),
        kind: "box",
        body: sequence({
          id: id(),
          kind: "script",
          base: sequence({
            id: id(),
            kind: "nary",
            operator: "oiint",
            limits: "auto",
            body: sequence({
              id: id(),
              kind: "accent",
              name: "underleftrightarrow",
              body: sequence(text("x")),
            }),
          }),
          presubscript: sequence(text("a")),
          presuperscript: sequence(text("b")),
        }),
      }),
    });
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing])),
    ).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(75);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("every V1–74 rejects new field presence before malformed/getter/inherited payload reads", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    const { equationDocument: _document, ...legacy } = equationDrawing();
    const inherited = Object.assign(
      Object.create(Object.defineProperty({}, "equationDocument", getter)),
      legacy,
    );
    for (let version = 1; version <= 74; version++)
      for (const drawing of [
        equationDrawing(),
        { ...equationDrawing(), equationDocument: undefined },
        Object.defineProperty({ ...legacy }, "equationDocument", getter),
        inherited,
      ])
        expect(() => deserializeWorkbook(raw(drawing, version))).toThrow(/version 75/);
    expect(reads).toBe(0);
    for (const drawing of [
      { ...equationDrawing(), text: "stale" },
      { ...equationDrawing(), equationDocument: undefined },
    ])
      expect(() => deserializeWorkbook(raw(drawing))).toThrow();
  });

  test("document, text and geometry edit together, commands/sparse state detach, and history is exact", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const before = serializeWorkbook(session.workbook);
    const input = equationDrawing(),
      expected = structuredClone(input);
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    mutate(input);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.drawings).toEqual([expected]);
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(session.workbook);
    mutate(command.drawings[0] as SheetGraphicDrawing);
    expect(sheet.drawings).toEqual([expected]);
    const metadata = getSheetMetadata(sheet),
      sparse = createSheetSparseState(sheet);
    mutate(metadata.drawings![0] as SheetGraphicDrawing);
    mutate(sparse.drawings![0] as SheetGraphicDrawing);
    expect(sheet.drawings).toEqual([expected]);
    setSheetMetadata(sheet, getSheetMetadata(sheet));
    expect(sheet.drawings).toEqual([expected]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("canonical key reordering is a no-op and stale forged edits reject atomically", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [normalizeSheetDrawing(equationDrawing())];
    const source = equationDrawing();
    const reordered = reverseRecords(source) as SheetGraphicDrawing;
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [reordered])),
    ).toBe(false);
    const before = serializeWorkbook(session.workbook),
      revision = session.history.revision;
    const forged = createSetSheetDrawingsCommand(sheet.id, [equationDrawing()]);
    mutate(forged.drawings[0] as SheetGraphicDrawing);
    expect(() => executeWorkbookCommand(session, forged)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
    expect(session.history.undoStack).toHaveLength(0);
    expect(() =>
      createSetSheetDrawingsCommand(sheet.id, [
        equationDrawing(),
        { ...equationDrawing(), id: "bad", text: "stale" },
      ]),
    ).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });

  test("dedicated atomic collection replacement accepts equations and is exactly undoable", () => {
    const session = createTestWorkbookSession(),
      first = getActiveSheet(session.workbook),
      second = createSheet("Second", "second");
    insertSheet(session.workbook, second);
    first.drawings = [normalizeSheetDrawing(equationDrawing())];
    const before = serializeWorkbook(session.workbook);
    const command = createReplaceSheetDrawingCollectionsCommand([
      { sheetId: first.id, expectedDrawings: first.drawings, drawings: [] },
      { sheetId: second.id, expectedDrawings: [], drawings: first.drawings },
    ]);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(first.drawings).toEqual([]);
    expect(second.drawings).toEqual([equationDrawing()]);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("failed second equation collection leaves both sheets and nonempty history unchanged", () => {
    const session = createTestWorkbookSession(),
      first = getActiveSheet(session.workbook),
      second = createSheet("Second", "second");
    insertSheet(session.workbook, second);
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(first.id, [equationDrawing()])),
    ).toBe(true);
    const replacement = createReplaceSheetDrawingCollectionsCommand([
      { sheetId: first.id, expectedDrawings: first.drawings!, drawings: [] },
      { sheetId: second.id, expectedDrawings: [], drawings: first.drawings! },
    ]);
    mutate(replacement.collections[1].drawings[0] as SheetGraphicDrawing);
    const before = serializeWorkbook(session.workbook),
      revision = session.history.revision,
      undoStack = [...session.history.undoStack],
      redoStack = [...session.history.redoStack];
    expect(() => executeWorkbookCommand(session, replacement)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
    expect(session.history.undoStack).toEqual(undoStack);
    expect(session.history.redoStack).toEqual(redoStack);
  });
});
