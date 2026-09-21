import { describe, expect, test } from "vitest";
import {
  createApplySubtotalsCommand,
  createRemoveDuplicatesCommand,
  createRemoveSubtotalsCommand,
  createSetSheetFilterCommand,
  createSplitColumnCommand,
  createSheetFilterHiddenRowIntervals,
  previewSplitColumn,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  createSheet,
  createSheetSparseState,
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "../../workbook.js";
import { datePartsToExcelSerial } from "../../formula/date-system.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("data transforms", () => {
  test("previews selected text qualifiers and merges adjacent delimiters", () => {
    expect(
      previewSplitColumn("'New; York';;;007", {
        mode: "delimiter",
        delimiter: ";",
        textQualifier: "'",
        mergeDelimiters: true,
      }),
    ).toEqual(["New; York", "007"]);
    expect(
      previewSplitColumn('"New,York",007', {
        mode: "delimiter",
        delimiter: ",",
        textQualifier: "none",
      }),
    ).toEqual(['"New', 'York"', "007"]);
    expect(
      previewSplitColumn("O'Brien,007", {
        mode: "delimiter",
        delimiter: ",",
        textQualifier: "'",
      }),
    ).toEqual(["O'Brien", "007"]);
  });

  test("splits quoted delimiters atomically and preserves undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "literal", value: 'Ada,"New York, NY",7' },
    );
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true });
    const before = createSheetSparseState(sheet);
    expect(
      executeWorkbookCommand(
        session,
        createSplitColumnCommand(
          sheet.id,
          0,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 2 } },
          {
            destinationColumn: 0,
            mode: "delimiter",
            delimiter: ",",
            parseQuoted: true,
            overwrite: true,
          },
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
      kind: "literal",
      value: "New York, NY",
    });
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({
      kind: "literal",
      value: 7,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("compresses skipped fields, converts dates, honors destination rows, and undoes", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "literal", value: "ignore,2026-09-21,0042" },
    );
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true });
    const before = createSheetSparseState(sheet);

    expect(
      executeWorkbookCommand(
        session,
        createSplitColumnCommand(
          sheet.id,
          0,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
          {
            destinationColumn: 2,
            destinationRow: 3,
            mode: "delimiter",
            delimiter: ",",
            columnTypes: ["skip", "date", "text"],
          },
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 3, column: 2 })).toEqual({
      kind: "literal",
      value: datePartsToExcelSerial(
        {
          year: 2026,
          month: 9,
          day: 21,
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0,
        },
        session.workbook.dateSystem,
      ),
    });
    expect(getCellStyle(sheet, { row: 3, column: 2 })?.numberFormat).toEqual({
      kind: "date",
      code: "yyyy-mm-dd",
    });
    expect(getCellContent(sheet, { row: 3, column: 3 })).toEqual({
      kind: "literal",
      value: "0042",
    });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "ignore,2026-09-21,0042",
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("snapshots source styles before a downward destination overlaps the source", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "first" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "second" });
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true });
    setCellStyle(sheet, { row: 1, column: 0 }, { italic: true });

    executeWorkbookCommand(
      session,
      createSplitColumnCommand(
        sheet.id,
        0,
        { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        {
          destinationColumn: 0,
          destinationRow: 1,
          mode: "delimiter",
          delimiter: ",",
          overwrite: true,
        },
      ),
    );

    expect(getCellStyle(sheet, { row: 1, column: 0 })).toMatchObject({ bold: true });
    expect(getCellStyle(sheet, { row: 2, column: 0 })).toMatchObject({ italic: true });
  });

  test("rejects an occupied split destination without modifying the sheet", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "A,B" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "keep" });
    const before = createSheetSparseState(sheet);
    expect(() =>
      executeWorkbookCommand(
        session,
        createSplitColumnCommand(
          sheet.id,
          0,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
          { destinationColumn: 0, mode: "delimiter", delimiter: "," },
        ),
      ),
    ).toThrow("overwrite");
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("keeps the first duplicate, compacts only the requested rectangle, and preserves its header", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of [
      [0, "ID"],
      [1, "a"],
      [2, "a"],
      [3, "b"],
    ] as const)
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
    setCellContent(sheet, { row: 2, column: 2 }, { kind: "literal", value: "outside" });
    const before = createSheetSparseState(sheet);
    expect(
      executeWorkbookCommand(
        session,
        createRemoveDuplicatesCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
          [0],
          { hasHeader: true },
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "ID",
    });
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({
      kind: "literal",
      value: "b",
    });
    expect(getCellContent(sheet, { row: 3, column: 0 })).toBeNull();
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({
      kind: "literal",
      value: "outside",
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("evaluates number conditions independently of legacy allowed values", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 4 });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: 8 });
    executeWorkbookCommand(
      session,
      createSetSheetFilterCommand(sheet.id, {
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
        columns: [
          {
            column: 0,
            allowedValues: [],
            condition: { kind: "number", operator: "greaterThan", value: 5 },
          },
        ],
      }),
    );
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 1, end: 1 }]);
  });

  test("inserts group summaries and removes only its recorded summary rows", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, group, amount] of [
      [0, "Group", "Amount"],
      [1, "A", 2],
      [2, "A", 3],
      [3, "B", 4],
    ] as const) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: group });
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: amount });
    }
    setCellContent(sheet, { row: 5, column: 2 }, { kind: "formula", formula: { source: "=B4" } });
    const before = createSheetSparseState(sheet);
    expect(
      executeWorkbookCommand(
        session,
        createApplySubtotalsCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
          [0],
          [1],
          "sum",
          {
            hasHeader: true,
            subtotalId: "test",
            labels: { subtotal: "小计", grandTotal: "总计" },
          },
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 3, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=SUBTOTAL(9,B2:B3)" },
    });
    expect(getCellContent(sheet, { row: 5, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=SUBTOTAL(9,B5:B5)" },
    });
    expect(getCellContent(sheet, { row: 3, column: 0 })).toEqual({
      kind: "literal",
      value: "A 小计",
    });
    expect(getCellContent(sheet, { row: 6, column: 0 })).toEqual({
      kind: "literal",
      value: "总计",
    });
    expect(getCellContent(sheet, { row: 8, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=B5" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(
      executeWorkbookCommand(
        session,
        createApplySubtotalsCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
          [0],
          [1],
          "sum",
          { hasHeader: true, subtotalId: "test" },
        ),
      ),
    ).toBe(true);
    expect(executeWorkbookCommand(session, createRemoveSubtotalsCommand(sheet.id, "test"))).toBe(
      true,
    );
    expect(getCellContent(sheet, { row: 3, column: 1 })).toEqual({
      kind: "literal",
      value: 4,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 3, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=SUBTOTAL(9,B2:B3)" },
    });
  });

  test("updates external formulas and rejects duplicate subtotal IDs atomically", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const other = createSheet("Other", "other");
    session.workbook.sheets.set(other.id, other);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "A" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "A" });
    setCellContent(
      other,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: `=${sheet.name}!A3` } },
    );
    const command = createApplySubtotalsCommand(
      sheet.id,
      { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      [0],
      [0],
      "count",
      { subtotalId: "unique" },
    );
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellContent(other, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: `=${sheet.name}!A5` },
    });
    const before = createSheetSparseState(sheet);
    expect(() => executeWorkbookCommand(session, command)).toThrow("already exists");
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(other, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: `=${sheet.name}!A3` },
    });
  });

  test("removing all subtotals restores shifted external references on undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const other = createSheet("Other", "other");
    session.workbook.sheets.set(other.id, other);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "A" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "A" });
    setCellContent(
      other,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: `=${sheet.name}!A3` } },
    );
    session.workbook.definedNames.set("subtotalTarget", {
      id: "subtotalTarget",
      name: "subtotalTarget",
      reference: {
        sheetId: sheet.id,
        start: { row: 2, column: 0 },
        end: { row: 2, column: 0 },
      },
    });
    expect(
      executeWorkbookCommand(
        session,
        createApplySubtotalsCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          [0],
          [0],
          "count",
          { subtotalId: "remove" },
        ),
      ),
    ).toBe(true);
    expect(getCellContent(other, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: `=${sheet.name}!A5` },
    });
    expect(session.workbook.definedNames.get("subtotalTarget")?.reference.start.row).toBe(4);
    expect(executeWorkbookCommand(session, createRemoveSubtotalsCommand(sheet.id))).toBe(true);
    expect(session.workbook.definedNames.get("subtotalTarget")?.reference.start.row).toBe(2);
    expect(getCellContent(other, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: `=${sheet.name}!A3` },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(other, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: `=${sheet.name}!A5` },
    });
    expect(session.workbook.definedNames.get("subtotalTarget")?.reference.start.row).toBe(4);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(session.workbook.definedNames.get("subtotalTarget")?.reference.start.row).toBe(2);
    expect(getCellContent(other, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: `=${sheet.name}!A3` },
    });
  });

  test("supports product, above-data summaries, replacement, and page break metadata", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, group, amount] of [
      [0, "Group", "Amount"],
      [1, "A", 2],
      [2, "A", 3],
      [3, "B", 4],
    ] as const) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: group });
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: amount });
    }
    const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } };
    expect(
      executeWorkbookCommand(
        session,
        createApplySubtotalsCommand(sheet.id, range, [0], [1], "product", {
          hasHeader: true,
          subtotalId: "below",
          pageBreaks: true,
        }),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 3, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=SUBTOTAL(6,B2:B3)" },
    });
    expect(sheet.subtotalMetadata?.[0]?.pageBreakRows).toEqual([4]);
    expect(
      executeWorkbookCommand(
        session,
        createApplySubtotalsCommand(sheet.id, range, [0], [1], "sum", {
          hasHeader: true,
          subtotalId: "above",
          replaceExisting: true,
          summaryBelow: false,
          pageBreaks: true,
        }),
      ),
    ).toBe(true);
    expect(sheet.subtotalMetadata).toHaveLength(1);
    expect(sheet.subtotalMetadata?.[0]?.summaryBelow).toBe(false);
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=SUBTOTAL(9,B3:B7)" },
    });
    expect(getCellContent(sheet, { row: 2, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=SUBTOTAL(9,B4:B5)" },
    });
    expect(getCellContent(sheet, { row: 5, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=SUBTOTAL(9,B7:B7)" },
    });
    expect(sheet.subtotalMetadata?.[0]?.pageBreakRows).toEqual([5]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.subtotalMetadata?.[0]?.id).toBe("below");
  });
});
