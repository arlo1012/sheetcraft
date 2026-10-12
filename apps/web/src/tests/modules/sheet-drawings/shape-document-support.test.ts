import { reactive } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, createSheetSparseState } from "@sheetcraft/core/workbook";
import { serializeWorkbook, serializeSheet } from "@sheetcraft/core/serialization";
import { requireLegacySheetDrawings } from "@sheetcraft/core/sheet-drawings";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  assertShapeCommandSupport,
  assertWorkbookShapeSupport,
} from "../../../modules/sheet-drawings/shape-document-support";
import { framedShape } from "./framed-shape-fixture";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  parseWorkbookJson,
  readWorkbookBundleFile,
} from "../../../modules/workbook-persistence/workbookJsonTransfer";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";

describe("canonical shape model admission", () => {
  test("live admission preserves canonical placement while explicit legacy adapters still reject it", () => {
    const workbook = createWorkbook({ id: "incoming", sheetId: "sheet" }),
      sheet = getActiveSheet(workbook);
    const legacy = createGraphicDrawing("old", "shape", "Old", { row: 0, column: 0 });
    sheet.drawings = [legacy];
    expect(() => assertWorkbookShapeSupport(workbook)).not.toThrow();
    expect(requireLegacySheetDrawings(sheet.drawings)[0]).toBe(legacy);
    sheet.drawings.push(framedShape());
    const snapshot = serializeWorkbook(workbook);
    expect(() => assertWorkbookShapeSupport(workbook)).not.toThrow();
    expect(() => requireLegacySheetDrawings(sheet.drawings)).toThrow();
    expect(serializeWorkbook(workbook)).toEqual(snapshot);
  });
  test("content-bearing ingress validates without mutation and preserves canonical data", () => {
    const incoming = createWorkbook({ id: "incoming", sheetId: "sheet" }),
      sheet = getActiveSheet(incoming);
    sheet.drawings = [framedShape()];
    const state = createSheetSparseState(sheet),
      snapshot = serializeSheet(sheet);
    const commands: WorkbookCommand[] = [
      createSetSheetDrawingsCommand(sheet.id, sheet.drawings),
      { type: "addSheet", sheet: snapshot, index: 0, activeSheetId: sheet.id },
      { type: "restoreSheetState", sheetId: sheet.id, state },
      {
        type: "restoreCellShift",
        sheetId: sheet.id,
        state,
        direction: "right",
        range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        operation: "insert",
        workbookFormulaSources: [],
        definedNames: [],
      },
      { type: "restoreTableTransaction", states: [{ sheetId: sheet.id, state }], tableStyles: [] },
    ];
    const before = serializeWorkbook(incoming);
    for (const command of commands) expect(() => assertShapeCommandSupport(command)).not.toThrow();
    expect(serializeWorkbook(incoming)).toEqual(before);
  });
  test("plain and bundled internal recovery preserve canonical placement", async () => {
    const workbook = createWorkbook({ id: "incoming", sheetId: "sheet" });
    getActiveSheet(workbook).drawings = [framedShape()];
    const snapshot = serializeWorkbook(workbook);
    expect(serializeWorkbook(parseWorkbookJson(JSON.stringify(snapshot)))).toEqual(snapshot);
    const assets = createMemoryImageAssetStore();
    const recovered = await readWorkbookBundleFile(
      {
        text: async () =>
          JSON.stringify({ format: "sheetcraft-workbook", version: 1, snapshot, images: [] }),
      },
      assets,
    );
    expect(serializeWorkbook(recovered)).toEqual(snapshot);
  });
});

test("custom array methods are rejected without calling them in an admission check", () => {
  const drawings = [framedShape()];
  drawings.filter = vi.fn(() => []);
  expect(() =>
    assertShapeCommandSupport({ type: "setSheetDrawings", sheetId: "s", drawings }),
  ).toThrow();
  expect(drawings.filter).not.toHaveBeenCalled();
  const stateful = [framedShape()];
  stateful.map = vi
    .fn()
    .mockReturnValueOnce([])
    .mockImplementation(() => [framedShape()]);
  expect(() =>
    assertShapeCommandSupport({ type: "setSheetDrawings", sheetId: "s", drawings: stateful }),
  ).toThrow();
  expect(stateful.map).not.toHaveBeenCalled();
});

test("accessor command type or shape-bearing payload cannot switch after preflight", () => {
  const command = {
    type: "setSheetDrawings" as const,
    sheetId: "s",
    drawings: [] as ReturnType<typeof framedShape>[],
  };
  const getter = vi.fn().mockReturnValueOnce([]).mockReturnValue([framedShape()]);
  Object.defineProperty(command, "drawings", { get: getter });
  expect(() => assertShapeCommandSupport(command)).toThrow(/accessors/);
  expect(getter).not.toHaveBeenCalled();
  const typed = { sheetId: "s", drawings: [framedShape()] };
  const type = vi.fn(() => "setSheetDrawings");
  Object.defineProperty(typed, "type", { get: type });
  expect(() => assertShapeCommandSupport(typed as unknown as WorkbookCommand)).toThrow(/accessors/);
  expect(type).not.toHaveBeenCalled();
});

test("legacy boundary preserves the exposed reactive owner identity for gesture CAS", () => {
  const legacy = reactive([createGraphicDrawing("old", "shape", "Old", { row: 0, column: 0 })]);
  expect(requireLegacySheetDrawings(legacy)[0]).toBe(legacy[0]);
});
