import { describe, expect, test } from "vitest";
import {
  createClearSheetFilterCommand,
  createSetSheetFilterCriteriaCommand,
  createSetSheetFilterCommand,
  createSheetFilterHiddenRowIntervals,
  getSheetFilterColumnDistinctValues,
  getSheetFilterColumnValueCounts,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  MAX_SHEET_ROWS,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
} from "../../workbook.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("sheet filter commands", () => {
  test("counts computed duplicates and sparse blanks without scanning a million empty rows", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 10 });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "formula", formula: { source: "=A2" } });
    setCellContent(sheet, { row: 4, column: 0 }, { kind: "literal", value: "2" });
    const values = getSheetFilterColumnValueCounts(
      sheet,
      {
        start: { row: 0, column: 0 },
        end: { row: MAX_SHEET_ROWS - 1, column: 0 },
      },
      0,
    );
    expect(values.map(({ value, count }) => ({ value, count }))).toEqual([
      { value: { kind: "number", value: 2 }, count: 1 },
      { value: { kind: "number", value: 10 }, count: 2 },
      { value: { kind: "string", value: "2" }, count: 1 },
      { value: { kind: "blank" }, count: MAX_SHEET_ROWS - 5 },
    ]);
  });
  test("counts typed values and blanks while ignoring this column's active criterion", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 10 });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "literal", value: "1" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "keep" });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: "drop" });
    setCellContent(sheet, { row: 3, column: 1 }, { kind: "literal", value: "keep" });
    executeWorkbookCommand(
      session,
      createSetSheetFilterCommand(sheet.id, {
        range: { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
        columns: [
          { column: 0, allowedValues: [{ kind: "number", value: 10 }] },
          { column: 1, allowedValues: [{ kind: "string", value: "keep" }] },
        ],
      }),
    );
    expect(
      getSheetFilterColumnValueCounts(sheet, sheet.filter!.range, 0).map(({ value, count }) => [
        value,
        count,
      ]),
    ).toEqual([
      [{ kind: "number", value: 10 }, 1],
      [{ kind: "string", value: "1" }, 1],
    ]);
  });
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

  test("filters vertical merged cells as one candidate and one visible row block", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.mergedCells = [{ start: { row: 1, column: 0 }, end: { row: 2, column: 0 } }];
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "keep" });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "literal", value: "drop" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 10 });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: 20 });
    setCellContent(sheet, { row: 3, column: 1 }, { kind: "literal", value: 30 });
    const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } };
    const columns = [{ column: 0, allowedValues: [{ kind: "string" as const, value: "drop" }] }];

    expect(
      getSheetFilterColumnValueCounts(sheet, range, 0, undefined, { allowMergedCells: true }).map(
        ({ value, count }) => [value, count],
      ),
    ).toEqual([
      [{ kind: "string", value: "drop" }, 1],
      [{ kind: "string", value: "keep" }, 1],
    ]);
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createSetSheetFilterCriteriaCommand(sheet.id, range, columns, { allowMergedCells: false }),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });

    executeWorkbookCommand(
      session,
      createSetSheetFilterCriteriaCommand(sheet.id, range, columns, { allowMergedCells: true }),
    );
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 1, end: 2 }]);
    setCellContent(
      sheet,
      { row: 0, column: 2 },
      { kind: "formula", formula: { source: "=SUBTOTAL(9,B2:B4)" } },
    );
    expect(
      createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({ row: 0, column: 2 }),
    ).toBe(30);
    expect(sheet.filter?.allowMergedCells).toBe(true);
    expect(
      deserializeWorkbook(serializeWorkbook(session.workbook)).sheets.get(sheet.id)?.filter,
    ).toMatchObject({ allowMergedCells: true });
    undoWorkbookCommand(session);
    expect(sheet.filter).toBeNull();
    redoWorkbookCommand(session);
    expect(sheet.filter?.allowMergedCells).toBe(true);
  });

  test("counts a merged candidate only when its connected block matches other criteria", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.mergedCells = [{ start: { row: 1, column: 0 }, end: { row: 2, column: 0 } }];
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "East" });
    const range = { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } };
    const otherCriterion = [
      { column: 1, allowedValues: [{ kind: "string" as const, value: "OK" }] },
    ];
    executeWorkbookCommand(
      session,
      createSetSheetFilterCriteriaCommand(sheet.id, range, otherCriterion, {
        allowMergedCells: true,
      }),
    );

    for (const [first, second] of [
      ["OK", "NO"],
      ["NO", "OK"],
    ] as const) {
      setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: first });
      setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: second });
      expect(getSheetFilterColumnValueCounts(sheet, range, 0)).toEqual([]);
    }

    executeWorkbookCommand(
      session,
      createSetSheetFilterCriteriaCommand(
        sheet.id,
        range,
        [{ column: 0, allowedValues: [{ kind: "string", value: "East" }] }, ...otherCriterion],
        { allowMergedCells: true },
      ),
    );
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 1, end: 2 }]);

    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "OK" });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: "OK" });
    expect(
      getSheetFilterColumnValueCounts(sheet, range, 0).map(({ value, count }) => [value, count]),
    ).toEqual([[{ kind: "string", value: "East" }, 1]]);
    executeWorkbookCommand(
      session,
      createSetSheetFilterCriteriaCommand(
        sheet.id,
        range,
        [{ column: 0, allowedValues: [{ kind: "string", value: "East" }] }, ...otherCriterion],
        { allowMergedCells: true },
      ),
    );
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([]);
  });

  test("allows an explicit merged-filter opt-out when merges are outside criterion data cells", () => {
    const unrelated = createTestWorkbookSession();
    const unrelatedSheet = getActiveSheet(unrelated.workbook);
    unrelatedSheet.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 2, column: 1 } }];
    expect(
      executeWorkbookCommand(
        unrelated,
        createSetSheetFilterCriteriaCommand(
          unrelatedSheet.id,
          { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
          [{ column: 0, allowedValues: [{ kind: "blank" }] }],
          { allowMergedCells: false },
        ),
      ),
    ).toBe(true);

    const headerOnly = createTestWorkbookSession();
    const headerOnlySheet = getActiveSheet(headerOnly.workbook);
    headerOnlySheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 0, column: 1 } }];
    expect(
      executeWorkbookCommand(
        headerOnly,
        createSetSheetFilterCriteriaCommand(
          headerOnlySheet.id,
          { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
          [{ column: 0, allowedValues: [{ kind: "blank" }] }],
          { allowMergedCells: false },
        ),
      ),
    ).toBe(true);
  });

  test("coalesces overlapping merged filter blocks consistently for hidden rows and SUBTOTAL", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    // Deliberately reverse source order: behavior must follow row connectivity, not insertion order.
    sheet.mergedCells = [
      { start: { row: 2, column: 1 }, end: { row: 3, column: 1 } },
      { start: { row: 1, column: 0 }, end: { row: 2, column: 0 } },
    ];
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "keep" });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "literal", value: "keep" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "keep" });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: "drop" });
    for (let row = 1; row <= 3; row += 1)
      setCellContent(sheet, { row, column: 2 }, { kind: "literal", value: 10 });
    executeWorkbookCommand(
      session,
      createSetSheetFilterCriteriaCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
        [
          { column: 0, allowedValues: [{ kind: "string", value: "keep" }] },
          { column: 1, allowedValues: [{ kind: "string", value: "keep" }] },
        ],
        { allowMergedCells: true },
      ),
    );
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 1, end: 3 }]);
    setCellContent(
      sheet,
      { row: 0, column: 3 },
      { kind: "formula", formula: { source: "=SUBTOTAL(9,C2:C4)" } },
    );
    expect(
      createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({ row: 0, column: 3 }),
    ).toBe(0);
  });

  test("keeps advanced filter metadata isolated when setting a filter", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
      columns: [],
      advanced: {
        criteria: {
          sheetId: "criteria",
          range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        },
        uniqueOnly: true,
        hiddenRows: [{ start: 2, end: 3 }],
      },
    };
    expect(executeWorkbookCommand(session, createSetSheetFilterCommand(sheet.id, filter))).toBe(
      true,
    );
    filter.advanced.hiddenRows[0]!.start = 1;
    filter.advanced.criteria!.range.start.row = 4;
    expect(sheet.filter?.advanced).toEqual({
      criteria: {
        sheetId: "criteria",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      },
      uniqueOnly: true,
      hiddenRows: [{ start: 2, end: 3 }],
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
      {
        range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        columns: [],
      },
    ];
    for (const filter of malformedFilters) {
      const result = tryApplyWorkbookCommand(session.workbook, {
        type: "setSheetFilter",
        sheetId: sheet.id,
        filter,
      } as never);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid_command_payload" },
      });
      expect(sheet.filter).toEqual(before);
    }
  });
});
