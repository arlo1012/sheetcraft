import { describe, expect, test } from "vitest";
import type { CellContentMatrix } from "@idea10/core/clipboard";
import {
  createWorkbookHistory,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { deserializeWorkbook, serializeWorkbook } from "@idea10/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  getCellHyperlink,
  getCellNamedStyle,
  getCellNote,
  getCellStyle,
  setCellHyperlink,
  setCellNamedStyle,
  setCellNote,
  setCellContent,
  setCellStyle,
  setCellValue,
  type Sheet,
} from "@idea10/core/workbook";
import {
  createGridPasteCommand,
  GridPasteError,
} from "../../../../modules/sheet-grid/createGridPasteCommand";
import type { GridPastePayload } from "../../../../modules/sheet-grid/useGridClipboard";

function createFilteredSheet(): Sheet {
  const sheet = getActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() }));
  for (const row of [1, 3, 5, 7, 9, 11]) setCellValue(sheet, { row, column: 0 }, "show");
  for (const row of [2, 4, 6, 8, 10]) setCellValue(sheet, { row, column: 0 }, "hide");
  sheet.filter = {
    range: { start: { row: 0, column: 0 }, end: { row: 11, column: 0 } },
    columns: [{ column: 0, allowedValues: [{ kind: "string", value: "show" }] }],
  };
  return sheet;
}

function execute(sheet: Sheet, payload: GridPastePayload) {
  const workbook = {
    ...createWorkbook({ id: "workbook", sheetId: sheet.id }),
    activeSheetId: sheet.id,
    sheets: new Map([[sheet.id, sheet]]),
  };
  const session = {
    workbook,
    history: createWorkbookHistory(),
    idFactory: createSequentialIdFactory(),
  };
  expect(executeWorkbookCommand(session, createGridPasteCommand(sheet, payload))).toBe(true);
  return session;
}

function filteredPlan(rows: number[], rowCount = rows.length) {
  return {
    anchor: { row: rows[0]!, column: 1 },
    range: { start: { row: rows[0]!, column: 1 }, end: { row: rows.at(-1)!, column: 1 } },
    rows,
    preserveHiddenRows: true,
    values: Array.from({ length: rowCount }, () => ["value"]),
  };
}

describe("createGridPasteCommand", () => {
  test("protected input paste preserves destination locks, style and notes through undo", () => {
    const sheet = getActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() }));
    const destination = { row: 0, column: 0 };
    setCellValue(sheet, destination, "before");
    setCellStyle(sheet, destination, { unlocked: true, italic: true });
    setCellNote(sheet, destination, { text: "keep" });
    sheet.properties.protected = true;
    const session = execute(sheet, {
      kind: "all",
      plan: {
        anchor: destination,
        range: { start: destination, end: destination },
        values: [["after"]],
      },
      contents: [[{ kind: "literal", value: "after" }]],
      styles: [[{ bold: true }]],
      notes: [[{ text: "replace" }]],
    });
    expect(getCellStyle(sheet, destination)).toEqual({ unlocked: true, italic: true });
    expect(getCellNote(sheet, destination)?.text).toBe("keep");
    expect(getCellContent(sheet, destination)).toEqual({ kind: "literal", value: "after" });
    undoWorkbookCommand(session);
    expect(getCellContent(sheet, destination)).toEqual({ kind: "literal", value: "before" });
    expect(getCellStyle(sheet, destination)?.unlocked).toBe(true);
  });

  test("copies named style and hyperlink metadata with ordinary cell content", () => {
    const sheet = getActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() }));
    const source = { row: 0, column: 0 };
    const destination = { row: 2, column: 3 };
    setCellValue(sheet, source, "source");
    setCellNamedStyle(
      sheet,
      source,
      { bold: true },
      { styleId: "source-style", includes: ["font"] },
    );
    setCellHyperlink(sheet, source, { target: "https://example.com/source" });
    setCellNote(sheet, source, { text: "source note", author: "Ada" });
    setCellValue(sheet, destination, "destination");
    setCellNamedStyle(
      sheet,
      destination,
      { italic: true },
      { styleId: "destination-style", includes: ["font"] },
    );
    setCellHyperlink(sheet, destination, { target: "https://example.com/destination" });
    setCellNote(sheet, destination, { text: "destination note" });

    const session = execute(sheet, {
      kind: "all",
      plan: {
        anchor: destination,
        range: { start: destination, end: destination },
        values: [["source"]],
      },
      contents: [[{ kind: "literal", value: "source" }]],
      sourceRange: { start: source, end: source },
      styles: [[{ bold: true }]],
      namedStyles: [[{ styleId: "source-style", includes: ["font"] }]],
      hyperlinks: [[{ target: "https://example.com/source" }]],
      notes: [[{ text: "source note", author: "Ada" }]],
    });

    expect(getCellNamedStyle(sheet, destination)).toEqual({
      styleId: "source-style",
      includes: ["font"],
    });
    expect(getCellHyperlink(sheet, destination)).toEqual({ target: "https://example.com/source" });
    expect(getCellNote(sheet, destination)).toEqual({ text: "source note", author: "Ada" });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellNamedStyle(sheet, destination)).toEqual({
      styleId: "destination-style",
      includes: ["font"],
    });
    expect(getCellHyperlink(sheet, destination)).toEqual({
      target: "https://example.com/destination",
    });
    expect(getCellNote(sheet, destination)).toEqual({ text: "destination note" });
  });

  test("keeps target metadata for values only and retains its hyperlink for formats only", () => {
    const sheet = getActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() }));
    const address = { row: 2, column: 3 };
    setCellValue(sheet, address, "before");
    setCellNamedStyle(
      sheet,
      address,
      { italic: true },
      { styleId: "target-style", includes: ["font"] },
    );
    setCellHyperlink(sheet, address, { target: "https://example.com/target" });
    setCellNote(sheet, address, { text: "target note" });

    execute(sheet, {
      kind: "values",
      plan: { anchor: address, range: { start: address, end: address }, values: [[42]] },
    });
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: 42 });
    expect(getCellNamedStyle(sheet, address)).toEqual({
      styleId: "target-style",
      includes: ["font"],
    });
    expect(getCellHyperlink(sheet, address)).toEqual({ target: "https://example.com/target" });
    expect(getCellNote(sheet, address)).toEqual({ text: "target note" });

    execute(sheet, {
      kind: "formats",
      plan: { anchor: address, range: { start: address, end: address }, values: [[null]] },
      styles: [[{ bold: true }]],
      namedStyles: [[{ styleId: "source-style", includes: ["font"] }]],
    });
    expect(getCellNamedStyle(sheet, address)).toEqual({
      styleId: "source-style",
      includes: ["font"],
    });
    expect(getCellHyperlink(sheet, address)).toEqual({ target: "https://example.com/target" });
    expect(getCellNote(sheet, address)).toEqual({ text: "target note" });
  });

  test("clears sparse destination column tail cells represented by a whole-column copy", () => {
    const sheet = getActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() }));
    setCellValue(sheet, { row: 2, column: 1 }, "source");
    setCellValue(sheet, { row: 5, column: 4 }, "destination tail");
    setCellStyle(sheet, { row: 5, column: 4 }, { italic: true });
    const emptyRows: CellContentMatrix = Array.from({ length: 6 }, () => [null]);
    emptyRows[2] = [{ kind: "literal", value: "source" }];

    const session = execute(sheet, {
      kind: "all",
      plan: {
        anchor: { row: 0, column: 4 },
        range: { start: { row: 0, column: 4 }, end: { row: 5, column: 4 } },
        values: [[null], [null], ["source"], [null], [null], [null]],
      },
      contents: emptyRows,
      styles: [[null], [null], [null], [null], [null], [null]],
      sourceRange: { start: { row: 0, column: 1 }, end: { row: 5, column: 1 } },
    });

    expect(getCellContent(sheet, { row: 2, column: 4 })).toEqual({
      kind: "literal",
      value: "source",
    });
    expect(getCellContent(sheet, { row: 5, column: 4 })).toBeNull();
    expect(getCellStyle(sheet, { row: 5, column: 4 })).toBeUndefined();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 5, column: 4 })).toEqual({
      kind: "literal",
      value: "destination tail",
    });
  });

  test("moves a finite whole-column clipboard rectangle atomically and supports undo", () => {
    const sheet = getActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() }));
    setCellValue(sheet, { row: 2, column: 1 }, "move");
    setCellStyle(sheet, { row: 2, column: 1 }, { bold: true });
    setCellNote(sheet, { row: 2, column: 1 }, { text: "move note" });

    const session = execute(sheet, {
      kind: "all",
      moveSource: { start: { row: 0, column: 1 }, end: { row: 2, column: 1 } },
      plan: {
        anchor: { row: 0, column: 4 },
        range: { start: { row: 0, column: 4 }, end: { row: 2, column: 4 } },
        values: [[null], [null], ["move"]],
      },
    });

    expect(getCellContent(sheet, { row: 2, column: 1 })).toBeNull();
    expect(getCellContent(sheet, { row: 2, column: 4 })).toEqual({
      kind: "literal",
      value: "move",
    });
    expect(getCellStyle(sheet, { row: 2, column: 4 })).toEqual({ bold: true });
    expect(getCellNote(sheet, { row: 2, column: 4 })).toEqual({ text: "move note" });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 2, column: 1 })).toEqual({
      kind: "literal",
      value: "move",
    });
    expect(getCellStyle(sheet, { row: 2, column: 1 })).toEqual({ bold: true });
    expect(getCellNote(sheet, { row: 2, column: 1 })).toEqual({ text: "move note" });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 2, column: 4 })).toEqual({
      kind: "literal",
      value: "move",
    });
  });

  test("uses raw external TSV fields for Text-format targets while preserving ordinary values", () => {
    const sheet = getActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() }));
    const textTarget = { row: 0, column: 0 };
    const numberTarget = { row: 0, column: 1 };
    setCellStyle(sheet, textTarget, { numberFormat: { kind: "text" } });

    const session = execute(sheet, {
      kind: "all",
      plan: {
        anchor: textTarget,
        range: { start: textTarget, end: numberTarget },
        values: [[12, 12]],
      },
      rawTextValues: [["0012", "0012"]],
    });

    expect(getCellContent(sheet, textTarget)).toEqual({ kind: "literal", value: "0012" });
    expect(getCellContent(sheet, numberTarget)).toEqual({ kind: "literal", value: 12 });
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, textTarget)).toBeNull();
  });

  test("maps formulas using real non-contiguous source rows and tiles them across visible targets", () => {
    const sheet = createFilteredSheet();
    const payload: GridPastePayload = {
      kind: "all",
      plan: filteredPlan([5, 7, 9, 11], 4),
      sourceRange: { start: { row: 1, column: 1 }, end: { row: 3, column: 1 } },
      sourceRows: [1, 3],
      contents: [
        [{ kind: "formula", formula: { source: "=A2+$A2+A$1+$A$1" } }],
        [{ kind: "formula", formula: { source: "=A4+$A4+A$1+$A$1" } }],
      ],
      styles: [[{ bold: true }], [{ italic: true }], [{ bold: true }], [{ italic: true }]],
    };

    const session = execute(sheet, payload);

    expect(getCellContent(sheet, { row: 5, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A6+$A6+A$1+$A$1" },
    });
    expect(getCellContent(sheet, { row: 7, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A8+$A8+A$1+$A$1" },
    });
    expect(getCellContent(sheet, { row: 9, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A10+$A10+A$1+$A$1" },
    });
    expect(getCellStyle(sheet, { row: 7, column: 1 })).toEqual({ italic: true });
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("accepts hidden source-range endpoints while translating from the actual visible source row", () => {
    const sheet = createFilteredSheet();
    const payload: GridPastePayload = {
      kind: "all",
      plan: filteredPlan([5]),
      // Rows 2 and 4 are hidden; row 3 is the copied visible source row.
      sourceRange: { start: { row: 2, column: 1 }, end: { row: 4, column: 1 } },
      sourceRows: [3],
      contents: [[{ kind: "formula", formula: { source: "=A4+$A4+A$1+$A$1" } }]],
    };

    execute(sheet, payload);

    expect(getCellContent(sheet, { row: 5, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A6+$A6+A$1+$A$1" },
    });
  });

  test("uses a captured copy after its source is merged while still rejecting a merged destination", () => {
    const sheet = createFilteredSheet();
    const payload: GridPastePayload = {
      kind: "all",
      plan: {
        anchor: { row: 5, column: 3 },
        range: { start: { row: 5, column: 3 }, end: { row: 5, column: 3 } },
        rows: [5],
        preserveHiddenRows: true,
        values: [["copied"]],
      },
      sourceRange: { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
      contents: [[{ kind: "formula", formula: { source: "=A2" } }]],
      styles: [[{ bold: true }]],
    };
    // This merge was created after Copy; the payload itself is already a complete snapshot.
    sheet.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }];

    execute(sheet, payload);

    expect(getCellContent(sheet, { row: 5, column: 3 })).toEqual({
      kind: "formula",
      formula: { source: "=C6" },
    });
    expect(getCellStyle(sheet, { row: 5, column: 3 })).toEqual({ bold: true });

    sheet.mergedCells = [{ start: { row: 5, column: 3 }, end: { row: 6, column: 4 } }];
    expect(() => createGridPasteCommand(sheet, payload)).toThrow(
      expect.objectContaining({ reason: "mergedRangeUnsupported" }) as GridPasteError,
    );
  });

  test("preserves target formulas for filtered formats and leaves hidden cells and borders untouched", () => {
    const sheet = createFilteredSheet();
    setCellContent(sheet, { row: 5, column: 1 }, { kind: "formula", formula: { source: "=A6" } });
    setCellContent(sheet, { row: 6, column: 1 }, { kind: "literal", value: "hidden" });
    setCellStyle(
      sheet,
      { row: 6, column: 1 },
      { borderRight: { style: "thin", color: "#123456" } },
    );
    const before = serializeWorkbook({
      ...createWorkbook({ id: "workbook", sheetId: sheet.id }),
      activeSheetId: sheet.id,
      sheets: new Map([[sheet.id, sheet]]),
    });
    const payload: GridPastePayload = {
      kind: "formats",
      plan: filteredPlan([5, 7]),
      styles: [[{ bold: true }], [{ italic: true }]],
    };

    const session = execute(sheet, payload);
    const after = serializeWorkbook(session.workbook);

    expect(getCellContent(sheet, { row: 5, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A6" },
    });
    expect(getCellContent(sheet, { row: 6, column: 1 })).toEqual({
      kind: "literal",
      value: "hidden",
    });
    expect(getCellStyle(sheet, { row: 6, column: 1 })).toEqual({
      borderRight: { style: "thin", color: "#123456" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("writes filtered values only to mapped rows and survives serialization with filter, freeze, and outside merge metadata", () => {
    const sheet = createFilteredSheet();
    sheet.freezePanes = { rows: 1, columns: 0 };
    sheet.mergedCells = [{ start: { row: 20, column: 1 }, end: { row: 21, column: 2 } }];
    setCellValue(sheet, { row: 6, column: 1 }, "hidden");
    const payload: GridPastePayload = {
      kind: "values",
      plan: { ...filteredPlan([5, 7]), values: [["first"], ["second"]] },
    };

    const session = execute(sheet, payload);
    const restored = deserializeWorkbook(serializeWorkbook(session.workbook));
    const restoredSheet = getActiveSheet(restored);

    expect(getCellContent(sheet, { row: 5, column: 1 })).toEqual({
      kind: "literal",
      value: "first",
    });
    expect(getCellContent(sheet, { row: 7, column: 1 })).toEqual({
      kind: "literal",
      value: "second",
    });
    expect(getCellContent(sheet, { row: 6, column: 1 })).toEqual({
      kind: "literal",
      value: "hidden",
    });
    expect(restoredSheet.filter).toEqual(sheet.filter);
    expect(restoredSheet.freezePanes).toEqual({ rows: 1, columns: 0 });
    expect(restoredSheet.mergedCells).toEqual(sheet.mergedCells);
  });

  test("rejects malformed sparse plans and merged targets before they create history", () => {
    const sheet = createFilteredSheet();
    const malformed: GridPastePayload = {
      kind: "values",
      plan: { ...filteredPlan([7, 5]), values: [["one"], ["two"]] },
    };
    expect(() => createGridPasteCommand(sheet, malformed)).toThrow(
      expect.objectContaining({ reason: "rangeMismatch" }) as GridPasteError,
    );

    sheet.mergedCells = [{ start: { row: 20, column: 1 }, end: { row: 21, column: 2 } }];
    const merged: GridPastePayload = {
      kind: "values",
      plan: {
        anchor: { row: 20, column: 1 },
        range: { start: { row: 20, column: 1 }, end: { row: 20, column: 1 } },
        values: [["blocked"]],
      },
    };
    expect(() => createGridPasteCommand(sheet, merged)).toThrow(
      expect.objectContaining({ reason: "mergedRangeUnsupported" }) as GridPasteError,
    );
  });

  test("rejects a cut touching a hidden row without mutating its cells, borders, formulas, or history", () => {
    const sheet = createFilteredSheet();
    setCellContent(sheet, { row: 6, column: 1 }, { kind: "formula", formula: { source: "=A7" } });
    setCellStyle(sheet, { row: 6, column: 1 }, { borderTop: { style: "thin", color: "#123456" } });
    const workbook = {
      ...createWorkbook({ id: "workbook", sheetId: sheet.id }),
      activeSheetId: sheet.id,
      sheets: new Map([[sheet.id, sheet]]),
    };
    const session = {
      workbook,
      history: createWorkbookHistory(),
      idFactory: createSequentialIdFactory(),
    };
    const before = serializeWorkbook(workbook);
    const payload: GridPastePayload = {
      kind: "all",
      plan: filteredPlan([5, 7]),
      moveSource: { start: { row: 1, column: 1 }, end: { row: 3, column: 1 } },
    };

    expect(() => createGridPasteCommand(sheet, payload)).toThrow(
      expect.objectContaining({ reason: "filteredCutUnsupported" }) as GridPasteError,
    );
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(0);
    expect(getCellContent(sheet, { row: 6, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A7" },
    });
    expect(getCellStyle(sheet, { row: 6, column: 1 })).toEqual({
      borderTop: { style: "thin", color: "#123456" },
    });
  });
});
