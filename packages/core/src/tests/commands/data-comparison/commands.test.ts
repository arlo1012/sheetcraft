import { describe, expect, test } from "vitest";
import {
  createExtractDataComparisonCommand,
  createMarkDataComparisonCommand,
} from "../../../commands/index.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../history.js";
import {
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

describe("data comparison commands", () => {
  test("marks two source sheets atomically and restores styles with one undo", () => {
    const session = createTestWorkbookSession();
    const first = getActiveSheet(session.workbook);
    const second = { ...first, id: "second", name: "Second", cells: new Map() };
    session.workbook.sheets.set(second.id, second);
    for (const sheet of [first, second])
      setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Same" });
    setCellStyle(first, { row: 0, column: 0 }, { bold: true });
    const command = createMarkDataComparisonCommand(
      session.workbook,
      {
        source: {
          sheetId: first.id,
          range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        },
        comparison: {
          sheetId: second.id,
          range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        },
        mode: "cells",
        hasHeader: false,
        match: "duplicate",
        side: "both",
      },
      "#FDE68A",
    );
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellStyle(first, { row: 0, column: 0 })).toMatchObject({
      bold: true,
      fillColor: "#fde68a",
    });
    expect(getCellStyle(second, { row: 0, column: 0 })?.fillColor).toBe("#fde68a");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(first, { row: 0, column: 0 })).toEqual({ bold: true });
    expect(getCellStyle(second, { row: 0, column: 0 })).toBeUndefined();
  });

  test("does not create a header for headerless row extraction", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "only" });
    const command = createExtractDataComparisonCommand(
      session.workbook,
      {
        source: {
          sheetId: sheet.id,
          range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        },
        mode: "rows",
        hasHeader: false,
        match: "unique",
        side: "first",
      },
      { idFactory: session.idFactory, sheetName: "Unique", valueLabel: "Value" },
    );
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellContent(getActiveSheet(session.workbook), { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "only",
    });
  });

  test("deduplicates overlapping same-sheet mark targets and rejects protected sources", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    ["same", "same", "same"].forEach((value, row) =>
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value }),
    );
    const options = {
      source: {
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      },
      comparison: {
        sheetId: sheet.id,
        range: { start: { row: 1, column: 0 }, end: { row: 2, column: 0 } },
      },
      mode: "cells" as const,
      hasHeader: false,
      match: "duplicate" as const,
      side: "both" as const,
    };
    expect(
      executeWorkbookCommand(
        session,
        createMarkDataComparisonCommand(session.workbook, options, "#FDE68A"),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, { row: 1, column: 0 })?.fillColor).toBe("#fde68a");
    sheet.properties.protected = true;
    expect(() => createMarkDataComparisonCommand(session.workbook, options, "#FDE68A")).toThrow(
      /protected/i,
    );
  });

  test("uses the second range header when extracting the second comparison side", () => {
    const session = createTestWorkbookSession();
    const first = getActiveSheet(session.workbook);
    const second = { ...first, id: "second", name: "Second", cells: new Map() };
    session.workbook.sheets.set(second.id, second);
    setCellContent(first, { row: 0, column: 0 }, { kind: "literal", value: "First title" });
    setCellContent(first, { row: 1, column: 0 }, { kind: "literal", value: "same" });
    setCellContent(second, { row: 0, column: 0 }, { kind: "literal", value: "Second title" });
    setCellContent(second, { row: 1, column: 0 }, { kind: "literal", value: "same" });
    const command = createExtractDataComparisonCommand(
      session.workbook,
      {
        source: {
          sheetId: first.id,
          range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        },
        comparison: {
          sheetId: second.id,
          range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        },
        mode: "rows",
        hasHeader: true,
        match: "duplicate",
        side: "second",
      },
      { idFactory: session.idFactory, sheetName: "Result", valueLabel: "Value" },
    );
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellContent(getActiveSheet(session.workbook), { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "Second title",
    });
  });

  test("extracts computed formula values as literals while retaining the source formula through undo and redo", () => {
    const session = createTestWorkbookSession();
    session.workbook = new Proxy(session.workbook, {
      set(target, property, value, receiver) {
        const result = Reflect.set(target, property, value, receiver);
        if (property === "sheets" || property === "activeSheetId")
          expect(getActiveSheet(target)).toBeDefined();
        return result;
      },
    });
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 7 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "formula", formula: { source: "=A1" } });
    const command = createExtractDataComparisonCommand(
      session.workbook,
      {
        source: {
          sheetId: sheet.id,
          range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        },
        mode: "cells",
        hasHeader: false,
        match: "duplicate",
        side: "first",
      },
      { idFactory: session.idFactory, sheetName: "Result", valueLabel: "Value" },
    );
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellContent(getActiveSheet(session.workbook), { row: 2, column: 0 })).toEqual({
      kind: "literal",
      value: 7,
    });
    expect(getCellContent(sheet, { row: 1, column: 0 })?.kind).toBe("formula");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(getActiveSheet(session.workbook), { row: 1, column: 0 })).toEqual({
      kind: "literal",
      value: 7,
    });
  });
});
