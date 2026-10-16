import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { prepareExternalDrawingCollections } from "../../commands/text-references.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { normalizeSheetDrawings, type SheetChartDrawing } from "../../sheet-drawings.js";
import { createSheet, getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { formatDrawing } from "./chart-format-fixture.js";

const legend = () => ({
  text: { fontFamily: "Arial", fontSize: 16, bold: false },
  surface: { fill: "transparent", stroke: "#123456", strokeWidth: 2 },
});

describe("legend style lifecycle on existing drawing commands", () => {
  test("one edit/clear is one Undo, clones caller data, hidden legend keeps style across save and copy", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.drawings = [formatDrawing()];
    const before = serializeWorkbook(session.workbook);
    const input = formatDrawing({ legend: legend() });
    input.chart.legend = false;
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.chart.format!.legend!.text!.fontSize = 99;
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    const drawing = sheet.drawings![0]! as SheetChartDrawing;
    expect(drawing.chart.format!.legend).toEqual(legend());
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(88);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    const copied = normalizeSheetDrawings(sheet.drawings);
    (copied[0]! as SheetChartDrawing).chart.format!.legend!.surface!.stroke = "#abcdef";
    expect((sheet.drawings![0]! as SheetChartDrawing).chart.format!.legend).toEqual(legend());
    const cleared = normalizeSheetDrawings(sheet.drawings);
    delete (cleared[0]! as SheetChartDrawing).chart.format!.legend;
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, cleared))).toBe(
      true,
    );
    expect(serializeWorkbook(session.workbook).version).toBe(80);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("protected reference maintenance cannot change legend formatting", () => {
    const session = createTestWorkbookSession();
    const source = getActiveSheet(session.workbook);
    const owner = createSheet("Owner", "owner");
    session.workbook.sheets.set(owner.id, owner);
    owner.drawings = [formatDrawing({ legend: legend() })];
    owner.properties.protected = true;
    owner.protection = { editableRanges: [] };
    const before = serializeWorkbook(session.workbook);
    const drawings = normalizeSheetDrawings(owner.drawings);
    (drawings[0]! as SheetChartDrawing).chart.format!.legend!.text!.fontSize = 20;
    expect(() =>
      prepareExternalDrawingCollections(session.workbook, source.id, [
        { sheetId: owner.id, drawings },
      ]),
    ).toThrow(/reference maintenance/);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(0);
  });
});
