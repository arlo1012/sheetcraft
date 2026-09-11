import { describe, expect, test } from "vitest";
import {
  createBatchSetCellContentsCommand,
  createMergeCellsCommand,
  createApplyCellStyleCommand,
  createApplyCellBordersCommand,
  createSetCellContentCommand,
  createSetSheetFreezePanesCommand,
  createUnmergeCellsCommand,
  getCellMergeModeAvailability,
  tryApplyWorkbookCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createSheetSparseState,
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
  setSheetMetadata,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("sheet metadata commands", () => {
  test("merges with the top-left anchor, clears subordinate sparse cells, and restores exactly", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "anchor" });
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: "discarded" });

    expect(
      executeWorkbookCommand(
        session,
        createMergeCellsCommand(sheet.id, {
          start: { row: 1, column: 1 },
          end: { row: 2, column: 2 },
        }),
      ),
    ).toBe(true);
    expect(sheet.mergedCells).toEqual([
      { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } },
    ]);
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({
      kind: "literal",
      value: "anchor",
    });
    expect(getCellContent(sheet, { row: 1, column: 2 })).toBeNull();

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({
      kind: "literal",
      value: "discarded",
    });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 1, column: 2 })).toBeNull();
  });

  test("merges and centers in one reversible command", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } };
    setCellContent(sheet, range.start, { kind: "literal", value: "anchor" });
    setCellStyle(sheet, range.start, { bold: true, horizontalAlign: "left" });
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: "removed" });

    expect(
      executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range, "center")),
    ).toBe(true);
    expect(sheet.mergedCells).toEqual([range]);
    expect(getCellStyle(sheet, range.start)).toEqual({ bold: true, horizontalAlign: "center" });
    expect(getCellContent(sheet, { row: 1, column: 2 })).toBeNull();

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, range.start)).toEqual({ bold: true, horizontalAlign: "left" });
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({
      kind: "literal",
      value: "removed",
    });
  });

  test("merges across each selected row atomically without crossing a row freeze boundary", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 0, column: 1 }, end: { row: 1, column: 3 } };
    sheet.freezePanes = { rows: 1, columns: 0 };
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "first" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: "discarded" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "second" });
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        borderTop: { style: "thin", color: "#111111" },
        borderBottom: { style: "double", color: "#222222" },
        borderLeft: { style: "dashed", color: "#333333" },
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 3 },
      {
        borderRight: { style: "medium", color: "#444444" },
      },
    );
    setCellStyle(
      sheet,
      { row: 1, column: 3 },
      {
        borderRight: { style: "thick", color: "#555555" },
      },
    );

    expect(
      executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range, "across")),
    ).toBe(true);
    expect(sheet.mergedCells).toEqual([
      { start: { row: 0, column: 1 }, end: { row: 0, column: 3 } },
      { start: { row: 1, column: 1 }, end: { row: 1, column: 3 } },
    ]);
    expect(getCellContent(sheet, { row: 0, column: 2 })).toBeNull();
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({
      kind: "literal",
      value: "second",
    });
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toMatchObject({
      borderTop: { style: "thin", color: "#111111" },
      borderBottom: { style: "double", color: "#222222" },
      borderLeft: { style: "dashed", color: "#333333" },
      borderRight: { style: "medium", color: "#444444" },
    });
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toMatchObject({
      borderRight: { style: "thick", color: "#555555" },
    });

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.mergedCells).toEqual([]);
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({
      kind: "literal",
      value: "discarded",
    });
    expect(getCellStyle(sheet, { row: 0, column: 3 })).toEqual({
      borderRight: { style: "medium", color: "#444444" },
    });
  });

  test("merges equal computed values in vertical or horizontal runs only", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "a" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "formula", formula: { source: '="a"' } });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: "b" });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "literal", value: "b" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "same" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: "same" });
    setCellContent(sheet, { row: 0, column: 3 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 0, column: 4 }, { kind: "literal", value: "1" });

    expect(
      executeWorkbookCommand(
        session,
        createMergeCellsCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
          "same-columns",
        ),
      ),
    ).toBe(true);
    expect(sheet.mergedCells).toEqual([
      { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      { start: { row: 2, column: 0 }, end: { row: 3, column: 0 } },
    ]);
    expect(
      executeWorkbookCommand(
        session,
        createMergeCellsCommand(
          sheet.id,
          { start: { row: 0, column: 1 }, end: { row: 0, column: 4 } },
          "same-rows",
        ),
      ),
    ).toBe(true);
    expect(sheet.mergedCells).toContainEqual({
      start: { row: 0, column: 1 },
      end: { row: 0, column: 2 },
    });
  });

  test("merges row-major formatted content with newline delimiters", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 5, column: 0 }, end: { row: 6, column: 1 } };
    setCellContent(sheet, { row: 5, column: 0 }, { kind: "literal", value: "first" });
    setCellContent(sheet, { row: 5, column: 1 }, { kind: "literal", value: 2 });
    setCellStyle(
      sheet,
      { row: 5, column: 1 },
      { numberFormat: { kind: "number", fractionDigits: 2 } },
    );
    setCellContent(sheet, { row: 6, column: 1 }, { kind: "literal", value: "last" });

    expect(
      executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range, "content", "en-US")),
    ).toBe(true);
    expect(getCellContent(sheet, range.start)).toEqual({
      kind: "literal",
      value: "first\n2.00\nlast",
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 5, column: 1 })).toEqual({ kind: "literal", value: 2 });
  });

  test("rejects same or content merges containing a cell image without mutation", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 8, column: 0 }, end: { row: 8, column: 1 } };
    setCellContent(sheet, range.start, {
      kind: "image",
      image: { assetId: "image-1", altText: "chart" },
    });
    const before = createSheetSparseState(sheet);

    expect(getCellMergeModeAvailability(sheet, range, "content")).toBe(false);
    expect(() =>
      executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range, "content")),
    ).toThrow();
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("bounds content, equal-value, and across merge planning", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 0, column: 0 }, end: { row: 100, column: 999 } };

    expect(getCellMergeModeAvailability(sheet, range, "content")).toBe(false);
    expect(() =>
      executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range, "across")),
    ).toThrow();
  });

  test("rejects frozen boundaries and filter ranges that cut through a merge", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createMergeCellsCommand(sheet.id, {
        start: { row: 2, column: 2 },
        end: { row: 3, column: 3 },
      }),
    );
    expect(() =>
      executeWorkbookCommand(
        session,
        createSetSheetFreezePanesCommand(sheet.id, { rows: 3, columns: 0 }),
      ),
    ).toThrow("cannot cut through");
  });

  test("unmerges all ranges intersecting a selected range", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createMergeCellsCommand(sheet.id, {
        start: { row: 1, column: 1 },
        end: { row: 1, column: 2 },
      }),
    );
    expect(
      executeWorkbookCommand(
        session,
        createUnmergeCellsCommand(sheet.id, {
          start: { row: 1, column: 2 },
          end: { row: 1, column: 2 },
        }),
      ),
    ).toBe(true);
    expect(sheet.mergedCells).toEqual([]);
  });

  test("routes a direct edit of a merge tail to its anchor", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createMergeCellsCommand(sheet.id, {
        start: { row: 4, column: 4 },
        end: { row: 4, column: 5 },
      }),
    );

    expect(
      executeWorkbookCommand(
        session,
        createSetCellContentCommand(
          sheet.id,
          { row: 4, column: 5 },
          { kind: "literal", value: "x" },
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 4, column: 4 })).toEqual({
      kind: "literal",
      value: "x",
    });
    expect(getCellContent(sheet, { row: 4, column: 5 })).toBeNull();
  });

  test("keeps styles on the merge anchor when a formatting range includes a tail", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createMergeCellsCommand(sheet.id, {
        start: { row: 7, column: 1 },
        end: { row: 7, column: 2 },
      }),
    );

    executeWorkbookCommand(
      session,
      createApplyCellStyleCommand(
        sheet.id,
        { start: { row: 7, column: 2 }, end: { row: 7, column: 2 } },
        { bold: true },
      ),
    );
    expect(getCellStyle(sheet, { row: 7, column: 1 })).toEqual({ bold: true });
    expect(getCellStyle(sheet, { row: 7, column: 2 })).toBeUndefined();
  });

  test("normalizes equivalent filter value sets so reordered criteria are a no-op", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    expect(
      setSheetMetadata(sheet, {
        freezePanes: { rows: 0, columns: 0 },
        filter: {
          range: { start: { row: 1, column: 0 }, end: { row: 3, column: 0 } },
          columns: [
            {
              column: 0,
              allowedValues: [
                { kind: "string", value: "z" },
                { kind: "number", value: 2 },
                { kind: "blank" },
              ],
            },
          ],
        },
        mergedCells: [],
      }),
    ).toBe(true);
    expect(
      setSheetMetadata(sheet, {
        freezePanes: { rows: 0, columns: 0 },
        filter: {
          range: { start: { row: 1, column: 0 }, end: { row: 3, column: 0 } },
          columns: [
            {
              column: 0,
              allowedValues: [
                { kind: "blank" },
                { kind: "number", value: 2 },
                { kind: "string", value: "z" },
                { kind: "number", value: 2 },
              ],
            },
          ],
        },
        mergedCells: [],
      }),
    ).toBe(false);
  });

  test("rejects batch updates to merged tails and duplicate addresses before mutating any cell", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createMergeCellsCommand(sheet.id, {
        start: { row: 10, column: 0 },
        end: { row: 10, column: 1 },
      }),
    );
    setCellContent(sheet, { row: 12, column: 0 }, { kind: "literal", value: "unchanged" });
    const before = createSheetSparseState(sheet);

    const tailBatch = createBatchSetCellContentsCommand([
      {
        sheetId: sheet.id,
        address: { row: 10, column: 1 },
        content: { kind: "literal", value: "must-not-reach-anchor" },
      },
      {
        sheetId: sheet.id,
        address: { row: 12, column: 0 },
        content: { kind: "literal", value: "must-not-mutate" },
      },
    ]);
    const duplicateBatch = createBatchSetCellContentsCommand([
      {
        sheetId: sheet.id,
        address: { row: 12, column: 0 },
        content: { kind: "literal", value: "first" },
      },
      {
        sheetId: sheet.id,
        address: { row: 12, column: 0 },
        content: { kind: "literal", value: "second" },
      },
    ]);

    for (const command of [tailBatch, duplicateBatch]) {
      expect(tryApplyWorkbookCommand(session.workbook, command)).toMatchObject({
        ok: false,
        error: { code: "invalid_command_payload" },
      });
      expect(createSheetSparseState(sheet)).toEqual(before);
    }

    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createBatchSetCellContentsCommand([
          {
            sheetId: sheet.id,
            address: { row: 10, column: 0 },
            content: { kind: "literal", value: "anchor-only" },
          },
          {
            sheetId: sheet.id,
            address: { row: 12, column: 0 },
            content: { kind: "literal", value: "updated" },
          },
        ]),
      ),
    ).toMatchObject({ ok: true, changed: true });
    expect(getCellContent(sheet, { row: 10, column: 0 })).toEqual({
      kind: "literal",
      value: "anchor-only",
    });
  });

  test("rejects malformed metadata commands with an invalid command payload and no mutation", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const before = createSheetSparseState(sheet);
    const malformed: WorkbookCommand[] = [
      {
        type: "setSheetFreezePanes",
        sheetId: sheet.id,
        freezePanes: null,
      } as unknown as WorkbookCommand,
      { type: "mergeCells", sheetId: sheet.id, range: null } as unknown as WorkbookCommand,
      {
        type: "mergeCells",
        sheetId: sheet.id,
        range: { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
      } as unknown as WorkbookCommand,
    ];

    for (const command of malformed) {
      expect(tryApplyWorkbookCommand(session.workbook, command)).toMatchObject({
        ok: false,
        error: { code: "invalid_command_payload" },
      });
      expect(createSheetSparseState(sheet)).toEqual(before);
    }
  });

  test("routes border reconciliation cleanup away from adjacent merge tails", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createMergeCellsCommand(sheet.id, {
        start: { row: 20, column: 1 },
        end: { row: 20, column: 2 },
      }),
    );

    executeWorkbookCommand(
      session,
      createBatchSetCellContentsCommand(
        [
          {
            sheetId: sheet.id,
            address: { row: 20, column: 3 },
            content: { kind: "literal", value: "right" },
            style: { borderLeft: { style: "thin", color: "#123456" } },
          },
        ],
        { reconcileBorders: true },
      ),
    );
    executeWorkbookCommand(
      session,
      createApplyCellBordersCommand(
        sheet.id,
        { start: { row: 20, column: 0 }, end: { row: 20, column: 1 } },
        {
          preset: "outer",
          border: { style: "thin", color: "#123456" },
        },
      ),
    );

    expect(getCellStyle(sheet, { row: 20, column: 2 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 20, column: 1 })).toBeDefined();
  });

  test("uses merge index lookups across a large formatted tail batch", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const mergedCells = Array.from({ length: 1_000 }, (_, index) => ({
      start: { row: index * 2, column: 0 },
      end: { row: index * 2, column: 1 },
    }));
    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: null,
      mergedCells,
    });

    expect(
      executeWorkbookCommand(
        session,
        createApplyCellStyleCommand(
          sheet.id,
          { start: { row: 0, column: 1 }, end: { row: 1_998, column: 1 } },
          { italic: true },
        ),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, { row: 1_998, column: 0 })).toEqual({ italic: true });
    expect(getCellStyle(sheet, { row: 1_998, column: 1 })).toBeUndefined();
  });
});
