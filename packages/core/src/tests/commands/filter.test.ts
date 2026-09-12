import { describe, expect, test } from "vitest";
import {
  createClearSheetFilterCommand,
  createSetSheetFilterCriteriaCommand,
  createSetSheetFilterCommand,
  createSheetFilterHiddenRowIntervals,
  getSheetFilterColumnDistinctValues,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { MAX_SHEET_ROWS, getActiveSheet, setCellContent } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("sheet filter commands", () => {
  test("stores filter criteria with a full-state inverse and transport-safe command", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const command = createSetSheetFilterCriteriaCommand(
      sheet.id,
      { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
      [{ column: 0, allowedValues: [{ kind: "number", value: 1 }] }],
    );
    expect(structuredClone(command)).toEqual(command);
    expect(JSON.parse(JSON.stringify(command))).toEqual(command);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.filter).toEqual({
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
      columns: [{ column: 0, allowedValues: [{ kind: "number", value: 1 }] }],
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.filter).toBeNull();
    expect(executeWorkbookCommand(session, createClearSheetFilterCommand(sheet.id))).toBe(false);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.filter).toEqual({
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
      columns: [{ column: 0, allowedValues: [{ kind: "number", value: 1 }] }],
    });
  });

  test("matches computed values with OR-within-column, AND-across-columns, errors, and blanks", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "keep" });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "formula", formula: { source: "=A2" } });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: "keep" });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "formula", formula: { source: "=1/0" } });
    setCellContent(sheet, { row: 3, column: 1 }, { kind: "literal", value: "keep" });
    setCellContent(sheet, { row: 4, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 4, column: 1 }, { kind: "literal", value: "drop" });

    executeWorkbookCommand(
      session,
      createSetSheetFilterCommand(sheet.id, {
        range: { start: { row: 0, column: 0 }, end: { row: 5, column: 1 } },
        columns: [
          {
            column: 0,
            allowedValues: [
              { kind: "number", value: 1 },
              { kind: "error", code: "DIV0" },
            ],
          },
          { column: 1, allowedValues: [{ kind: "string", value: "keep" }] },
        ],
      }),
    );
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 4, end: 5 }]);
  });

  test("hides all data rows for an empty criterion and none when no criterion exists", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetSheetFilterCommand(sheet.id, {
        range: { start: { row: 4, column: 0 }, end: { row: 8, column: 0 } },
        columns: [{ column: 0, allowedValues: [] }],
      }),
    );
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 5, end: 8 }]);
    executeWorkbookCommand(
      session,
      createSetSheetFilterCommand(sheet.id, {
        range: { start: { row: 4, column: 0 }, end: { row: 8, column: 0 } },
        columns: [],
      }),
    );
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([]);
  });

  test("derives distinct values without an invented blank for a fully populated column", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "b" });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: "a" });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "literal", value: "c" });

    expect(
      getSheetFilterColumnDistinctValues(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
        0,
      ),
    ).toEqual([
      { kind: "string", value: "a" },
      { kind: "string", value: "b" },
      { kind: "string", value: "c" },
    ]);
  });

  test("derives literal, formula, error, and image values with evaluator-equivalent semantics", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "text" });
    setCellContent(
      sheet,
      { row: 2, column: 0 },
      {
        kind: "formula",
        formula: { source: "=1+2" },
      },
    );
    setCellContent(
      sheet,
      { row: 3, column: 0 },
      {
        kind: "error",
        error: { kind: "formula-error", code: "NA" },
      },
    );
    setCellContent(
      sheet,
      { row: 4, column: 0 },
      {
        kind: "image",
        image: { assetId: "image", altText: "Diagram" },
      },
    );

    expect(
      getSheetFilterColumnDistinctValues(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
        0,
      ),
    ).toEqual([
      { kind: "error", code: "NA" },
      { kind: "error", code: "VALUE" },
      { kind: "number", value: 3 },
      { kind: "string", value: "text" },
    ]);
  });

  test("normalizes public distinct-value ranges and rejects invalid bounds or columns", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "value" });

    expect(
      getSheetFilterColumnDistinctValues(
        sheet,
        { start: { row: 2, column: 0 }, end: { row: 0, column: 0 } },
        0,
      ),
    ).toEqual([{ kind: "blank" }, { kind: "string", value: "value" }]);
    expect(() =>
      getSheetFilterColumnDistinctValues(
        sheet,
        { start: { row: -1, column: 0 }, end: { row: 2, column: 0 } },
        0,
      ),
    ).toThrow();
    expect(() =>
      getSheetFilterColumnDistinctValues(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
        0.5,
      ),
    ).toThrow();
    expect(() =>
      getSheetFilterColumnDistinctValues(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
        1,
      ),
    ).toThrow(RangeError);
  });

  test("keeps hidden intervals sparse across a million rows and refreshes formula dependencies", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(
      sheet,
      { row: MAX_SHEET_ROWS - 1, column: 0 },
      { kind: "formula", formula: { source: "=A2" } },
    );
    executeWorkbookCommand(
      session,
      createSetSheetFilterCommand(sheet.id, {
        range: {
          start: { row: 0, column: 0 },
          end: { row: MAX_SHEET_ROWS - 1, column: 0 },
        },
        columns: [{ column: 0, allowedValues: [{ kind: "number", value: 1 }] }],
      }),
    );
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([
      { start: 2, end: MAX_SHEET_ROWS - 2 },
    ]);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 2 });
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([
      { start: 1, end: MAX_SHEET_ROWS - 1 },
    ]);
  });

  test("rejects malformed filter payloads atomically without treating them as clears", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetSheetFilterCriteriaCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
        [],
      ),
    );
    const before = structuredClone(sheet.filter);
    const malformedFilters = [
      undefined,
      false,
      {},
      { range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }, columns: [] },
    ];
    for (const filter of malformedFilters) {
      const result = tryApplyWorkbookCommand(session.workbook, {
        type: "setSheetFilter",
        sheetId: sheet.id,
        filter,
      } as never);
      expect(result).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
      expect(sheet.filter).toEqual(before);
    }
  });
});
