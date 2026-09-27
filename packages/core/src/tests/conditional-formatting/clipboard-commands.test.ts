import { describe, expect, test } from "vitest";
import {
  createAddSheetCommand,
  createMoveCellRangeCommand,
  type SetCellContentsCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { getActiveSheet, setCellContent } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

const sourceRange = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };

function rule(id: string, formula = "=A1>0") {
  return {
    id,
    ranges: [{ start: { row: 0, column: 0 }, end: { row: 1, column: 0 } }],
    anchor: { row: 0, column: 0 },
    condition: { kind: "formula" as const, formula },
    style: { fillColor: "#FF0000" },
  };
}

describe("conditional-formatting command integration", () => {
  test("applies pasted rules atomically with cells and restores both through history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const command: SetCellContentsCommand = {
      type: "setCellContents",
      changes: [
        {
          sheetId: sheet.id,
          address: { row: 0, column: 0 },
          content: { kind: "literal", value: "overdue" },
        },
      ],
      conditionalFormats: [{ sheetId: sheet.id, rules: [rule("overdue")] }],
    };
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.conditionalFormats).toEqual([rule("overdue")]);
    expect(structuredClone(session.history.undoStack[0]!.command)).toEqual(
      session.history.undoStack[0]!.command,
    );
    expect(JSON.parse(JSON.stringify(session.history.undoStack[0]!.command))).toEqual(
      session.history.undoStack[0]!.command,
    );
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.cells.get("0:0")).toBeUndefined();
    expect(sheet.conditionalFormats).toEqual([]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.conditionalFormats).toEqual([rule("overdue")]);
  });

  test("rejects an invalid pasted rule before mutating cells", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const before = serializeWorkbook(session.workbook);
    const command = {
      type: "setCellContents" as const,
      changes: [
        {
          sheetId: sheet.id,
          address: { row: 0, column: 0 },
          content: { kind: "literal" as const, value: "must-not-write" },
        },
      ],
      conditionalFormats: [{ sheetId: sheet.id, rules: [{ ...rule("invalid"), style: {} }] }],
    };
    expect(() => executeWorkbookCommand(session, command)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toEqual([]);
  });

  test("moves full and partial local conditional-format scopes reversibly", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    sheet.conditionalFormats = [
      rule("local"),
      { ...rule("full"), ranges: [sourceRange], anchor: { row: 0, column: 0 } },
    ];
    expect(
      executeWorkbookCommand(
        session,
        createMoveCellRangeCommand(sheet.id, sourceRange, { row: 3, column: 1 }),
      ),
    ).toBe(true);
    expect(sheet.conditionalFormats).toEqual([
      expect.objectContaining({
        id: "local",
        ranges: [{ start: { row: 1, column: 0 }, end: { row: 1, column: 0 } }],
      }),
      expect.objectContaining({
        id: expect.stringMatching(/^local-move-/),
        ranges: [{ start: { row: 3, column: 1 }, end: { row: 3, column: 1 } }],
      }),
      expect.objectContaining({
        id: "full",
        ranges: [{ start: { row: 3, column: 1 }, end: { row: 3, column: 1 } }],
      }),
    ]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.conditionalFormats).toEqual([
      rule("local"),
      { ...rule("full"), ranges: [sourceRange], anchor: { row: 0, column: 0 } },
    ]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.conditionalFormats).toHaveLength(3);
  });

  test("rewrites a single-cell cross-sheet condition and restores it through undo and redo", () => {
    const session = createTestWorkbookSession();
    const source = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createAddSheetCommand(session.workbook, { id: "other", name: "Other" }),
    );
    const other = session.workbook.sheets.get("other")!;
    setCellContent(source, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    other.conditionalFormats = [
      { ...rule("cross", "=Sheet1!A1>0"), ranges: [sourceRange], anchor: { row: 0, column: 0 } },
    ];
    expect(
      executeWorkbookCommand(
        session,
        createMoveCellRangeCommand(source.id, sourceRange, { row: 0, column: 1 }),
      ),
    ).toBe(true);
    expect(other.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "=Sheet1!B1>0",
    });
    expect(structuredClone(session.history.undoStack[0]!.command)).toEqual(
      session.history.undoStack[0]!.command,
    );
    expect(JSON.parse(JSON.stringify(session.history.undoStack[0]!.command))).toEqual(
      session.history.undoStack[0]!.command,
    );
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(other.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "=Sheet1!A1>0",
    });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(other.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "=Sheet1!B1>0",
    });
  });

  test("rejects a multi-cell move with a cross-sheet conditional formula before mutation", () => {
    const session = createTestWorkbookSession();
    const source = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createAddSheetCommand(session.workbook, { id: "other", name: "Other" }),
    );
    const other = session.workbook.sheets.get("other")!;
    setCellContent(source, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(source, { row: 1, column: 0 }, { kind: "literal", value: 2 });
    other.conditionalFormats = [rule("cross", "=Sheet1!A1>0")];
    const before = serializeWorkbook(session.workbook);
    expect(() =>
      executeWorkbookCommand(
        session,
        createMoveCellRangeCommand(
          source.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          { row: 0, column: 1 },
        ),
      ),
    ).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });
});
