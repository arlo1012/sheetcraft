import { describe, expect, test, vi } from "vitest";
import {
  createClearSheetDuplicateRulesCommand,
  createCountDuplicateValuesCommand,
  createInsertSheetAxisCommand,
  createSetSheetDuplicateRulesCommand,
} from "../../commands/index.js";
import {
  createDuplicateHighlightResolver,
  getDuplicateEntryIssues,
  getDuplicateValueCounts,
  getDuplicateValueSummaries,
  validateDuplicateEntries,
} from "../../duplicate-values.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
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

  test("creates a row-major rectangular count summary on a new sheet and supports undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const activeSheetId = sheet.id;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "title1" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "title2" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 3 });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 3 });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: 4 });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "formula", formula: { source: "=A3" } });
    const command = createCountDuplicateValuesCommand(
      session.workbook,
      sheet.id,
      { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      {
        idFactory: session.idFactory,
        sheetName: "Duplicate Values",
        valueLabel: "Value",
        countLabel: "Count",
      },
    );
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const result = getActiveSheet(session.workbook);
    expect(result.name).toBe("Duplicate Values");
    expect(getCellContent(result, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "Value",
    });
    expect(getCellContent(result, { row: 0, column: 1 })).toEqual({
      kind: "literal",
      value: "Count",
    });
    expect(getCellContent(result, { row: 1, column: 0 })).toEqual({
      kind: "literal",
      value: "title1",
    });
    expect(getCellContent(result, { row: 1, column: 1 })).toEqual({ kind: "literal", value: 1 });
    expect(getCellContent(result, { row: 3, column: 0 })).toEqual({ kind: "literal", value: 3 });
    expect(getCellContent(result, { row: 3, column: 1 })).toEqual({ kind: "literal", value: 2 });
    expect(getCellContent(result, { row: 4, column: 0 })).toEqual({ kind: "literal", value: 4 });
    expect(getCellContent(result, { row: 4, column: 1 })).toEqual({ kind: "literal", value: 2 });
    expect(result.cells.get("0:0")?.style).toEqual({ bold: true });
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(session.workbook.activeSheetId).toBe(activeSheetId);
    expect(session.workbook.sheets).toHaveLength(1);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getActiveSheet(session.workbook).id).toBe(result.id);
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

  test("summarizes sparse rectangular values without losing types or formula results", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const whole = {
      start: { row: 0, column: 0 },
      end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
    };
    const longText = "00000000000000000000000000000000000001";
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 3 });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "3" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: true });
    setCellContent(sheet, { row: 0, column: 3 }, { kind: "literal", value: longText });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "formula", formula: { source: "=A1" } });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "formula", formula: { source: "=1/0" } });
    const evaluator = createWorkbookEvaluator(session.workbook, sheet.id);
    const spy = vi.spyOn(evaluator, "getComputedValue");
    expect(getDuplicateValueSummaries(session.workbook, sheet.id, whole, evaluator)).toEqual([
      { value: 3, count: 2 },
      { value: "3", count: 1 },
      { value: true, count: 1 },
      { value: longText, count: 1 },
      { value: { kind: "formula-error", code: "DIV0" }, count: 1 },
    ]);
    expect(spy.mock.calls.length).toBeLessThan(20);
    const command = createCountDuplicateValuesCommand(session.workbook, sheet.id, whole, {
      idFactory: session.idFactory,
    });
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const result = getActiveSheet(session.workbook);
    expect(getCellContent(result, { row: 1, column: 0 })).toEqual({ kind: "literal", value: 3 });
    expect(getCellContent(result, { row: 2, column: 0 })).toEqual({ kind: "literal", value: "3" });
    expect(getCellContent(result, { row: 3, column: 0 })).toEqual({ kind: "literal", value: true });
    expect(getCellContent(result, { row: 4, column: 0 })).toEqual({
      kind: "literal",
      value: longText,
    });
    expect(getCellContent(result, { row: 5, column: 0 })).toEqual({
      kind: "error",
      error: { kind: "formula-error", code: "DIV0" },
    });
  });

  test("uses unique result sheet names and restores both generated sheets through history", () => {
    const session = createTestWorkbookSession();
    const source = getActiveSheet(session.workbook);
    setCellContent(source, { row: 0, column: 0 }, { kind: "literal", value: "A" });
    const sourceId = source.id;
    const first = createCountDuplicateValuesCommand(
      session.workbook,
      source.id,
      { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      { idFactory: session.idFactory, sheetName: "统计结果" },
    );
    expect(executeWorkbookCommand(session, first)).toBe(true);
    const firstId = getActiveSheet(session.workbook).id;
    const second = createCountDuplicateValuesCommand(
      session.workbook,
      source.id,
      { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      { idFactory: session.idFactory, sheetName: "统计结果" },
    );
    expect(executeWorkbookCommand(session, second)).toBe(true);
    const secondId = getActiveSheet(session.workbook).id;
    expect(getActiveSheet(session.workbook).name).toBe("统计结果 (2)");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(session.workbook.activeSheetId).toBe(firstId);
    expect(session.workbook.sheets.has(secondId)).toBe(false);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(session.workbook.activeSheetId).toBe(sourceId);
    expect(session.workbook.sheets).toHaveLength(1);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getActiveSheet(session.workbook).id).toBe(firstId);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getActiveSheet(session.workbook).id).toBe(secondId);
    expect(getActiveSheet(session.workbook).name).toBe("统计结果 (2)");
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

  test("diagnoses every repeated value in a rectangular rejection rule while skipping distinct titles", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const rectangle = { start: { row: 0, column: 0 }, end: { row: 6, column: 4 } };
    sheet.duplicateRules = [{ id: "reject-grid", kind: "reject", range: rectangle }];
    for (let column = 0; column < 5; column += 1) {
      setCellContent(sheet, { row: 0, column }, { kind: "literal", value: `title${column + 1}` });
      for (let row = 1; row <= 6; row += 1)
        setCellContent(sheet, { row, column }, { kind: "literal", value: row });
    }

    const issues = getDuplicateEntryIssues(
      sheet,
      createWorkbookEvaluator(session.workbook, sheet.id),
    );
    expect(issues).toHaveLength(30);
    expect(issues).toEqual(
      expect.arrayContaining([
        { address: { row: 1, column: 0 }, ruleIds: ["reject-grid"], valueKey: "n:1" },
        { address: { row: 6, column: 4 }, ruleIds: ["reject-grid"], valueKey: "n:6" },
      ]),
    );
    expect(issues.some((issue) => issue.address.row === 0)).toBe(false);
  });

  test("combines rejection rules, excludes blanks, and includes formula spill projections", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.duplicateRules = [
      {
        id: "all",
        kind: "reject",
        range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
      },
      {
        id: "overlap",
        kind: "reject",
        range: { start: { row: 1, column: 0 }, end: { row: 3, column: 0 } },
      },
    ];
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(3,1,7,0)" } },
    );
    setCellStyle(sheet, { row: 2, column: 0 }, { bold: true });

    expect(
      getDuplicateEntryIssues(sheet, createWorkbookEvaluator(session.workbook, sheet.id)),
    ).toEqual([
      { address: { row: 0, column: 0 }, ruleIds: ["all"], valueKey: "n:7" },
      { address: { row: 1, column: 0 }, ruleIds: ["all", "overlap"], valueKey: "n:7" },
      { address: { row: 2, column: 0 }, ruleIds: ["all", "overlap"], valueKey: "n:7" },
    ]);
  });

  test("diagnoses a whole-sheet rejection rule from sparse cells only", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const whole = {
      start: { row: 0, column: 0 },
      end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
    };
    sheet.duplicateRules = [{ id: "whole", kind: "reject", range: whole }];
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "x" });
    setCellContent(sheet, whole.end, { kind: "literal", value: "X" });
    const evaluator = createWorkbookEvaluator(session.workbook, sheet.id);
    const spy = vi.spyOn(evaluator, "getComputedValue");

    expect(getDuplicateEntryIssues(sheet, evaluator)).toEqual([
      { address: { row: 0, column: 0 }, ruleIds: ["whole"], valueKey: "s:x" },
      { address: whole.end, ruleIds: ["whole"], valueKey: "s:x" },
    ]);
    expect(spy.mock.calls.length).toBeLessThan(10);
  });

  test("does not evaluate a sheet without rejection rules", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "x" });
    const evaluator = createWorkbookEvaluator(session.workbook, sheet.id);
    const spy = vi.spyOn(evaluator, "getComputedValue");

    expect(getDuplicateEntryIssues(sheet, evaluator)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
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
  test("rejects an empty source without creating a sheet", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    expect(() =>
      createCountDuplicateValuesCommand(
        session.workbook,
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
        { idFactory: session.idFactory },
      ),
    ).toThrow(/empty/);
    expect(session.workbook.sheets).toHaveLength(1);
  });
});
