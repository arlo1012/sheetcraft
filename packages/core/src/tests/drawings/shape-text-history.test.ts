import { describe, expect, test } from "vitest";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { createDeleteCellsCommand, createInsertCellsCommand } from "../../commands/cell-shift.js";
import {
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  createRestoreSheetStateCommand,
} from "../../commands/structure.js";
import { createPasteCellContentsCommand } from "../../commands/values.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "../../sheet-drawings.js";
import type { ShapeText } from "../../shape-text.js";
import { serializeWorkbook } from "../../serialization.js";
import {
  createSheetSparseState,
  getActiveSheet,
  getCellContent,
  getSheetMetadata,
  setCellContent,
  setSheetMetadata,
  type SheetTable,
} from "../../workbook.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import { createCreateTableCommand, createRestoreTableTransactionCommand } from "../../tables.js";
import { createTestWorkbookSession } from "../helpers.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import { legacyShapeDrawing, textureShapeStyle } from "./shape-style-fixture.js";
import { shapeText, textDrawing } from "./shape-text-fixture.js";

function mutate(model: ShapeText) {
  model.layout.marginsPt.leftPt = 123;
  model.layout.direction = "stacked";
  model.paragraph.beforePt = 37;
  model.paragraph.lineSpacing = { kind: "exact", pt: 45 };
  if (model.style) model.style.fill = { kind: "none" };
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

describe("shape text transactions and history durability", () => {
  test("text, font, paragraph, glyph style and measured geometry are one exact reversible command", () => {
    for (const style of [fullStyle(), textureShapeStyle()]) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [legacyShapeDrawing()];
      const before = serializeWorkbook(session.workbook);
      const input = {
        ...textDrawing({ ...shapeText(), fontFamily: "Exact Local 😀", underline: true, style }),
        text: "New\ntext\n",
        fontSize: 25,
        bold: true,
        italic: false,
        height: 200,
      };
      input.shapeText!.layout.autoFit = "resize-shape";
      input.shapeText!.paragraph.lineSpacing = { kind: "exact", pt: 30 };
      const expected = structuredClone(input),
        command = createSetSheetDrawingsCommand(sheet.id, [input]);
      mutate(input.shapeText!);
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(sheet.drawings).toEqual([expected]);
      expect(session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(session.workbook);
      expect(after.version).toBe(59);
      mutate((command.drawings[0] as SheetGraphicDrawing).shapeText!);
      expect(sheet.drawings).toEqual([expected]);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
      mutate((after.sheets[0]!.drawings![0] as SheetGraphicDrawing).shapeText!);
      expect(sheet.drawings).toEqual([expected]);
    }
  });

  test("canonical record reordering, false decorations and negative zero are no-ops", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const model = shapeText();
    model.layout.marginsPt.leftPt = 0;
    sheet.drawings = [normalizeSheetDrawing(textDrawing(model))];
    const input = reverseRecords({
      ...model,
      underline: false,
      strike: false,
      style: {},
    }) as ShapeText;
    input.layout.marginsPt.leftPt = -0;
    input.paragraph.beforePt = -0;
    const before = serializeWorkbook(session.workbook),
      revision = session.history.revision;
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [textDrawing(input)]),
      ),
    ).toBe(false);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("explicit default insertion and removal are each meaningful while undefined absence is a no-op", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [normalizeSheetDrawing(legacyShapeDrawing())];
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [
          { ...legacyShapeDrawing(), shapeText: undefined },
        ]),
      ),
    ).toBe(false);
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [textDrawing()])),
    ).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(59);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [legacyShapeDrawing()]),
      ),
    ).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(2);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });

  test("valid first drawing plus malformed second rejects atomically without getter reads, inverse or revision", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [textDrawing()];
    const before = serializeWorkbook(session.workbook),
      revision = session.history.revision;
    let reads = 0;
    const accessor = { ...legacyShapeDrawing(), id: "bad" };
    Object.defineProperty(accessor, "shapeText", {
      get() {
        reads++;
        return shapeText();
      },
    });
    const inherited = Object.assign(
      Object.create({
        get shapeText() {
          reads++;
          return shapeText();
        },
      }),
      { ...legacyShapeDrawing(), id: "bad" },
    );
    for (const bad of [
      { ...legacyShapeDrawing(), id: "bad", shapeText: {} },
      {
        ...textDrawing(),
        id: "bad",
        shapeText: { ...shapeText(), layout: { ...shapeText().layout, wrap: 1 } },
      },
      {
        ...textDrawing(),
        id: "bad",
        shapeText: {
          ...shapeText(),
          style: { softEdges: { kind: "value", value: { sizePt: NaN } } },
        },
      },
      accessor,
      inherited,
    ] as SheetGraphicDrawing[]) {
      const drawings = [{ ...textDrawing(), id: "valid", height: 500 }, bad];
      expect(() => createSetSheetDrawingsCommand(sheet.id, drawings)).toThrow();
      expect(() =>
        executeWorkbookCommand(session, { type: "setSheetDrawings", sheetId: sheet.id, drawings }),
      ).toThrow();
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history.revision).toBe(revision);
      expect(session.history.undoStack).toHaveLength(0);
      expect(session.history.redoStack).toHaveLength(0);
    }
    expect(reads).toBe(0);
  });

  test("formatCells permission never substitutes for editObjects on either eligible kind", () => {
    for (const kind of ["shape", "textBox"] as const) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [{ ...legacyShapeDrawing(), kind }];
      sheet.properties.protected = true;
      sheet.protection = { editableRanges: [], formatCells: true };
      const before = serializeWorkbook(session.workbook),
        revision = session.history.revision;
      const command = createSetSheetDrawingsCommand(sheet.id, [
        { ...textDrawing(), kind, height: 300 },
      ]);
      expect(() => executeWorkbookCommand(session, command)).toThrow();
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history.revision).toBe(revision);
      expect(session.history.undoStack).toHaveLength(0);
      sheet.protection.editObjects = true;
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(sheet.drawings[0]).toMatchObject({ shapeText: shapeText(), height: 300 });
    }
  });

  test.each([
    {
      name: "axis insert",
      row: 5,
      create: (id: string) => createInsertSheetAxisCommand(id, "row", 1, 2),
    },
    {
      name: "axis delete",
      row: 2,
      create: (id: string) => createDeleteSheetAxisCommand(id, "row", 1),
    },
    {
      name: "axis move",
      row: 0,
      create: (id: string) => createMoveSheetAxisCommand(id, "row", 3, 1, 0),
    },
    {
      name: "cell insert",
      row: 4,
      create: (id: string) =>
        createInsertCellsCommand(
          id,
          { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } },
          "down",
        ),
    },
    {
      name: "cell delete",
      row: 2,
      create: (id: string) =>
        createDeleteCellsCommand(
          id,
          { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } },
          "up",
        ),
    },
  ])("$name changes only the anchor and restores exact detached models", ({ create, row }) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const drawing = textDrawing({
      ...shapeText(),
      fontFamily: "Exact",
      style: textureShapeStyle(),
    });
    drawing.height = 250;
    drawing.shapeText!.layout.autoFit = "resize-shape";
    sheet.drawings = [drawing];
    const before = serializeWorkbook(session.workbook);
    expect(executeWorkbookCommand(session, create(sheet.id))).toBe(true);
    expect(sheet.drawings).toEqual([{ ...drawing, anchor: { row, column: 2 } }]);
    expect((sheet.drawings[0] as SheetGraphicDrawing).shapeText).not.toBe(drawing.shapeText);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("metadata, sparse restore and table transaction snapshots retain independent text models", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [textDrawing({ ...shapeText(), style: fullStyle() })];
    const metadata = getSheetMetadata(sheet);
    mutate((metadata.drawings![0] as SheetGraphicDrawing).shapeText!);
    expect((sheet.drawings[0] as SheetGraphicDrawing).shapeText).toEqual({
      ...shapeText(),
      style: fullStyle(),
    });
    const unchangedMetadata = getSheetMetadata(sheet);
    expect(setSheetMetadata(sheet, unchangedMetadata)).toBe(false);
    const before = serializeWorkbook(session.workbook),
      state = createSheetSparseState(sheet);
    const restore = createRestoreSheetStateCommand(sheet.id, state);
    mutate((state.drawings![0] as SheetGraphicDrawing).shapeText!);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    sheet.drawings = [];
    expect(executeWorkbookCommand(session, restore)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    mutate((restore.state.drawings![0] as SheetGraphicDrawing).shapeText!);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    const tableRestore = createRestoreTableTransactionCommand(session.workbook);
    mutate((tableRestore.states[0]!.state.drawings![0] as SheetGraphicDrawing).shapeText!);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });

  test("cell paste and autofill preserve cell font runs while leaving unrelated drawing text untouched", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const drawing = textDrawing({ ...shapeText(), style: textureShapeStyle() });
    sheet.drawings = [drawing];
    const rich = {
      kind: "literal" as const,
      value: "AΩ",
      fontRuns: [{ start: 1, end: 2, fontFamily: "Symbol" }],
    };
    const source = { row: 0, column: 0 },
      target = { row: 1, column: 0 };
    setCellContent(sheet, source, rich);
    expect(
      executeWorkbookCommand(
        session,
        createPasteCellContentsCommand(sheet.id, { row: 0, column: 1 }, [[rich]]),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual(rich);
    expect(sheet.drawings).toEqual([drawing]);
    const plan = captureCellFill(
      session.workbook,
      sheet.id,
      { start: source, end: source },
      { start: source, end: target },
    );
    expect(
      executeWorkbookCommand(session, createCellFillCommand(session.workbook, plan, "copy")),
    ).toBe(true);
    expect(getCellContent(sheet, target)).toEqual(rich);
    expect(sheet.drawings).toEqual([drawing]);
    for (let i = 0; i < 2; i++) {
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(sheet.drawings).toEqual([drawing]);
    }
    for (let i = 0; i < 2; i++) {
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(sheet.drawings).toEqual([drawing]);
    }
  });

  test("table transactions preserve text layout, owned style and height through undo and redo", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const drawing = textDrawing({ ...shapeText(), style: fullStyle() });
    sheet.drawings = [drawing];
    const table: SheetTable = {
      id: "table",
      name: "Data",
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      columns: [
        { id: "a", name: "Amount" },
        { id: "b", name: "Region" },
      ],
      style: createBuiltinTableStyles()[0]!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    };
    const before = serializeWorkbook(session.workbook);
    expect(executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table))).toBe(true);
    expect(sheet.drawings).toEqual([drawing]);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });
});
