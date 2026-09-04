import { describe, expect, test } from "vitest";
import { createMoveCellRangeCommand } from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("move cell range command", () => {
  test("moves raw content and rewrites direct moved-address references reversibly", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "formula", formula: { source: "=A1" } });
    executeWorkbookCommand(
      session,
      createMoveCellRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        { row: 2, column: 1 },
      ),
    );
    expect(getCellContent(sheet, { row: 2, column: 1 })).toEqual({ kind: "literal", value: 2 });
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=B3" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=A1" },
    });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=B3" },
    });
  });

  test("clears destination cells for blank source positions without dense source traversal", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "only" });
    setCellContent(sheet, { row: 11, column: 11 }, { kind: "literal", value: "stale" });
    executeWorkbookCommand(
      session,
      createMoveCellRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
        { row: 10, column: 10 },
      ),
    );
    expect(getCellContent(sheet, { row: 10, column: 10 })).toEqual({
      kind: "literal",
      value: "only",
    });
    expect(getCellContent(sheet, { row: 11, column: 11 })).toBeNull();
  });

  test("reconciles reciprocal borders for a style-only move without formulas", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const border = { style: "thin" as const, color: "#123456" };
    setCellStyle(sheet, { row: 0, column: 0 }, { borderRight: border });
    setCellStyle(sheet, { row: 0, column: 1 }, { borderLeft: border });
    executeWorkbookCommand(
      session,
      createMoveCellRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        { row: 2, column: 2 },
      ),
    );
    expect(getCellStyle(sheet, { row: 0, column: 1 })?.borderLeft).toBeUndefined();
    expect(getCellStyle(sheet, { row: 2, column: 2 })?.borderRight).toEqual(border);
  });

  test("is a strict no-op when destination equals source start", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "same" });
    expect(
      executeWorkbookCommand(
        session,
        createMoveCellRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
          { row: 0, column: 0 },
        ),
      ),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "same",
    });
  });

  test("validates a missing sheet before applying a no-op shortcut", () => {
    const session = createTestWorkbookSession();
    expect(() =>
      executeWorkbookCommand(
        session,
        createMoveCellRangeCommand(
          "missing",
          { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
          { row: 0, column: 0 },
        ),
      ),
    ).toThrow("missing");
  });

  test("handles overlap and conservatively errors partially intersecting formula ranges", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "A" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "B" });
    setCellContent(
      sheet,
      { row: 0, column: 3 },
      { kind: "formula", formula: { source: "=SUM(A1:C1)+$A$1" } },
    );
    executeWorkbookCommand(
      session,
      createMoveCellRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 1 } },
        { row: 0, column: 1 },
      ),
    );
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({ kind: "literal", value: "A" });
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({ kind: "literal", value: "B" });
    expect(getCellContent(sheet, { row: 0, column: 3 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(#REF!)+$B$1" },
    });
  });

  test("retargets formulas even when the moved source rectangle is blank", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "formula", formula: { source: "=A1" } });
    executeWorkbookCommand(
      session,
      createMoveCellRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        { row: 4, column: 4 },
      ),
    );
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=E5" },
    });
  });
});
