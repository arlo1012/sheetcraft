import { describe, expect, test } from "vitest";
import type { SheetCameraDrawing } from "../../sheet-drawings.js";
import { normalizeCameraRange, normalizeSheetDrawing } from "../../sheet-drawings.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
  createInsertCellsCommand,
  createDeleteCellsCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeWorkbook,
  serializeWorkbook,
  deserializeSheet,
  serializeSheet,
} from "../../serialization.js";
import { getActiveSheet, setCellSparkline } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function drawing(): SheetCameraDrawing {
  return {
    id: "camera",
    kind: "camera",
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
    camera: {
      range: { start: { row: 2, column: 2 }, end: { row: 4, column: 4 } },
      gridLines: true,
    },
  };
}
function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing()]));
  const current = () => sheet.drawings![0] as SheetCameraDrawing;
  return { session, sheet, current };
}
describe("camera structural references", () => {
  test("round trips a standalone sheet containing both a camera and a sparkline", () => {
    const f = fixture();
    setCellSparkline(
      f.sheet,
      { row: 0, column: 4 },
      {
        source: { start: { row: 0, column: 0 }, end: { row: 0, column: 2 } },
        type: "line",
        color: "#2563eb",
        negativeColor: "#ef4444",
        markers: false,
        axis: false,
        showHidden: false,
        empty: "gap",
      },
    );
    const snapshot = serializeSheet(f.sheet);
    expect(serializeSheet(deserializeSheet(snapshot))).toEqual(snapshot);
  });
  test.each([
    { start: { row: -1, column: 0 }, end: { row: 0, column: 0 } },
    { start: { row: 2, column: 0 }, end: { row: 1, column: 0 } },
    { start: { row: 0, column: 0 }, end: { row: 0, column: 16384 } },
    { start: { row: 0, column: 0 }, end: { row: 1048576, column: 0 } },
    { start: { row: 0.5, column: 0 }, end: { row: 1, column: 0 } },
    { start: { row: 0, column: 0 }, end: { row: 100, column: 99 } },
  ])("rejects invalid coordinates and oversized source ranges", (range) => {
    expect(() => normalizeCameraRange(range)).toThrow();
  });
  test("accepts and clones a source at the 10,000-cell limit and an invalidated source", () => {
    const range = { start: { row: 0, column: 0 }, end: { row: 99, column: 99 } };
    const normalized = normalizeCameraRange(range)!;
    expect(normalized).toEqual(range);
    normalized.start.row = 1;
    expect(range.start.row).toBe(0);
    expect(normalizeCameraRange(null)).toBeNull();
  });
  test("rejects a malformed camera payload", () => {
    expect(() =>
      normalizeSheetDrawing({ ...drawing(), camera: undefined } as unknown as SheetCameraDrawing),
    ).toThrow();
    expect(() =>
      normalizeSheetDrawing({
        ...drawing(),
        camera: { ...drawing().camera, gridLines: "yes" },
      } as unknown as SheetCameraDrawing),
    ).toThrow();
  });
  test("deep clones camera payloads and source ranges", () => {
    const source = drawing();
    const clone = normalizeSheetDrawing(source) as SheetCameraDrawing;
    clone.camera.gridLines = false;
    clone.camera.range!.end.row = 5;
    expect(source.camera.gridLines).toBe(true);
    expect(source.camera.range!.end.row).toBe(4);
  });
  test.each(["row", "column"] as const)(
    "moves %s source references with insertion, deletion and undo",
    (axis) => {
      const f = fixture();
      executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.sheet.id, axis, 1, 2));
      expect(f.current().camera.range!.start[axis]).toBe(4);
      expect(f.current().camera.range!.end[axis]).toBe(6);
      undoWorkbookCommand(f.session);
      expect(f.current().camera.range).toEqual(drawing().camera.range);
      executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.sheet.id, axis, 1));
      expect(f.current().camera.range!.start[axis]).toBe(1);
      undoWorkbookCommand(f.session);
      expect(f.current().camera.range).toEqual(drawing().camera.range);
    },
  );
  test.each(["row", "column"] as const)(
    "invalidates a completely deleted %s source and restores it on undo",
    (axis) => {
      const f = fixture();
      executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.sheet.id, axis, 2, 3));
      expect(f.current().camera.range).toBeNull();
      undoWorkbookCommand(f.session);
      expect(f.current().camera.range).toEqual(drawing().camera.range);
    },
  );
  test.each(["row", "column"] as const)(
    "moves a whole %s source and invalidates a split source, both undoable",
    (axis) => {
      const f = fixture();
      executeWorkbookCommand(f.session, createMoveSheetAxisCommand(f.sheet.id, axis, 2, 3, 0));
      expect(f.current().camera.range!.start[axis]).toBe(0);
      expect(f.current().camera.range!.end[axis]).toBe(2);
      undoWorkbookCommand(f.session);
      executeWorkbookCommand(f.session, createMoveSheetAxisCommand(f.sheet.id, axis, 3, 1, 7));
      expect(f.current().camera.range).toBeNull();
      undoWorkbookCommand(f.session);
      expect(f.current().camera.range).toEqual(drawing().camera.range);
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
    expect(f.current().camera.range).toEqual({
      start: { row: 3, column: 2 },
      end: { row: 5, column: 4 },
    });
    undoWorkbookCommand(f.session);
    expect(f.current().camera.range).toEqual(drawing().camera.range);
  });
  test("invalidates a partially shifted source and restores it on undo", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createInsertCellsCommand(
        f.sheet.id,
        { start: { row: 1, column: 3 }, end: { row: 1, column: 3 } },
        "down",
      ),
    );
    expect(f.current().camera.range).toBeNull();
    undoWorkbookCommand(f.session);
    expect(f.current().camera.range).toEqual(drawing().camera.range);
  });
  test("invalidates a source completely deleted by cell shift and restores it on undo", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createDeleteCellsCommand(
        f.sheet.id,
        { start: { row: 2, column: 2 }, end: { row: 4, column: 4 } },
        "up",
      ),
    );
    expect(f.current().camera.range).toBeNull();
    undoWorkbookCommand(f.session);
    expect(f.current().camera.range).toEqual(drawing().camera.range);
  });
  test("round trips V28 cameras and rejects their payload in V27", () => {
    const f = fixture();
    const snapshot = serializeWorkbook(f.session.workbook);
    expect(snapshot.version).toBe(30);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 27 })).toThrow();
  });
});
