import { describe, expect, test } from "vitest";
import { analyzeLookupFill, createLookupFillCommand } from "../../../commands/lookup-fill.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../history.js";
import { getActiveSheet, getCellContent, setCellContent } from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

describe("lookup fill", () => {
  test("fills computed source values with a compound key and restores them in one undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    [
      ["id", "kind", "value"],
      [1, "a", 10],
      [1, "b", 20],
    ].forEach((values, row) =>
      values.forEach((value, column) =>
        setCellContent(sheet, { row, column }, { kind: "literal", value }),
      ),
    );
    [
      ["id", "kind", "result"],
      [1, "b", null],
    ].forEach((values, row) =>
      values.forEach((value, column) => {
        if (value !== null)
          setCellContent(sheet, { row, column: column + 4 }, { kind: "literal", value });
      }),
    );
    const options = {
      source: {
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
      },
      target: {
        sheetId: sheet.id,
        range: { start: { row: 0, column: 4 }, end: { row: 1, column: 6 } },
      },
      hasHeader: true,
      matchFields: [
        { sourceColumn: 0, targetColumn: 0 },
        { sourceColumn: 1, targetColumn: 1 },
      ],
      fillFields: [{ sourceColumn: 2, targetColumn: 2 }],
      matchMode: "first" as const,
      overwrite: false,
    };
    expect(analyzeLookupFill(session.workbook, options)).toMatchObject({
      matchedRows: 1,
      writeCount: 1,
    });
    expect(
      executeWorkbookCommand(session, createLookupFillCommand(session.workbook, options)),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 1, column: 6 })).toEqual({ kind: "literal", value: 20 });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 1, column: 6 })).toBeNull();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 1, column: 6 })).toEqual({ kind: "literal", value: 20 });
  });
  test("keeps existing targets unless overwrite is enabled and skips empty keys", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    [
      ["x", 2],
      ["", 3],
    ].forEach((values, row) =>
      values.forEach((value, column) =>
        setCellContent(sheet, { row, column }, { kind: "literal", value }),
      ),
    );
    [
      ["x", "old"],
      ["", ""],
    ].forEach((values, row) =>
      values.forEach((value, column) =>
        setCellContent(sheet, { row, column: column + 3 }, { kind: "literal", value }),
      ),
    );
    const options = {
      source: {
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
      },
      target: {
        sheetId: sheet.id,
        range: { start: { row: 0, column: 3 }, end: { row: 1, column: 4 } },
      },
      hasHeader: false,
      matchFields: [{ sourceColumn: 0, targetColumn: 0 }],
      fillFields: [{ sourceColumn: 1, targetColumn: 1 }],
      matchMode: "first" as const,
      overwrite: false,
    };
    expect(analyzeLookupFill(session.workbook, options)).toMatchObject({
      matchedRows: 1,
      writeCount: 0,
      skippedExistingCount: 1,
    });
  });
  test("matches text without case, rejects duplicate output columns, and rejects protected targets", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    ["Key", 9, "key", null].forEach((value, index) => {
      if (value !== null)
        setCellContent(
          sheet,
          { row: Math.floor(index / 2), column: index % 2 },
          { kind: "literal", value },
        );
    });
    const base = {
      source: {
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 0, column: 1 } },
      },
      target: {
        sheetId: sheet.id,
        range: { start: { row: 1, column: 0 }, end: { row: 1, column: 1 } },
      },
      hasHeader: false,
      matchFields: [{ sourceColumn: 0, targetColumn: 0 }],
      fillFields: [{ sourceColumn: 1, targetColumn: 1 }],
      matchMode: "first" as const,
      overwrite: false,
    };
    expect(analyzeLookupFill(session.workbook, base).writeCount).toBe(1);
    expect(() =>
      createLookupFillCommand(session.workbook, {
        ...base,
        fillFields: [
          { sourceColumn: 0, targetColumn: 1 },
          { sourceColumn: 1, targetColumn: 1 },
        ],
      }),
    ).toThrow();
    sheet.properties.protected = true;
    expect(() => createLookupFillCommand(session.workbook, base)).toThrow(/protected/i);
  });
  test("reads the pre-change snapshot for overlapping ranges and rejects a merged write", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    [
      [1, 10],
      [2, 20],
    ].forEach((values, row) =>
      values.forEach((value, column) =>
        setCellContent(sheet, { row, column }, { kind: "literal", value }),
      ),
    );
    const options = {
      source: {
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
      },
      target: {
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
      },
      hasHeader: false,
      matchFields: [{ sourceColumn: 0, targetColumn: 0 }],
      fillFields: [{ sourceColumn: 1, targetColumn: 0 }],
      matchMode: "first" as const,
      overwrite: true,
    };
    expect(
      executeWorkbookCommand(session, createLookupFillCommand(session.workbook, options)),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: 10 });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({ kind: "literal", value: 20 });
    sheet.mergedCells.push({ start: { row: 0, column: 0 }, end: { row: 0, column: 1 } });
    expect(() => createLookupFillCommand(session.workbook, options)).toThrow(/merged/i);
  });
  test("rejects a SEQUENCE spill tail even when its formula root is outside the target range", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(2)" } },
    );
    setCellContent(sheet, { row: 0, column: 3 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 0, column: 4 }, { kind: "literal", value: 9 });
    const options = {
      source: {
        sheetId: sheet.id,
        range: { start: { row: 0, column: 3 }, end: { row: 0, column: 4 } },
      },
      target: {
        sheetId: sheet.id,
        range: { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } },
      },
      hasHeader: false,
      matchFields: [{ sourceColumn: 0, targetColumn: 0 }],
      fillFields: [{ sourceColumn: 1, targetColumn: 0 }],
      matchMode: "first" as const,
      overwrite: true,
    };
    expect(analyzeLookupFill(session.workbook, options).writeCount).toBe(1);
    expect(() => createLookupFillCommand(session.workbook, options)).toThrow(/spill/i);
  });
});
