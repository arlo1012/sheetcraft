import { describe, expect, test } from "vitest";
import {
  createSetSheetDrawingsCommand,
  createReplaceSheetDrawingCollectionsCommand,
} from "../../commands/drawings.js";
import { prepareExternalDrawingCollections } from "../../commands/text-references.js";
import { createInsertSheetAxisCommand } from "../../commands/structure.js";
import type { RestoreSheetAxisSliceCommand } from "../../commands/contracts.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { normalizeSheetDrawings, type SheetChartDrawing } from "../../sheet-drawings.js";
import { createSheet, getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { chartFormat } from "./chart-format-fixture.js";
import { sourceDrawing, vectorRange } from "./chart-source-fixture.js";

function fixture() {
  const session = createTestWorkbookSession(),
    source = getActiveSheet(session.workbook),
    owner = createSheet("Owner", "owner");
  session.workbook.sheets.set(owner.id, owner);
  const drawing = sourceDrawing(source.id);
  drawing.chart.format = chartFormat();
  source.drawings = normalizeSheetDrawings([drawing]);
  owner.drawings = normalizeSheetDrawings([drawing]);
  owner.properties.hidden = true;
  owner.properties.protected = true;
  owner.protection = { editableRanges: [] };
  return { session, source, owner };
}

describe("chart format preservation and protected reference-only maintenance", () => {
  test("structural reference rewrites preserve every format choice with one exact Undo/Redo", () => {
    const { session, source, owner } = fixture(),
      before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(source.id, "row", 2, 1)),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    const external = owner.drawings![0]! as SheetChartDrawing;
    expect(external.chart.format).toEqual(chartFormat());
    expect(external.chart.source!.series[0]!.values).toEqual({
      kind: "range",
      sheetId: source.id,
      range: vectorRange(1, 1, 4),
    });
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(80);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("complete normalized signature blocks every new format branch on protected external owners", () => {
    const { session, source, owner } = fixture(),
      before = serializeWorkbook(session.workbook),
      history = structuredClone(session.history);
    for (const mutate of [
      (drawing: SheetChartDrawing) => {
        delete drawing.chart.format;
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format = {};
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.title!.fontSize = 30;
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.plot!.fill = "#abcdef";
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.categoryAxis!.reverse = false;
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.valueAxis!.max = 200;
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.secondaryValueAxis!.max = 200;
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.bar!.overlap = 100;
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.series![0]!.id = "changed";
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.series![0]!.axis = "primary";
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.series![0]!.color = "#abcdef";
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.valueAxis!.numberFormat = { kind: "number", fractionDigits: 2 };
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.format!.valueAxis!.linkedToSource = true;
      },
    ]) {
      const drawings = normalizeSheetDrawings(owner.drawings),
        drawing = drawings[0]! as SheetChartDrawing;
      mutate(drawing);
      expect(() =>
        prepareExternalDrawingCollections(session.workbook, source.id, [
          { sheetId: owner.id, drawings },
        ]),
      ).toThrow(/reference maintenance/);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history).toEqual(history);
    }
    const unchanged = normalizeSheetDrawings(owner.drawings);
    expect(
      prepareExternalDrawingCollections(session.workbook, source.id, [
        { sheetId: owner.id, drawings: unchanged },
      ]).next,
    ).toEqual([]);
    const changed = normalizeSheetDrawings(owner.drawings);
    (changed[0]! as SheetChartDrawing).chart.format!.title!.bold = false;
    expect(() =>
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(owner.id, changed)),
    ).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history).toEqual(history);
  });

  test("malicious structural inverse format change rejects atomically before restoring references", () => {
    const { session, source } = fixture();
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(source.id, "row", 2, 1)),
    ).toBe(true);
    const inverse = structuredClone(
      session.history.undoStack[0]!.command,
    ) as RestoreSheetAxisSliceCommand;
    const drawings = inverse.slice.externalDrawingCollections![0]!.drawings;
    (drawings[0]! as SheetChartDrawing).chart.format!.bar!.gapWidth = 150;
    const before = serializeWorkbook(session.workbook),
      history = structuredClone(session.history);
    expect(() => executeWorkbookCommand(session, inverse)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history).toEqual(history);
  });

  test("cross-sheet collection move clones all format branches and retains stable IDs exactly", () => {
    const { session, source, owner } = fixture();
    owner.properties.protected = false;
    const before = serializeWorkbook(session.workbook);
    const input = normalizeSheetDrawings(source.drawings);
    const command = createReplaceSheetDrawingCollectionsCommand([
      { sheetId: source.id, expectedDrawings: source.drawings!, drawings: [] },
      { sheetId: owner.id, expectedDrawings: owner.drawings!, drawings: input },
    ]);
    (input[0]! as SheetChartDrawing).chart.format!.series![0]!.id = "caller";
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect((owner.drawings![0]! as SheetChartDrawing).chart.format).toEqual(chartFormat());
    expect(source.drawings).toEqual([]);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });
});
