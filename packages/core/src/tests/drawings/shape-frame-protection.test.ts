import { normalizeSheetDrawing } from "../../sheet-drawings.js";
import { describe, expect, test } from "vitest";
import { canEditShapeObject, canEditSheetDrawingCollection } from "../../shape-protection.js";
import { applyWorkbookCommand } from "../../commands/apply.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand } from "../../history.js";
import { getActiveSheet, createSheetSparseState } from "../../workbook.js";
import { serializeWorkbook } from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedShapeDrawing } from "./shape-frame-fixture.js";
import { textDrawing } from "./shape-text-fixture.js";

describe("shape object protection product policy", () => {
  test("only existing unlocked frames are editable without Edit objects", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const locked = framedShapeDrawing();
    locked.id = "locked";
    const unlocked = framedShapeDrawing();
    unlocked.id = "unlocked";
    unlocked.shapeProperties = { locked: false };
    const legacy = textDrawing();
    legacy.id = "legacy";
    sheet.drawings = [locked, unlocked, legacy];
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [] };
    expect(canEditShapeObject(sheet, locked)).toBe(false);
    expect(canEditShapeObject(sheet, legacy)).toBe(false);
    expect(canEditShapeObject(sheet, unlocked)).toBe(true);
    const changed = { ...unlocked, rotation: 37 };
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [locked, changed, legacy]),
      ),
    ).toBe(true);
    expect(canEditSheetDrawingCollection(sheet, [locked, legacy])).toBe(true);
  });
  test("incoming false locks/new identities, locked edits, lock toggles and whole invalid batches stay atomic", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const locked = framedShapeDrawing(),
      unlocked = {
        ...framedShapeDrawing(),
        id: "unlocked",
        shapeProperties: { locked: false as const },
      };
    sheet.drawings = [locked, unlocked];
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [] };
    const before = serializeWorkbook(session.workbook);
    for (const next of [
      [{ ...locked, shapeProperties: { locked: false as const } }, unlocked],
      [locked, { ...unlocked, id: "new" }],
      [locked, { ...unlocked, shapeProperties: undefined }],
      [
        { ...locked, text: "changed" },
        { ...unlocked, text: "allowed" },
      ],
      [unlocked],
    ]) {
      expect(canEditSheetDrawingCollection(sheet, next)).toBe(false);
      expect(() =>
        executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, next)),
      ).toThrow();
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history.undoStack).toHaveLength(0);
    }
  });
  test("Edit objects allows real lock changes; no change remains a harmless no-op", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const original = normalizeSheetDrawing(framedShapeDrawing());
    sheet.drawings = [original];
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [], editObjects: true };
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [original])),
    ).toBe(false);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [
          { ...original, shapeProperties: { locked: false } },
        ]),
      ),
    ).toBe(true);
  });
});

test("internal table restore is not an incoming protected-sheet bypass, while legitimate history retains its exact contract", () => {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  sheet.drawings = [framedShapeDrawing()];
  sheet.properties.protected = true;
  sheet.protection = { editableRanges: [] };
  const state = createSheetSparseState(sheet);
  state.drawings![0]!.rotation = 65;
  const command = {
    type: "restoreTableTransaction" as const,
    states: [{ sheetId: sheet.id, state }],
    tableStyles: session.workbook.tableStyles ?? [],
  };
  const before = serializeWorkbook(session.workbook);
  expect(() => executeWorkbookCommand(session, command)).toThrow(/protected/);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(session.history.undoStack).toHaveLength(0);
  expect(applyWorkbookCommand(session.workbook, command, { fromHistory: true })).toBeTruthy();
  expect(sheet.drawings![0]!.rotation).toBe(65);
});
