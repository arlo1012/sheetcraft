import { describe, expect, test } from "vitest";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import {
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
  createInsertCellsCommand,
  createDeleteCellsCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createMoveCellRangeCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { fixture, records } from "./fixture.js";

function installed() {
  const f = fixture(records, { row: 2, column: 2 });
  f.table.filters = [{ field: 3, values: [2, 3, 4, 5] }];
  executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
  const current = () => f.destination.pivotTables![0]!;
  return { ...f, current };
}
describe("pivot structural references", () => {
  test("follows a completely cut source range and restores it on undo", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createMoveCellRangeCommand(f.source.id, f.table.source!, { row: 12, column: 8 }),
    );
    expect(f.current().source).toEqual({
      start: { row: 12, column: 8 },
      end: { row: 16, column: 11 },
    });
    expect(f.current().rowFields).toEqual([0]);
    expect(f.current().columnFields).toEqual([1]);
    expect(f.current().values[0]!.field).toBe(2);
    expect(f.current().filters[0]!.field).toBe(3);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("invalidates partially cut source references and restores them on undo", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createMoveCellRangeCommand(
        f.source.id,
        { start: { row: 3, column: 2 }, end: { row: 4, column: 3 } },
        { row: 12, column: 8 },
      ),
    );
    expect(f.current().source).toBeNull();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test.each(["row", "column"] as const)(
    "moves a cross-sheet %s source during insertion and restores it on undo",
    (axis) => {
      const f = installed();
      const before = serializeWorkbook(f.workbook);
      executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, axis, 1, 2));
      expect(f.current().source!.start[axis]).toBe(4);
      expect(f.current().anchor).toEqual(f.table.anchor);
      expect(f.current().rowFields).toEqual([0]);
      expect(f.current().columnFields).toEqual([1]);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
  test("preserves field identities when a column is inserted inside the source", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, "column", 3));
    expect(f.current()).toMatchObject({
      source: { start: { column: 2 }, end: { column: 6 } },
      rowFields: [0],
      columnFields: [2],
      values: [{ field: 3 }],
      filters: [{ field: 4 }],
    });
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test.each(["row", "column"] as const)(
    "invalidates completely deleted %s sources and restores all definitions",
    (axis) => {
      const f = installed();
      const before = serializeWorkbook(f.workbook);
      const count = axis === "row" ? 5 : 4;
      executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.source.id, axis, 2, count));
      expect(f.current().source).toBeNull();
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
  test("invalidates a deleted value field rather than binding the next column", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.source.id, "column", 4));
    expect(f.current().source).toBeNull();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test.each(["row", "column"] as const)(
    "moves a complete %s source across sheets and restores it",
    (axis) => {
      const f = installed();
      const before = serializeWorkbook(f.workbook);
      executeWorkbookCommand(
        f.session,
        createMoveSheetAxisCommand(f.source.id, axis, 2, axis === "row" ? 5 : 4, 0),
      );
      expect(f.current().source!.start[axis]).toBe(0);
      expect(f.current().rowFields).toEqual([0]);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
  test("tracks field identities when columns are reordered inside the source", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createMoveSheetAxisCommand(f.source.id, "column", 4, 1, 3));
    expect(f.current()).toMatchObject({
      source: { start: { column: 2 }, end: { column: 5 } },
      rowFields: [0],
      columnFields: [2],
      values: [{ field: 1 }],
      filters: [{ field: 3 }],
    });
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("updates cross-sheet sources through full-width cell shifts with undo", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createInsertCellsCommand(
        f.source.id,
        { start: { row: 1, column: 2 }, end: { row: 1, column: 5 } },
        "down",
      ),
    );
    expect(f.current().source).toEqual({
      start: { row: 3, column: 2 },
      end: { row: 7, column: 5 },
    });
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    executeWorkbookCommand(f.session, createDeleteCellsCommand(f.source.id, f.table.source!, "up"));
    expect(f.current().source).toBeNull();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("moves output anchor and range with destination edits and restores removed metadata", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.destination.id, "row", 1, 2));
    expect(f.current().anchor.row).toBe(4);
    expect(f.current().outputRange!.start.row).toBe(4);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.destination.id, "row", 2));
    expect(f.destination.pivotTables).toEqual([]);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("invalidates references to a deleted source sheet and restores them on undo", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createDeleteSheetCommand(f.workbook, f.source.id));
    expect(f.current().source).toBeNull();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("retargets duplicated self-referencing definitions to the new sheet", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.source.id, { ...f.table, anchor: { row: 8, column: 0 } }),
    );
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createDuplicateSheetCommand(f.workbook, f.source.id, { id: "duplicate", name: "Copied" }),
    );
    expect(f.workbook.sheets.get("duplicate")!.pivotTables![0]!.sourceSheetId).toBe("duplicate");
    expect(f.source.pivotTables![0]!.sourceSheetId).toBe(f.source.id);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
});
