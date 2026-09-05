import { describe, expect, test } from "vitest";
import {
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
  getCellStyle,
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
    history: { undoStack: [], redoStack: [], maxEntries: 100 },
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
      history: { undoStack: [], redoStack: [], maxEntries: 100 },
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
