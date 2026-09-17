import { describe, expect, test } from "vitest";
import {
  createAddSheetCommand,
  createAdvancedFilterCommand,
  createInsertCellsCommand,
  createInsertSheetAxisCommand,
  createSheetFilterHiddenRowIntervals,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createSheetSparseState,
  getActiveSheet,
  getCellContent,
  getWorkbookSheets,
  setCellContent,
  setCellStyle,
} from "../../workbook.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";

function set(
  sheet: ReturnType<typeof getActiveSheet>,
  row: number,
  column: number,
  value: string | number | null,
) {
  if (value !== null) setCellContent(sheet, { row, column }, { kind: "literal", value });
}
function sample(sheet: ReturnType<typeof getActiveSheet>) {
  for (const [row, values] of [
    [0, ["Name", "Score"]],
    [1, ["Anne", 10]],
    [2, ["Andy", 20]],
    [3, ["Bob", 20]],
    [4, ["Anne", 10]],
  ] as const)
    values.forEach((value, column) => set(sheet, row, column, value));
}

describe("advanced filter", () => {
  test("applies AND/OR criteria, wildcards, unique rows, and restores in-place state", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sample(sheet);
    executeWorkbookCommand(
      session,
      createAddSheetCommand(session.workbook, { id: "criteria", name: "Criteria" }),
    );
    const criteria = getWorkbookSheets(session.workbook).find((entry) => entry.id === "criteria")!;
    set(criteria, 0, 0, "Name");
    set(criteria, 0, 1, "Score");
    set(criteria, 1, 0, "An*");
    set(criteria, 1, 1, ">=20");
    set(criteria, 2, 0, "=Bob");
    const command = createAdvancedFilterCommand(
      sheet.id,
      { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
      {
        criteria: {
          sheetId: criteria.id,
          range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        },
        mode: "inPlace",
        uniqueOnly: true,
        overwrite: false,
      },
    );
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.filter?.advanced?.hiddenRows).toEqual([
      { start: 1, end: 1 },
      { start: 4, end: 4 },
    ]);
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([
      { start: 1, end: 1 },
      { start: 4, end: 4 },
    ]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.filter).toBeNull();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.filter?.advanced?.uniqueOnly).toBe(true);
  });

  test("copies evaluated values and styles, and rejects collisions atomically", () => {
    const session = createTestWorkbookSession();
    const source = getActiveSheet(session.workbook);
    sample(source);
    setCellContent(
      source,
      { row: 1, column: 1 },
      { kind: "formula", formula: { source: "=10+10" } },
    );
    setCellStyle(source, { row: 1, column: 0 }, { bold: true });
    executeWorkbookCommand(
      session,
      createAddSheetCommand(session.workbook, { id: "target", name: "Target" }),
    );
    const target = getWorkbookSheets(session.workbook).find((entry) => entry.id === "target")!;
    const command = createAdvancedFilterCommand(
      source.id,
      { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      {
        mode: "copy",
        destination: { sheetId: target.id, address: { row: 2, column: 2 } },
        uniqueOnly: false,
        overwrite: false,
      },
    );
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellContent(target, { row: 3, column: 3 })).toEqual({ kind: "literal", value: 20 });
    expect(target.cells.get("2:2")?.style?.bold).toBeUndefined();
    expect(target.cells.get("3:2")?.style?.bold).toBe(true);
    set(target, 10, 2, "occupied");
    const before = createSheetSparseState(target);
    expect(() =>
      executeWorkbookCommand(
        session,
        createAdvancedFilterCommand(
          source.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
          {
            mode: "copy",
            destination: { sheetId: target.id, address: { row: 10, column: 2 } },
            uniqueOnly: false,
            overwrite: false,
          },
        ),
      ),
    ).toThrow("overwrite");
    expect(createSheetSparseState(target)).toEqual(before);
  });

  test("round trips advanced metadata and rejects source/criteria overlap", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sample(sheet);
    executeWorkbookCommand(
      session,
      createAdvancedFilterCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
        { mode: "inPlace", uniqueOnly: true, overwrite: false },
      ),
    );
    expect(
      deserializeWorkbook(serializeWorkbook(session.workbook)).sheets.get(sheet.id)?.filter,
    ).toEqual(sheet.filter);
    expect(() =>
      executeWorkbookCommand(
        session,
        createAdvancedFilterCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
          {
            criteria: {
              sheetId: sheet.id,
              range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
            },
            mode: "inPlace",
            uniqueOnly: false,
            overwrite: false,
          },
        ),
      ),
    ).toThrow("Criteria cannot overlap");
  });

  test("rejects an unmatched non-empty criterion, uses plain text as a prefix, and keeps numeric values typed", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    [
      ["Name", "Score"],
      ["Dav", 20],
      ["David", "20"],
      ["Davolio", 21],
    ].forEach((values, row) => values.forEach((value, column) => set(sheet, row, column, value)));
    executeWorkbookCommand(
      session,
      createAddSheetCommand(session.workbook, { id: "criteria", name: "Criteria" }),
    );
    const criteria = getWorkbookSheets(session.workbook).find((entry) => entry.id === "criteria")!;
    set(criteria, 0, 0, "Name");
    set(criteria, 0, 1, "Score");
    set(criteria, 1, 0, "Dav");
    set(criteria, 1, 1, "=20");
    expect(
      executeWorkbookCommand(
        session,
        createAdvancedFilterCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
          {
            criteria: {
              sheetId: criteria.id,
              range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
            },
            mode: "inPlace",
            uniqueOnly: false,
            overwrite: false,
          },
        ),
      ),
    ).toBe(true);
    expect(sheet.filter?.advanced?.hiddenRows).toEqual([{ start: 2, end: 3 }]);
    set(criteria, 0, 2, "Missing");
    set(criteria, 1, 2, "x");
    expect(() =>
      executeWorkbookCommand(
        session,
        createAdvancedFilterCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
          {
            criteria: {
              sheetId: criteria.id,
              range: { start: { row: 0, column: 0 }, end: { row: 1, column: 2 } },
            },
            mode: "inPlace",
            uniqueOnly: false,
            overwrite: false,
          },
        ),
      ),
    ).toThrow("matching list header");
  });

  test("treats an all-blank criteria row as a matching OR branch", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sample(sheet);
    executeWorkbookCommand(
      session,
      createAddSheetCommand(session.workbook, { id: "criteria", name: "Criteria" }),
    );
    const criteria = getWorkbookSheets(session.workbook).find((entry) => entry.id === "criteria")!;
    set(criteria, 0, 0, "Name");
    set(criteria, 1, 0, "Nobody");
    expect(
      executeWorkbookCommand(
        session,
        createAdvancedFilterCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
          {
            criteria: {
              sheetId: criteria.id,
              range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
            },
            mode: "inPlace",
            uniqueOnly: false,
            overwrite: false,
          },
        ),
      ),
    ).toBe(true);
    expect(sheet.filter?.advanced?.hiddenRows).toEqual([]);
  });

  test("guards structural and cell-shift edits to a criteria sheet", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sample(sheet);
    executeWorkbookCommand(
      session,
      createAddSheetCommand(session.workbook, { id: "criteria", name: "Criteria" }),
    );
    const criteria = getWorkbookSheets(session.workbook).find((entry) => entry.id === "criteria")!;
    set(criteria, 0, 0, "Name");
    set(criteria, 1, 0, "Anne");
    executeWorkbookCommand(
      session,
      createAdvancedFilterCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
        {
          criteria: {
            sheetId: criteria.id,
            range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          },
          mode: "inPlace",
          uniqueOnly: false,
          overwrite: false,
        },
      ),
    );
    expect(() =>
      executeWorkbookCommand(session, createInsertSheetAxisCommand(criteria.id, "row", 1)),
    ).toThrow("criteria range");
    expect(() =>
      executeWorkbookCommand(
        session,
        createInsertCellsCommand(
          criteria.id,
          { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } },
          "down",
        ),
      ),
    ).toThrow("criteria");
  });
});
