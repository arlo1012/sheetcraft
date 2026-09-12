import { describe, expect, test } from "vitest";
import {
  createMergeCellsCommand,
  createUpsertDefinedNameCommand,
  getCellMergeModeAvailability,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
  insertSheet,
  setCellContent,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("formula-aware merge commands", () => {
  test("merges computed cross-sheet and named values as content, then restores raw formulas", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const data = createSheet("Data", "data");
    insertSheet(session.workbook, data);
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    executeWorkbookCommand(
      session,
      createUpsertDefinedNameCommand(session.workbook, { name: "Base", reference: "=Data!A1" }),
    );
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Data!A1*3" },
      },
    );
    setCellContent(
      sheet,
      { row: 1, column: 0 },
      {
        kind: "formula",
        formula: { source: "=SUM(Base)*4" },
      },
    );

    expect(
      executeWorkbookCommand(
        session,
        createMergeCellsCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          "content",
          "en-US",
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "6\n8",
    });

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=Data!A1*3" },
    });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(Base)*4" },
    });
  });

  test("groups equal values calculated through cross-sheet and named dependencies", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const data = createSheet("Data", "data");
    insertSheet(session.workbook, data);
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 5 });
    executeWorkbookCommand(
      session,
      createUpsertDefinedNameCommand(session.workbook, { name: "Base", reference: "=Data!A1" }),
    );
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Data!A1" },
      },
    );
    setCellContent(
      sheet,
      { row: 1, column: 0 },
      {
        kind: "formula",
        formula: { source: "=SUM(Base)" },
      },
    );
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: 6 });
    const range = { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } };

    expect(
      getCellMergeModeAvailability(
        sheet,
        range,
        "same-columns",
        createWorkbookEvaluator(session.workbook, sheet.id),
      ),
    ).toBe(true);
    expect(
      executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range, "same-columns")),
    ).toBe(true);
    expect(sheet.mergedCells).toEqual([
      { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
    ]);
  });
});
