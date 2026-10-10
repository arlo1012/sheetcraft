import { describe, expect, test } from "vitest";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { normalizeSheetDrawing, mapDrawingSource } from "../../sheet-drawings.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
  createInsertCellsCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function drawing(): SheetChartDrawing {
  return {
    id: "chart",
    kind: "chart",
    name: "Sales",
    anchor: { row: 10, column: 10 },
    offsetX: 0,
    offsetY: 0,
    width: 400,
    height: 240,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: { start: { row: 2, column: 2 }, end: { row: 4, column: 4 } },
      title: "Sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
    },
  };
}
function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing()]));
  const current = () => sheet.drawings![0] as SheetChartDrawing;
  return { session, sheet, current };
}
describe("chart structural references", () => {
  test("invalidates a mapped source that exceeds the chart range limit", () => {
    const mapped = mapDrawingSource(drawing(), () => ({
      start: { row: 0, column: 0 },
      end: { row: 100, column: 99 },
    })) as SheetChartDrawing;
    expect(mapped.chart.range).toBeNull();
    expect(() => normalizeSheetDrawing(mapped)).not.toThrow();
  });
  test("deep clones chart payloads and source ranges", () => {
    const source = drawing();
    const clone = normalizeSheetDrawing(source) as SheetChartDrawing;
    clone.chart.title = "Other";
    clone.chart.range!.end.row = 5;
    expect(source.chart.title).toBe("Sales");
    expect(source.chart.range!.end.row).toBe(4);
  });
  test.each(["row", "column"] as const)(
    "moves %s source references with insertion, deletion and undo",
    (axis) => {
      const f = fixture();
      executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.sheet.id, axis, 1, 2));
      expect(f.current().chart.range!.start[axis]).toBe(4);
      expect(f.current().chart.range!.end[axis]).toBe(6);
      undoWorkbookCommand(f.session);
      expect(f.current().chart.range).toEqual(drawing().chart.range);
      executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.sheet.id, axis, 1));
      expect(f.current().chart.range!.start[axis]).toBe(1);
      undoWorkbookCommand(f.session);
      expect(f.current().chart.range).toEqual(drawing().chart.range);
    },
  );
  test.each(["row", "column"] as const)(
    "invalidates a completely deleted %s source and restores it on undo",
    (axis) => {
      const f = fixture();
      executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.sheet.id, axis, 2, 3));
      expect(f.current().chart.range).toBeNull();
      undoWorkbookCommand(f.session);
      expect(f.current().chart.range).toEqual(drawing().chart.range);
    },
  );
  test.each(["row", "column"] as const)(
    "moves a whole %s source and invalidates a split source, both undoable",
    (axis) => {
      const f = fixture();
      executeWorkbookCommand(f.session, createMoveSheetAxisCommand(f.sheet.id, axis, 2, 3, 0));
      expect(f.current().chart.range!.start[axis]).toBe(0);
      expect(f.current().chart.range!.end[axis]).toBe(2);
      undoWorkbookCommand(f.session);
      executeWorkbookCommand(f.session, createMoveSheetAxisCommand(f.sheet.id, axis, 3, 1, 7));
      expect(f.current().chart.range).toBeNull();
      undoWorkbookCommand(f.session);
      expect(f.current().chart.range).toEqual(drawing().chart.range);
    },
  );
  test("moves source references for full-width cell insertion and restores them", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createInsertCellsCommand(
        f.sheet.id,
        { start: { row: 1, column: 2 }, end: { row: 1, column: 4 } },
        "down",
      ),
    );
    expect(f.current().chart.range).toEqual({
      start: { row: 3, column: 2 },
      end: { row: 5, column: 4 },
    });
    undoWorkbookCommand(f.session);
    expect(f.current().chart.range).toEqual(drawing().chart.range);
  });
  test("round trips V26 charts and rejects their payload in V25", () => {
    const f = fixture();
    const snapshot = serializeWorkbook(f.session.workbook);
    expect(snapshot.version).toBe(43);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 25 })).toThrow();
  });
});
