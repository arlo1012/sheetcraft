import { describe, expect, test } from "vitest";
import {
  createAddSheetOutlineGroupCommand,
  createClearSheetOutlineCommand,
  createClearSheetDataValidationsCommand,
  createSetSheetDataValidationsCommand,
  createSetSheetOutlineGroupCollapsedCommand,
  createSetSheetOutlineGroupsCollapsedCommand,
  createUngroupSheetRangeCommand,
} from "../../commands/index.js";
import { getOutlineHiddenIntervals } from "../../data-outline.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";
import { getActiveSheet, setCellContent } from "../../workbook.js";
import {
  resolveDataValidationListValues,
  validateCellContentDataValidation,
} from "../../data-validation.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("data validation and outline commands", () => {
  test("persists validation rules and restores them through undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const command = createSetSheetDataValidationsCommand(sheet.id, [
      {
        id: "state",
        range: { start: { row: 1, column: 0 }, end: { row: 9, column: 0 } },
        type: "list",
        list: ["open", "closed"],
        allowBlank: false,
        errorStyle: "stop",
      },
    ]);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.dataValidations).toHaveLength(1);
    expect(
      deserializeWorkbook(serializeWorkbook(session.workbook)).sheets.get(sheet.id)
        ?.dataValidations,
    ).toEqual(sheet.dataValidations);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.dataValidations).toEqual([]);
  });
  test("collapses nested noncrossing groups without changing manual hiding", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    expect(
      executeWorkbookCommand(
        session,
        createAddSheetOutlineGroupCommand(sheet.id, {
          id: "outer",
          axis: "row",
          start: 1,
          end: 9,
          collapsed: false,
        }),
      ),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        session,
        createAddSheetOutlineGroupCommand(sheet.id, {
          id: "inner",
          axis: "row",
          start: 3,
          end: 5,
          collapsed: false,
        }),
      ),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetOutlineGroupCollapsedCommand(sheet.id, "inner", true),
      ),
    ).toBe(true);
    expect(getOutlineHiddenIntervals(sheet.outlineGroups ?? [], "row")).toEqual([
      { start: 3, end: 5 },
    ]);
    expect(sheet.hiddenRows).toEqual(new Set());
  });
  test("lowers exactly one nested outline level across a partial selected band", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const group of [
      { id: "outer", axis: "row" as const, start: 0, end: 10, collapsed: false },
      { id: "inner", axis: "row" as const, start: 2, end: 5, collapsed: false },
    ]) {
      expect(
        executeWorkbookCommand(session, createAddSheetOutlineGroupCommand(sheet.id, group)),
      ).toBe(true);
    }
    expect(
      executeWorkbookCommand(session, createUngroupSheetRangeCommand(sheet.id, "row", 3, 4)),
    ).toBe(true);
    expect(sheet.outlineGroups).toEqual([
      { id: "outer", axis: "row", start: 0, end: 10, collapsed: false },
      expect.objectContaining({ axis: "row", start: 2, end: 2, collapsed: false }),
      expect.objectContaining({ axis: "row", start: 5, end: 5, collapsed: false }),
    ]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.outlineGroups).toEqual([
      { id: "outer", axis: "row", start: 0, end: 10, collapsed: false },
      { id: "inner", axis: "row", start: 2, end: 5, collapsed: false },
    ]);
  });
  test("does not merge adjacent outline groups while lowering a selected group", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const group of [
      { id: "first", axis: "row" as const, start: 1, end: 2, collapsed: false },
      { id: "second", axis: "row" as const, start: 3, end: 4, collapsed: false },
    ]) {
      executeWorkbookCommand(session, createAddSheetOutlineGroupCommand(sheet.id, group));
    }
    expect(
      executeWorkbookCommand(session, createUngroupSheetRangeCommand(sheet.id, "row", 20, 20)),
    ).toBe(false);
    expect(
      executeWorkbookCommand(session, createUngroupSheetRangeCommand(sheet.id, "row", 1, 1)),
    ).toBe(true);
    expect(sheet.outlineGroups).toEqual([
      { id: "first", axis: "row", start: 2, end: 2, collapsed: false },
      { id: "second", axis: "row", start: 3, end: 4, collapsed: false },
    ]);
  });
  test("removes a fully selected sole group and preserves its collapsed visibility through undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createAddSheetOutlineGroupCommand(sheet.id, {
        id: "only",
        axis: "row",
        start: 1,
        end: 3,
        collapsed: true,
      }),
    );
    expect(
      executeWorkbookCommand(session, createUngroupSheetRangeCommand(sheet.id, "row", 1, 3)),
    ).toBe(true);
    expect(sheet.outlineGroups).toEqual([]);
    expect(sheet.hiddenRows).toEqual(new Set([1, 2, 3]));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.outlineGroups).toEqual([
      { id: "only", axis: "row", start: 1, end: 3, collapsed: true },
    ]);
    expect(sheet.hiddenRows).toEqual(new Set());
  });
  test("converts only removed collapsed outline coverage to manual hiding when ungrouping", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const group of [
      { id: "outer", axis: "row" as const, start: 0, end: 10, collapsed: false },
      { id: "inner", axis: "row" as const, start: 2, end: 5, collapsed: true },
    ]) {
      executeWorkbookCommand(session, createAddSheetOutlineGroupCommand(sheet.id, group));
    }
    executeWorkbookCommand(session, createUngroupSheetRangeCommand(sheet.id, "row", 3, 4));
    expect(sheet.hiddenRows).toEqual(new Set([3, 4]));
    expect(getOutlineHiddenIntervals(sheet.outlineGroups ?? [], "row")).toEqual([
      { start: 2, end: 2 },
      { start: 5, end: 5 },
    ]);
  });
  test("does not make retained collapsed coverage permanently manual-hidden", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const group of [
      { id: "outer", axis: "row" as const, start: 0, end: 10, collapsed: true },
      { id: "inner", axis: "row" as const, start: 2, end: 5, collapsed: false },
    ]) {
      executeWorkbookCommand(session, createAddSheetOutlineGroupCommand(sheet.id, group));
    }
    executeWorkbookCommand(session, createUngroupSheetRangeCommand(sheet.id, "row", 3, 4));
    expect(sheet.hiddenRows).toEqual(new Set());
    expect(getOutlineHiddenIntervals(sheet.outlineGroups ?? [], "row")).toEqual([
      { start: 0, end: 10 },
    ]);
  });
  test("clears outline groups while retaining collapsed and manual hidden axes", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.hiddenRows!.add(20);
    executeWorkbookCommand(
      session,
      createAddSheetOutlineGroupCommand(sheet.id, {
        id: "collapsed",
        axis: "row",
        start: 1,
        end: 2,
        collapsed: true,
      }),
    );
    expect(executeWorkbookCommand(session, createClearSheetOutlineCommand(sheet.id))).toBe(true);
    expect(sheet.outlineGroups).toEqual([]);
    expect(sheet.hiddenRows).toEqual(new Set([1, 2, 20]));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.hiddenRows).toEqual(new Set([20]));
    expect(sheet.outlineGroups).toEqual([
      { id: "collapsed", axis: "row", start: 1, end: 2, collapsed: true },
    ]);
  });
  test("sets multiple outline controls atomically", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const id of ["one", "two"]) {
      executeWorkbookCommand(
        session,
        createAddSheetOutlineGroupCommand(sheet.id, {
          id,
          axis: "column",
          start: id === "one" ? 1 : 3,
          end: id === "one" ? 1 : 3,
          collapsed: false,
        }),
      );
    }
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetOutlineGroupsCollapsedCommand(sheet.id, ["one", "two"], true),
      ),
    ).toBe(true);
    expect(sheet.outlineGroups?.every((group) => group.collapsed)).toBe(true);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.outlineGroups?.some((group) => group.collapsed)).toBe(false);
  });
  test("evaluates custom formulas against a proposed edit and resolves named list ranges", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "open" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "closed" });
    session.workbook.definedNames.set("states", {
      id: "states",
      name: "states",
      reference: { sheetId: sheet.id, start: { row: 0, column: 1 }, end: { row: 1, column: 1 } },
    });
    const context = { workbook: session.workbook, sheet, address: { row: 2, column: 0 } };
    expect(
      resolveDataValidationListValues(
        {
          id: "list",
          range: { start: { row: 0, column: 0 }, end: { row: 9, column: 0 } },
          type: "list",
          formula1: "states",
          allowBlank: false,
        },
        context,
      ),
    ).toEqual(["open", "closed"]);
    const rule = {
      id: "positive",
      range: { start: { row: 0, column: 0 }, end: { row: 9, column: 0 } },
      type: "custom" as const,
      formula1: "=A1>0",
      allowBlank: false,
    };
    expect(validateCellContentDataValidation(rule, { kind: "literal", value: 2 }, context)).toEqual(
      { valid: true },
    );
    expect(
      validateCellContentDataValidation(rule, { kind: "literal", value: -1 }, context),
    ).toEqual({ valid: false, reason: "custom" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: 3 });
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: 5 });
    const bounded = {
      id: "bound",
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      type: "whole" as const,
      operator: "lessThanOrEqual" as const,
      formula1: "=C1",
      allowBlank: false,
    };
    expect(validateCellContentDataValidation(bounded, null, context)).toEqual({
      valid: false,
      reason: "blank",
    });
    expect(
      validateCellContentDataValidation(
        { ...bounded, allowBlank: true },
        { kind: "formula", formula: { source: '=IF(1=1,"",0)' } },
        context,
      ),
    ).toEqual({ valid: true });
    expect(
      validateCellContentDataValidation(
        bounded,
        { kind: "literal", value: 3 },
        { workbook: session.workbook, sheet, address: { row: 0, column: 0 } },
      ),
    ).toEqual({ valid: true });
    expect(
      validateCellContentDataValidation(
        bounded,
        { kind: "literal", value: 4 },
        { workbook: session.workbook, sheet, address: { row: 0, column: 0 } },
      ),
    ).toEqual({ valid: false, reason: "operator" });
    expect(
      validateCellContentDataValidation(
        bounded,
        { kind: "literal", value: 5 },
        { workbook: session.workbook, sheet, address: { row: 1, column: 0 } },
      ),
    ).toEqual({ valid: true });
  });
  test("rebases relative custom formulas after a partial validation clear and persists fragments", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const rule = {
      id: "positive",
      range: { start: { row: 0, column: 0 }, end: { row: 9, column: 0 } },
      type: "custom" as const,
      formula1: "=A1>0",
      allowBlank: false,
    };
    expect(
      executeWorkbookCommand(session, createSetSheetDataValidationsCommand(sheet.id, [rule])),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        session,
        createClearSheetDataValidationsCommand(sheet.id, {
          start: { row: 4, column: 0 },
          end: { row: 4, column: 0 },
        }),
      ),
    ).toBe(true);
    const lower = sheet.dataValidations!.find((entry) => entry.range.start.row === 5)!;
    expect(lower.formula1).toBe("=A6>0");
    expect(
      validateCellContentDataValidation(
        lower,
        { kind: "literal", value: 2 },
        { workbook: session.workbook, sheet, address: { row: 5, column: 0 } },
      ),
    ).toEqual({ valid: true });
    expect(
      deserializeWorkbook(serializeWorkbook(session.workbook)).sheets.get(sheet.id)
        ?.dataValidations,
    ).toEqual(sheet.dataValidations);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.dataValidations).toEqual([rule]);
  });
});
