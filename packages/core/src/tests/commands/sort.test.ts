import { describe, expect, test } from "vitest";
import {
  createMultiKeySortSheetRangeCommand,
  createSortSheetRangeCommand,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createSheetSparseState,
  createSheet,
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
  setSheetMetadata,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("sheet range sorting", () => {
  test("rejects sorting across an active advanced filter range", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: {
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
        columns: [],
        advanced: { uniqueOnly: false, hiddenRows: [{ start: 1, end: 1 }] },
      },
      mergedCells: [],
    });
    expect(() =>
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
          0,
        ),
      ),
    ).toThrow("advanced filter");
  });

  test("keeps a header fixed and resolves equal primary keys by a second key", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, values] of [
      [0, ["Name", "Score"]],
      [1, ["B", 1]],
      [2, ["A", 1]],
      [3, ["C", 2]],
    ] as const) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: values[0] });
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: values[1] });
    }
    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
          [
            { column: 1, direction: "ascending" },
            { column: 0, direction: "ascending" },
          ],
          { hasHeader: true },
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "Name",
    });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({ kind: "literal", value: "A" });
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({ kind: "literal", value: "B" });
    expect(getCellContent(sheet, { row: 3, column: 0 })).toEqual({ kind: "literal", value: "C" });
  });

  test("sorts text without case sensitivity in both directions while keeping equal values stable", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of ["a", "B", "A", "b"].entries()) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
    }

    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
          [{ column: 0, direction: "ascending" }],
          { caseSensitive: false },
        ),
      ),
    ).toBe(true);
    expect([0, 1, 2, 3].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: "a" },
      { kind: "literal", value: "A" },
      { kind: "literal", value: "B" },
      { kind: "literal", value: "b" },
    ]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);

    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
          [{ column: 0, direction: "descending" }],
          { caseSensitive: false },
        ),
      ),
    ).toBe(true);
    expect([0, 1, 2, 3].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: "B" },
      { kind: "literal", value: "b" },
      { kind: "literal", value: "a" },
      { kind: "literal", value: "A" },
    ]);
  });

  test("preserves case-sensitive ordering when requested explicitly", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "a" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "A" });

    executeWorkbookCommand(
      session,
      createMultiKeySortSheetRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        [{ column: 0, direction: "ascending" }],
        { caseSensitive: true },
      ),
    );
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: "A" });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({ kind: "literal", value: "a" });
  });

  test("uses the next sort key after case-insensitive text ties", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, [name, score]] of (
      [
        ["a", 2],
        ["A", 1],
        ["a", 1],
        ["B", 1],
      ] as const
    ).entries()) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: name });
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: score });
    }

    executeWorkbookCommand(
      session,
      createMultiKeySortSheetRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
        [
          { column: 0, direction: "ascending" },
          { column: 1, direction: "ascending" },
        ],
        { caseSensitive: false },
      ),
    );
    expect([0, 1, 2, 3].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: "A" },
      { kind: "literal", value: "a" },
      { kind: "literal", value: "a" },
      { kind: "literal", value: "B" },
    ]);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({ kind: "literal", value: 1 });
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({ kind: "literal", value: 1 });
  });

  test("orders computed keys deterministically by type and keeps blanks last in descending order", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "a" });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: false });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "formula", formula: { source: "=1/0" } });
    setCellContent(sheet, { row: 4, column: 0 }, { kind: "literal", value: 2 });

    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 5, column: 0 } },
          0,
          "descending",
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: 2 });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({ kind: "literal", value: 1 });
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({ kind: "literal", value: "a" });
    expect(getCellContent(sheet, { row: 3, column: 0 })).toEqual({ kind: "literal", value: false });
    expect(getCellContent(sheet, { row: 4, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=1/0" },
    });
    expect(getCellContent(sheet, { row: 5, column: 0 })).toBeNull();
  });

  test("moves raw styles and formulas by row delta without rewriting external formulas", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1" } });
    setCellStyle(sheet, { row: 0, column: 1 }, { bold: true });
    setCellContent(sheet, { row: 5, column: 2 }, { kind: "formula", formula: { source: "=A1" } });
    const before = createSheetSparseState(sheet);

    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
          0,
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A2" },
    });
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toEqual({ bold: true });
    expect(getCellContent(sheet, { row: 5, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=A1" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
  });

  test("sorts by cross-sheet formula results", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const inputs = createSheet("Inputs", "inputs");
    session.workbook.sheets.set(inputs.id, inputs);
    setCellContent(inputs, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(inputs, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Inputs!A1" },
      },
    );
    setCellContent(
      sheet,
      { row: 1, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Inputs!A2" },
      },
    );
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "two" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "one" });

    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
          0,
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
      kind: "literal",
      value: "one",
    });
  });

  test("keeps the sort inverse compact when the sheet has unrelated sparse cells", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    for (let row = 10; row < 1_010; row += 1) {
      setCellContent(sheet, { row, column: 20 }, { kind: "literal", value: row });
    }
    const before = createSheetSparseState(sheet);

    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          0,
        ),
      ),
    ).toBe(true);

    const inverse = session.history.undoStack.at(-1)?.command;
    expect(inverse?.type).toBe("setCellContents");
    if (inverse?.type !== "setCellContents") throw new Error("Expected a cell-range inverse.");
    expect(inverse.changes.length).toBeLessThan(10);
    expect(
      inverse.changes.every((change) => change.address.row <= 2 && change.address.column <= 1),
    ).toBe(true);
    expect(JSON.parse(JSON.stringify(inverse))).toEqual(inverse);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("allows only the complete data rectangle for an intersecting active filter", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: 1 });
    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: {
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        columns: [{ column: 0, allowedValues: [{ kind: "number", value: 1 }] }],
      },
      mergedCells: [],
    });
    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 1, column: 0 }, end: { row: 2, column: 1 } },
          0,
        ),
      ),
    ).toBe(true);
    const beforeRejected = createSheetSparseState(sheet);
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 1, column: 0 }, end: { row: 1, column: 1 } },
          0,
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(sheet)).toEqual(beforeRejected);
  });

  test("rejects merged intersections, malformed commands, and identity sorting without history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 2 });
    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          0,
        ),
      ),
    ).toBe(false);
    sheet.mergedCells = [{ start: { row: 3, column: 0 }, end: { row: 4, column: 0 } }];
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 3, column: 0 }, end: { row: 4, column: 0 } },
          0,
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(
      tryApplyWorkbookCommand(session.workbook, {
        type: "sortSheetRange",
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        keyColumn: 2,
        direction: "sideways",
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    const beforeInvalidCaseSensitive = createSheetSparseState(sheet);
    expect(
      tryApplyWorkbookCommand(session.workbook, {
        type: "sortSheetRange",
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        keyColumn: 0,
        direction: "ascending",
        caseSensitive: "no",
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(sheet)).toEqual(beforeInvalidCaseSensitive);
  });
});
