import { describe, expect, test } from "vitest";
import {
  createBatchSetCellContentsCommand,
  createMergeCellsCommand,
  createApplyCellStyleCommand,
  createApplyCellBordersCommand,
  createSetCellContentCommand,
  createSetSheetFreezePanesCommand,
  createUnmergeCellsCommand,
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
