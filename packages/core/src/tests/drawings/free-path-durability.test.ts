import type { ShapeFreePath } from "../../shape-free-path.js";
import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  createRestoreSheetStateCommand,
} from "../../commands/structure.js";
import { createDeleteCellsCommand, createInsertCellsCommand } from "../../commands/cell-shift.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { createSheetSparseState, getActiveSheet, setCellContent } from "../../workbook.js";
import {
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "../../sheet-drawings.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedCellImage } from "../cell-picture-frame/fixture.js";
import { calculatedColumnFixture } from "../tables/calculated-column-fixture.js";
import { freePath, freePathDrawing } from "./free-path-fixture.js";

describe("free shape internal durability", () => {
  test("command inputs, executed state, inverses and snapshots deeply detach geometry and preserve all appearance", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      { shapePath: _path, ...legacy } = freePathDrawing();
    sheet.drawings = [legacy];
    const before = serializeWorkbook(session.workbook),
      input: SheetGraphicDrawing = {
        ...freePathDrawing(),
        shapePath: { ...freePath(), pointTypes: { "0": "smooth", "2": "straight" } },
        shapeFlipX: true,
        shapeFlipY: true,
        shapeLineEnds: { begin: { kind: "triangle" }, end: { kind: "open" } },
      },
      expected = structuredClone(input),
      command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.shapePath!.viewBox.width = 1;
    (input.shapePath!.pointTypes as Record<string, string>)["0"] = "straight";
    (input.shapePath!.commands[1] as unknown as (string | number)[])[1] = 1;
    input.text = "Changed input";
    input.shapeLineEnds!.begin!.kind = "oval";
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.drawings).toEqual([expected]);
    const after = serializeWorkbook(session.workbook),
      sheetSnapshot = serializeSheet(sheet);
    expect(after.version).toBe(57);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(serializeSheet(deserializeSheet(sheetSnapshot))).toEqual(sheetSnapshot);
    (command.drawings[0] as SheetGraphicDrawing).shapePath!.viewBox.height = 1;
    ((command.drawings[0] as SheetGraphicDrawing).shapePath!.pointTypes as Record<string, string>)[
      "0"
    ] = "straight";
    (command.drawings[0] as SheetGraphicDrawing).shapePath!.commands = [
      ["M", 0, 0],
      ["L", 1, 1],
    ];
    expect(sheet.drawings).toEqual([expected]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    (after.sheets[0]!.drawings![0] as SheetGraphicDrawing).shapePath!.viewBox.width = 1;
    expect(sheet.drawings).toEqual([expected]);
    const noChange = createSetSheetDrawingsCommand(sheet.id, [structuredClone(expected)]),
      revision = session.history.revision;
    expect(executeWorkbookCommand(session, noChange)).toBe(false);
    expect(session.history.revision).toBe(revision);
  });

  test("point-only edits participate in drawing equality and one history step", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [freePathDrawing()];
    const before = serializeWorkbook(session.workbook),
      changed = freePathDrawing();
    changed.shapePath = {
      ...freePath(),
      commands: [
        ["M", 0, 30],
        ["L", 31, 0],
        ["Q", 60, 90, 90, 45],
        ["C", 120, 0, 150, 90, 180, 30],
      ],
    };
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [changed])),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(sheet.drawings).toEqual([changed]);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("vertex-type-only edits persist in one exact history step without changing coordinates or appearance", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [freePathDrawing()];
    const before = serializeWorkbook(session.workbook),
      changed = {
        ...freePathDrawing(),
        shapePath: { ...freePath(), pointTypes: { "2": "smooth" as const } },
      };
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [changed])),
    ).toBe(true);
    expect(sheet.drawings).toEqual([changed]);
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(57);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("mixed calculated tables, rich text, cell frames, vertical text, preset flips and free paths infer version 57 last", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1));
    setCellContent(
      sheet,
      { row: 5, column: 0 },
      { kind: "literal", value: "aΩ", fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Serif" }] },
    );
    setCellContent(sheet, { row: 5, column: 1 }, { kind: "image", image: framedCellImage() });
    const { shapePath: _path, ...legacy } = freePathDrawing();
    sheet.drawings = [
      { ...freePathDrawing(), shapeFlipX: true, shapeLineEnds: { end: { kind: "triangle" } } },
      {
        ...legacy,
        id: "standard",
        shapeGeometry: { preset: "bentConnector3" },
        shapeFlipY: true,
        shapeLineEnds: { begin: { kind: "open" } },
      },
      { ...legacy, id: "vertical", kind: "textBox", textDirection: "vertical" },
    ];
    const snapshot = serializeWorkbook(workbook),
      sheetSnapshot = serializeSheet(sheet);
    expect(snapshot.version).toBe(57);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(sheetSnapshot))).toEqual(sheetSnapshot);
    sheet.drawings = sheet.drawings.slice(1);
    expect(serializeWorkbook(workbook).version).toBe(56);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    sheet.drawings = [];
    expect(serializeWorkbook(workbook).version).toBe(53);
  });

  test("versions 1 through 56 reject path presence before parsing or canonicalization", () => {
    const session = createTestWorkbookSession(),
      raw = serializeWorkbook(session.workbook),
      { dateSystem, ...withoutDateSystem } = raw;
    let reads = 0;
    const accessor = freePathDrawing();
    Object.defineProperty(accessor, "shapePath", {
      get() {
        reads++;
        return freePath();
      },
    });
    for (let version = 1; version < 57; version++)
      for (const drawing of [
        freePathDrawing(),
        { ...freePathDrawing(), shapePath: undefined },
        accessor,
      ])
        expect(() =>
          deserializeWorkbook({
            ...withoutDateSystem,
            ...(version >= 3 ? { dateSystem } : {}),
            version,
            sheets: [{ ...raw.sheets[0], drawings: [drawing] }],
          }),
        ).toThrow(/version 57/);
    expect(reads).toBe(0);
  });

  test("closed seam aliases canonicalize through commands, history and version 57 snapshots", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      shapePath: ShapeFreePath = {
        ...freePath(),
        commands: [["M", 0, 0], ["C", 180, 0, 180, 90, 0, 0], ["Z"]],
        pointTypes: { "1": "smooth" },
      };
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [
          { ...freePathDrawing(), shapePath } as SheetGraphicDrawing,
        ]),
      ),
    ).toBe(true);
    expect((sheet.drawings![0] as SheetGraphicDrawing).shapePath?.pointTypes).toEqual({
      "0": "smooth",
    });
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(57);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    const conflicting: ShapeFreePath = {
      ...shapePath,
      pointTypes: { "0": "straight", "1": "smooth" },
    };
    expect(() =>
      createSetSheetDrawingsCommand(sheet.id, [
        { ...freePathDrawing(), shapePath: conflicting } as SheetGraphicDrawing,
      ]),
    ).toThrow(/conflicting/);
    expect(() =>
      deserializeWorkbook({
        ...after,
        sheets: [
          { ...after.sheets[0], drawings: [{ ...freePathDrawing(), shapePath: conflicting }] },
        ],
      }),
    ).toThrow(/conflicting/);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("featureless and legacy drawings keep existing protocols, even after loading a version 57 container", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      { shapePath: _path, ...legacy } = freePathDrawing();
    for (const shape of [
      "rectangle",
      "roundedRectangle",
      "ellipse",
      "triangle",
      "diamond",
      "arrow",
      "line",
      "star",
      "heart",
    ] as const) {
      const drawing = { ...legacy, shape };
      expect(normalizeSheetDrawing(drawing)).toEqual(drawing);
      sheet.drawings = [drawing];
      const snapshot = serializeWorkbook(session.workbook);
      expect(snapshot.version).toBe(43);
      expect(serializeWorkbook(deserializeWorkbook({ ...snapshot, version: 57 }))).toEqual(
        snapshot,
      );
    }
    sheet.drawings = [{ ...legacy, shapeGeometry: { preset: "rect" } }];
    expect(serializeWorkbook(session.workbook).version).toBe(54);
    sheet.drawings = [
      {
        ...legacy,
        shapeGeometry: { preset: "line" },
        shapeLineEnds: { end: { kind: "triangle" } },
      },
    ];
    expect(serializeWorkbook(session.workbook).version).toBe(55);
    sheet.drawings = [{ ...legacy, shapeGeometry: { preset: "ellipse" }, shapeFlipY: true }];
    expect(serializeWorkbook(session.workbook).version).toBe(56);
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
  ])(
    "$name preserves free path, endpoints, flips, appearance and exact history",
    ({ create, row }) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook),
        drawing: SheetGraphicDrawing = {
          ...freePathDrawing(),
          shapeFlipX: true,
          shapeFlipY: true,
          shapeLineEnds: { end: { kind: "triangle" } },
        };
      sheet.drawings = [drawing];
      const before = serializeWorkbook(session.workbook);
      expect(executeWorkbookCommand(session, create(sheet.id))).toBe(true);
      expect(sheet.drawings).toEqual([{ ...drawing, anchor: { row, column: 2 } }]);
      const after = serializeWorkbook(session.workbook);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    },
  );

  test("sparse-state snapshots and restore commands clone free paths instead of retaining source tuples", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [freePathDrawing()];
    const expected = serializeWorkbook(session.workbook),
      state = createSheetSparseState(sheet),
      command = createRestoreSheetStateCommand(sheet.id, state);
    (state.drawings![0] as SheetGraphicDrawing).shapePath!.viewBox.width = 1;
    expect(serializeWorkbook(session.workbook)).toEqual(expected);
    sheet.drawings = [];
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(expected);
    (command.state.drawings![0] as SheetGraphicDrawing).shapePath!.viewBox.width = 1;
    expect(serializeWorkbook(session.workbook)).toEqual(expected);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(expected);
  });

  test("invalid edited geometry fails atomically at commands and version 57 snapshot boundaries", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [freePathDrawing()];
    const before = serializeWorkbook(session.workbook),
      revision = session.history.revision,
      invalid = {
        ...freePathDrawing(),
        shapePath: {
          ...freePath(),
          commands: [
            ["M", 0, 0],
            ["Q", Infinity, 0, 1, 1],
          ],
        },
      } as unknown as SheetDrawing;
    expect(() => createSetSheetDrawingsCommand(sheet.id, [invalid])).toThrow();
    expect(() =>
      executeWorkbookCommand(session, {
        type: "setSheetDrawings",
        sheetId: sheet.id,
        drawings: [invalid],
      }),
    ).toThrow();
    expect(() =>
      deserializeWorkbook({ ...before, sheets: [{ ...before.sheets[0], drawings: [invalid] }] }),
    ).toThrow();
    expect(() => deserializeSheet({ ...serializeSheet(sheet), drawings: [invalid] })).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
    expect(session.history.undoStack).toHaveLength(0);
  });
});
