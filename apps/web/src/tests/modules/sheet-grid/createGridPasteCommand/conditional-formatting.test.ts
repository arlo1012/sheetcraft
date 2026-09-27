import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet, getCellValue, setCellValue } from "@idea10/core/workbook";
import {
  createWorkbookHistory,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";
import { createGridPasteCommand } from "../../../../modules/sheet-grid/createGridPasteCommand";

function fixture() {
  const workbook = createWorkbook({ id: "test", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const session = {
    workbook,
    history: createWorkbookHistory(),
    idFactory: createSequentialIdFactory(),
  };
  const rule: SheetConditionalFormatRule = {
    id: "source",
    ranges: [{ start: { row: 0, column: 0 }, end: { row: 1, column: 0 } }],
    anchor: { row: 0, column: 0 },
    condition: { kind: "formula", formula: "=A1>$B$1" },
    style: { fillColor: "#ff0000" },
  };
  sheet.conditionalFormats = [rule];
  return { sheet, session, rule };
}

describe("conditional format clipboard transactions", () => {
  test("copies formulas and rules with cells and undoes both in one step", () => {
    const { sheet, session, rule } = fixture();
    const sourceRange = rule.ranges[0]!;
    const range = { start: { row: 3, column: 2 }, end: { row: 4, column: 2 } };
    const command = createGridPasteCommand(sheet, {
      kind: "all",
      plan: { anchor: range.start, range, values: [[10], [20]] },
      contents: [[{ kind: "literal", value: 10 }], [{ kind: "literal", value: 20 }]],
      sourceRange,
      conditionalFormats: [rule],
    });
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.conditionalFormats?.[0]?.condition).toEqual({
      kind: "formula",
      formula: "=C4>$B$1",
    });
    expect(sheet.conditionalFormats?.[0]?.ranges).toEqual([range]);
    expect(getCellValue(sheet, range.start)).toBe(10);
    undoWorkbookCommand(session);
    expect(sheet.conditionalFormats).toEqual([rule]);
    expect(getCellValue(sheet, range.start)).toBeNull();
    redoWorkbookCommand(session);
    expect(sheet.conditionalFormats).toHaveLength(2);
  });
  test("formats-only replaces destination rules even when copied cells have no rules", () => {
    const { sheet, session, rule } = fixture();
    setCellValue(sheet, rule.anchor, 7);
    const range = rule.ranges[0]!;
    const command = createGridPasteCommand(sheet, {
      kind: "formats",
      plan: { anchor: range.start, range, values: [[null], [null]] },
      styles: [[null], [null]],
      sourceRange: { start: { row: 5, column: 0 }, end: { row: 6, column: 0 } },
      conditionalFormats: [],
    });
    executeWorkbookCommand(session, command);
    expect(sheet.conditionalFormats).toEqual([]);
    expect(getCellValue(sheet, rule.anchor)).toBe(7);
    undoWorkbookCommand(session);
    expect(sheet.conditionalFormats).toEqual([rule]);
  });
  test("values-only keeps destination rules intact", () => {
    const { sheet, session, rule } = fixture();
    const range = rule.ranges[0]!;
    executeWorkbookCommand(
      session,
      createGridPasteCommand(sheet, {
        kind: "values",
        plan: { anchor: range.start, range, values: [[1], [2]] },
      }),
    );
    expect(sheet.conditionalFormats).toEqual([rule]);
  });
  test("filtered copies carry rules only to visible rows and translate their formulas", () => {
    const { sheet, rule } = fixture();
    const range = { start: { row: 4, column: 2 }, end: { row: 6, column: 2 } };
    const command = createGridPasteCommand(sheet, {
      kind: "formats",
      plan: {
        anchor: range.start,
        range,
        values: [[1], [2]],
        rows: [4, 6],
        preserveHiddenRows: true,
      },
      styles: [[null], [null]],
      sourceRange: rule.ranges[0]!,
      conditionalFormats: [rule],
    });
    expect(command.type).toBe("setCellContents");
    if (command.type !== "setCellContents") return;
    const copy = command.conditionalFormats?.[0]?.rules[0];
    expect(copy?.ranges).toEqual([
      { start: { row: 4, column: 2 }, end: { row: 4, column: 2 } },
      { start: { row: 6, column: 2 }, end: { row: 6, column: 2 } },
    ]);
    expect(copy?.condition).toEqual({ kind: "formula", formula: "=C5>$B$1" });
  });
});
