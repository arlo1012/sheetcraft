import { describe, expect, test } from "vitest";
import {
  normalizeCellSparkline,
  getSparklineValues,
  translateCellSparkline,
  type CellSparkline,
} from "../../sparklines.js";
import {
  getActiveSheet,
  getCellSparkline,
  setCellSparkline,
  setCellContent,
  setCellStyle,
  setCellNote,
  setCellHyperlink,
  createSheetEvaluator,
} from "../../workbook.js";
import {
  createSetCellSparklineCommand,
  createSetCellSparklinesCommand,
  createPasteCellContentsCommand,
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
  createSortSheetRangeCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";

const position = { row: 10, column: 10 };
function sparkline(): CellSparkline {
  return {
    type: "line",
    source: { start: { row: 2, column: 2 }, end: { row: 2, column: 4 } },
    color: "#2563eb",
    negativeColor: "#ff0000",
    markers: true,
    axis: false,
    showHidden: false,
    empty: "gap",
  };
}
function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  setCellSparkline(sheet, position, sparkline());
  return { session, sheet };
}
describe("cell sparklines", () => {
  test.each([
    { type: "unknown" },
    { color: "red" },
    { negativeColor: "#fff" },
    { markers: "yes" },
    { empty: "unknown" },
    { source: { start: { row: -1, column: 0 }, end: { row: 0, column: 0 } } },
    { source: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } } },
    { source: { start: { row: 0, column: 0 }, end: { row: 0, column: 10000 } } },
  ])("rejects invalid fields or source ranges", (patch) => {
    expect(() => normalizeCellSparkline({ ...sparkline(), ...patch } as CellSparkline)).toThrow();
  });
  test("clones source coordinates and invalidates translated out-of-sheet references", () => {
    const original = sparkline();
    const clone = normalizeCellSparkline(original)!;
    clone.source!.start.row = 9;
    expect(original.source!.start.row).toBe(2);
    expect(translateCellSparkline(original, { row: 1, column: 2 })!.source).toEqual({
      start: { row: 3, column: 4 },
      end: { row: 3, column: 6 },
    });
    expect(translateCellSparkline(original, { row: -3, column: 0 })!.source).toBeNull();
  });
  test("preserves missing and nonnumeric values while zero mode fills only empty cells", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "10" });
    setCellContent(
      f.sheet,
      { row: 2, column: 4 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    const evaluator = createSheetEvaluator(f.sheet);
    expect(getSparklineValues(f.sheet, sparkline(), evaluator)).toEqual([null, null, null]);
    expect(getSparklineValues(f.sheet, { ...sparkline(), empty: "zero" }, evaluator)).toEqual([
      null,
      0,
      null,
    ]);
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: -2 });
    f.sheet.hiddenColumns = new Set([3]);
    expect(getSparklineValues(f.sheet, sparkline(), createSheetEvaluator(f.sheet))).toEqual([
      -2,
      null,
    ]);
  });
  test("records independent and batch sparkline commands with undo and redo", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetCellSparklineCommand(f.session.workbook, f.sheet.id, position, {
        ...sparkline(),
        type: "column",
      }),
    );
    expect(getCellSparkline(f.sheet, position)?.type).toBe("column");
    undoWorkbookCommand(f.session);
    expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
    redoWorkbookCommand(f.session);
    expect(getCellSparkline(f.sheet, position)?.type).toBe("column");
    executeWorkbookCommand(
      f.session,
      createSetCellSparklinesCommand(f.sheet.id, [
        { address: position, sparkline: null },
        { address: { row: 11, column: 10 }, sparkline: sparkline() },
      ]),
    );
    expect(getCellSparkline(f.sheet, position)).toBeUndefined();
    undoWorkbookCommand(f.session);
    expect(getCellSparkline(f.sheet, position)?.type).toBe("column");
    expect(getCellSparkline(f.sheet, { row: 11, column: 10 })).toBeUndefined();
  });
  test.each(["content", "style", "note", "hyperlink"] as const)(
    "keeps a sparkline-only cell through %s changes and clearing",
    (property) => {
      const f = fixture();
      if (property === "content") {
        setCellContent(f.sheet, position, { kind: "literal", value: "Text" });
        expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
        setCellContent(f.sheet, position, null);
      } else if (property === "style") {
        setCellStyle(f.sheet, position, { bold: true });
        expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
        setCellStyle(f.sheet, position, undefined);
      } else if (property === "note") {
        setCellNote(f.sheet, position, { text: "Note" });
        expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
        setCellNote(f.sheet, position, null);
      } else {
        setCellHyperlink(f.sheet, position, { target: "https://example.com" });
        expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
        setCellHyperlink(f.sheet, position, null);
      }
      expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
    },
  );
  test("round trips snapshot V27 and rejects sparkline fields in V26", () => {
    const f = fixture();
    const snapshot = serializeWorkbook(f.session.workbook);
    expect(snapshot.version).toBe(41);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 26 })).toThrow();
  });
  test.each(["row", "column"] as const)(
    "moves %s source and target with structural insertion and restores both",
    (axis) => {
      const f = fixture();
      executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.sheet.id, axis, 1));
      const next = { ...position, [axis]: position[axis] + 1 };
      expect(getCellSparkline(f.sheet, next)?.source!.start[axis]).toBe(3);
      undoWorkbookCommand(f.session);
      expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
    },
  );
  test.each(["row", "column"] as const)(
    "invalidates a deleted %s source and restores it",
    (axis) => {
      const f = fixture();
      executeWorkbookCommand(
        f.session,
        createDeleteSheetAxisCommand(f.sheet.id, axis, 2, axis === "row" ? 1 : 3),
      );
      const next = { ...position, [axis]: position[axis] - (axis === "row" ? 1 : 3) };
      expect(getCellSparkline(f.sheet, next)?.source).toBeNull();
      undoWorkbookCommand(f.session);
      expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
    },
  );
  test("moves source columns and restores target/reference on undo", () => {
    const f = fixture();
    executeWorkbookCommand(f.session, createMoveSheetAxisCommand(f.sheet.id, "column", 2, 3, 0));
    expect(getCellSparkline(f.sheet, position)?.source).toEqual({
      start: { row: 2, column: 0 },
      end: { row: 2, column: 2 },
    });
    undoWorkbookCommand(f.session);
    expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
  });
  test("pastes sparkline metadata in one batch and restores overwritten decoration on undo", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createPasteCellContentsCommand(f.sheet.id, position, [[null, null]], {
        sparklines: [[{ ...sparkline(), type: "column" }, sparkline()]],
      }),
    );
    expect(getCellSparkline(f.sheet, position)?.type).toBe("column");
    expect(getCellSparkline(f.sheet, { row: 10, column: 11 })).toEqual(sparkline());
    undoWorkbookCommand(f.session);
    expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
    expect(getCellSparkline(f.sheet, { row: 10, column: 11 })).toBeUndefined();
  });
  test("autofill copy translates the source range with the destination cell", () => {
    const f = fixture();
    const plan = captureCellFill(
      f.session.workbook,
      f.sheet.id,
      { start: position, end: position },
      { start: position, end: { row: 11, column: 10 } },
    );
    executeWorkbookCommand(f.session, createCellFillCommand(f.session.workbook, plan, "copy"));
    expect(getCellSparkline(f.sheet, { row: 11, column: 10 })?.source).toEqual({
      start: { row: 3, column: 2 },
      end: { row: 3, column: 4 },
    });
    undoWorkbookCommand(f.session);
    expect(getCellSparkline(f.sheet, { row: 11, column: 10 })).toBeUndefined();
  });
  test("sort translates sparkline source by the row displacement and supports undo", () => {
    const f = fixture();
    setCellContent(f.sheet, position, { kind: "literal", value: 2 });
    setCellContent(f.sheet, { row: 11, column: 10 }, { kind: "literal", value: 1 });
    setCellSparkline(f.sheet, position, sparkline());
    executeWorkbookCommand(
      f.session,
      createSortSheetRangeCommand(
        f.sheet.id,
        { start: position, end: { row: 11, column: 10 } },
        10,
        "ascending",
      ),
    );
    expect(getCellSparkline(f.sheet, { row: 11, column: 10 })?.source).toEqual({
      start: { row: 3, column: 2 },
      end: { row: 3, column: 4 },
    });
    undoWorkbookCommand(f.session);
    expect(getCellSparkline(f.sheet, position)).toEqual(sparkline());
  });
});
