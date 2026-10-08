import { describe, expect, test } from "vitest";
import {
  normalizeSheetDrawing,
  normalizeSheetDrawings,
  type SheetDrawing,
} from "../../sheet-drawings.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  applyWorkbookCommand,
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
  createSetSheetProtectionCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function drawing(id = "drawing"): SheetDrawing {
  return {
    id,
    kind: "shape",
    name: "Rectangle",
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
    rotation: 30,
  };
}

describe("sheet drawings", () => {
  test("clones normalized values and isolates command input and sheet state", () => {
    const original = drawing();
    const normalized = normalizeSheetDrawing(original);
    normalized.anchor.row = 9;
    expect(original.anchor.row).toBe(3);
    expect(normalizeSheetDrawings(undefined)).toEqual([]);
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const command = createSetSheetDrawingsCommand(sheet.id, [original]);
    original.anchor.column = 9;
    executeWorkbookCommand(session, command);
    command.drawings[0]!.anchor.row = 10;
    expect(sheet.drawings?.[0]?.anchor).toEqual({ row: 3, column: 2 });
  });

  test("records replacement as one command and restores it through undo and redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.drawings = [drawing("old")];
    const next = [drawing("a"), { ...drawing("b"), kind: "textBox" as const }];
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, next));
    expect(session.history.undoStack).toHaveLength(1);
    expect(sheet.drawings).toEqual(next);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([drawing("old")]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual(next);
  });

  test.each([
    { id: "" },
    { kind: "unknown" },
    { shape: "unknown" },
    { width: 0 },
    { height: Infinity },
    { offsetX: -1 },
    { anchor: { row: -1, column: 0 } },
    { stroke: "red" },
    { fontSize: 513 },
    { rotation: 361 },
    { bold: "yes" },
    { text: "x".repeat(100001) },
  ])("rejects invalid fields atomically", (invalid) => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.drawings = [drawing("old")];
    const values = [drawing("valid"), { ...drawing("invalid"), ...invalid } as SheetDrawing];
    expect(() => normalizeSheetDrawings(values)).toThrow();
    expect(() =>
      applyWorkbookCommand(session.workbook, {
        type: "setSheetDrawings",
        sheetId: sheet.id,
        drawings: values,
      }),
    ).toThrow();
    expect(sheet.drawings).toEqual([drawing("old")]);
  });

  test("rejects duplicate IDs before modifying any drawing", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.drawings = [drawing("old")];
    expect(() =>
      createSetSheetDrawingsCommand(sheet.id, [drawing("same"), drawing("same")]),
    ).toThrow();
    expect(() =>
      applyWorkbookCommand(session.workbook, {
        type: "setSheetDrawings",
        sheetId: sheet.id,
        drawings: [drawing("same"), drawing("same")],
      }),
    ).toThrow();
    expect(sheet.drawings).toEqual([drawing("old")]);
  });

  test("round trips all drawing kinds in V25 and rejects drawings in V24", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const values = (["shape", "textBox", "wordArt", "icon", "equation"] as const).map((kind) => ({
      ...drawing(kind),
      kind,
    }));
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, values));
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(36);
    expect(getActiveSheet(deserializeWorkbook(snapshot)).drawings).toEqual(values);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 24 })).toThrow(/version 25/);
  });

  test.each([
    ["row", "insert"],
    ["column", "insert"],
    ["row", "delete"],
    ["column", "delete"],
    ["row", "move"],
    ["column", "move"],
  ] as const)("restores drawings after %s %s with undo", (axis, operation) => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.drawings = [drawing()];
    const before = structuredClone(sheet.drawings);
    const index = drawing().anchor[axis];
    if (operation === "insert") {
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, axis, index, 2));
      expect(sheet.drawings?.[0]?.anchor[axis]).toBe(index + 2);
    } else if (operation === "delete") {
      executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, index));
      expect(sheet.drawings).toEqual([]);
    } else {
      executeWorkbookCommand(session, createMoveSheetAxisCommand(sheet.id, axis, index, 1, 0));
      expect(sheet.drawings?.[0]?.anchor[axis]).toBe(0);
    }
    undoWorkbookCommand(session);
    expect(sheet.drawings).toEqual(before);
  });

  test("honors editObjects protection and leaves rejected edits out of history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetSheetProtectionCommand(sheet.id, true, { editableRanges: [] }),
    );
    const revision = session.history.revision;
    expect(() =>
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing()])),
    ).toThrow();
    expect(sheet.drawings ?? []).toEqual([]);
    expect(session.history.revision).toBe(revision);
    executeWorkbookCommand(
      session,
      createSetSheetProtectionCommand(sheet.id, true, { editableRanges: [], editObjects: true }),
    );
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing()])),
    ).toBe(true);
    expect(sheet.drawings).toEqual([drawing()]);
  });
});
