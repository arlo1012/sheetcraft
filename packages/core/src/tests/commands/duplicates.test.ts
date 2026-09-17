import { describe, expect, test, vi } from "vitest";
import {
  createClearSheetDuplicateRulesCommand,
  createCountDuplicateValuesCommand,
  createInsertSheetAxisCommand,
  createSetSheetDuplicateRulesCommand,
} from "../../commands/index.js";
import {
  createDuplicateHighlightResolver,
  getDuplicateValueCounts,
  validateDuplicateEntries,
} from "../../duplicate-values.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
  setCellContent,
  setCellStyle,
  MAX_SHEET_ROWS,
  MAX_SHEET_COLUMNS,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

const range = { start: { row: 0, column: 0 }, end: { row: 9, column: 0 } };
const rule = { id: "dup", kind: "reject" as const, range };
describe("duplicate values", () => {
  test("does not reject unchanged content during a format-only update", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.duplicateRules = [rule];
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "A" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "A" });
    expect(
      validateDuplicateEntries(session.workbook, [
        {
          sheetId: sheet.id,
          address: { row: 1, column: 0 },
          content: { kind: "literal", value: "A" },
        },
      ]).valid,
    ).toBe(true);
  });

  test("validates raw command bounds before mutation and skips unchanged count results", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "x" });
    const command = createCountDuplicateValuesCommand(
      sheet.id,
      { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      { sheetId: sheet.id, address: { row: 0, column: 1 } },
      { overwrite: true },
    );
    for (const address of [
      { row: -1, column: 1 },
      { row: 0, column: MAX_SHEET_COLUMNS },
      { row: MAX_SHEET_ROWS - 1, column: 1 },
      { row: NaN, column: 1 },
    ]) {
      expect(() =>
        executeWorkbookCommand(session, {
          ...command,
          destination: { sheetId: sheet.id, address },
        }),
      ).toThrow();
      expect(getCellContent(sheet, { row: 0, column: 1 })).toBeNull();
    }
    expect(() =>
      executeWorkbookCommand(session, {
        ...command,
        sourceRange: { start: { row: 0, column: 0 }, end: { row: MAX_SHEET_ROWS, column: 0 } },
      }),
    ).toThrow();
    expect(() =>
      executeWorkbookCommand(
        session,
        createClearSheetDuplicateRulesCommand(sheet.id, "highlight", {
          start: { row: -1, column: 0 },
          end: { row: 1, column: 0 },
        }),
      ),
    ).toThrow();
    expect(session.history.undoStack).toHaveLength(0);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(executeWorkbookCommand(session, command)).toBe(false);
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("counts spill cells once when their root is outside the range and a spill cell has a style", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(3,1,4,0)" } },
    );
    setCellStyle(sheet, { row: 1, column: 0 }, { bold: true });
    const spillRange = { start: { row: 1, column: 0 }, end: { row: 2, column: 0 } };
    expect(getDuplicateValueCounts(session.workbook, sheet.id, spillRange).get("n:4")).toBe(2);
    sheet.duplicateRules = [
      { id: "spill-highlight", kind: "highlight", range: spillRange, fillColor: "#ffc7ce" },
    ];
    expect(
      createDuplicateHighlightResolver(
        sheet,
        createWorkbookEvaluator(session.workbook, sheet.id),
      )({ row: 1, column: 0 })?.fillColor,
    ).toBe("#ffc7ce");
    sheet.duplicateRules = [
      {
        id: "spill-reject",
        kind: "reject",
        range: { start: spillRange.start, end: { row: 3, column: 0 } },
      },
    ];
    expect(
      validateDuplicateEntries(session.workbook, [
        {
          sheetId: sheet.id,
          address: { row: 3, column: 0 },
          content: { kind: "literal", value: 4 },
        },
      ]).valid,
    ).toBe(false);
  });

  test("whole-sheet duplicate highlighting visits sparse values rather than every coordinate", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const whole = {
      start: { row: 0, column: 0 },
      end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
    };
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "x" });
    setCellContent(sheet, whole.end, { kind: "literal", value: "X" });
    sheet.duplicateRules = [{ id: "whole", kind: "highlight", range: whole, fillColor: "#ffc7ce" }];
    const evaluator = createWorkbookEvaluator(session.workbook, sheet.id);
    const spy = vi.spyOn(evaluator, "getComputedValue");
    expect(
      createDuplicateHighlightResolver(sheet, evaluator)({ row: 0, column: 0 })?.fillColor,
    ).toBe("#ffc7ce");
    expect(spy.mock.calls.length).toBeLessThan(10);
  });

  test("rejects count output over spilled cells and protects an occupied header", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Header" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "x" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "Keep" });
    const command = createCountDuplicateValuesCommand(
      sheet.id,
      { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      { sheetId: sheet.id, address: { row: 0, column: 1 } },
      { hasHeader: true },
    );
    expect(() => executeWorkbookCommand(session, command)).toThrow();
    expect(getCellContent(sheet, { row: 1, column: 1 })).toBeNull();
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=SEQUENCE(3)" } },
    );
    expect(() =>
      executeWorkbookCommand(session, { ...command, options: { overwrite: true } }),
    ).toThrow();
    expect(getCellContent(sheet, { row: 0, column: 1 })?.kind).toBe("formula");
  });

  test("persists rules, clears only matching kind, and undoes", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDuplicateRulesCommand(sheet.id, [
          rule,
          { ...rule, id: "paint", kind: "highlight", fillColor: "#ff0000" },
        ]),
      ),
    ).toBe(true);
    expect(
      deserializeWorkbook(serializeWorkbook(session.workbook)).sheets.get(sheet.id)?.duplicateRules,
    ).toEqual(sheet.duplicateRules);
    expect(
      executeWorkbookCommand(session, createClearSheetDuplicateRulesCommand(sheet.id, "highlight")),
    ).toBe(true);
    expect(sheet.duplicateRules).toEqual([rule]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.duplicateRules).toHaveLength(2);
  });
  test("evaluates formula candidates and final batch dependencies prospectively", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.duplicateRules = [rule];
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "same" });
    expect(
      validateDuplicateEntries(session.workbook, [
        {
          sheetId: sheet.id,
          address: { row: 1, column: 0 },
          content: { kind: "formula", formula: { source: "=B1" } },
        },
        {
          sheetId: sheet.id,
          address: { row: 0, column: 1 },
          content: { kind: "literal", value: "same" },
        },
      ]).valid,
    ).toBe(false);
  });
  test("renders dynamic highlight without changing the stored style", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.duplicateRules = [{ ...rule, kind: "highlight", fillColor: "#ff0000" }];
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "A" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "a" });
    expect(
      createDuplicateHighlightResolver(
        sheet,
        createWorkbookEvaluator(session.workbook, sheet.id),
      )({ row: 0, column: 0 }),
    ).toEqual({ fillColor: "#ff0000" });
    expect(sheet.cells.get("0:0")?.style).toBeUndefined();
  });
  test("moves duplicate rule ranges with structural insertion and undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.duplicateRules = [
      { ...rule, range: { start: { row: 2, column: 0 }, end: { row: 4, column: 0 } } },
    ];
    expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 2))).toBe(
      true,
    );
    expect(sheet.duplicateRules?.[0]?.range).toEqual({
      start: { row: 3, column: 0 },
      end: { row: 5, column: 0 },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.duplicateRules?.[0]?.range.start.row).toBe(2);
  });
  test("preflights occupied count destinations atomically and writes counts with undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "x" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "x" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "keep" });
    const command = createCountDuplicateValuesCommand(
      sheet.id,
      { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      { sheetId: sheet.id, address: { row: 0, column: 1 } },
    );
    expect(() => executeWorkbookCommand(session, command)).toThrow();
    expect(getCellContent(sheet, { row: 0, column: 1 })).toBeNull();
    expect(executeWorkbookCommand(session, { ...command, options: { overwrite: true } })).toBe(
      true,
    );
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({ kind: "literal", value: 2 });
    expect(undoWorkbookCommand(session)).toBe(true);
  });
});
