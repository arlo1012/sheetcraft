import { describe, expect, test } from "vitest";
import {
  createClearSheetConditionalFormatsCommand,
  createSetSheetConditionalFormatsCommand,
} from "../../commands/conditional-formatting.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

const rule = {
  id: "overdue",
  ranges: [{ start: { row: 1, column: 1 }, end: { row: 5, column: 5 } }],
  anchor: { row: 1, column: 1 },
  condition: { kind: "formula" as const, formula: '=$A2="overdue"' },
  style: { fillColor: "#FEE2E2", textColor: "#B91C1C", bold: true },
  stopIfTrue: true,
};

describe("conditional-formatting commands", () => {
  test("persists rules and restores an exact state through undo and redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    expect(
      executeWorkbookCommand(session, createSetSheetConditionalFormatsCommand(sheet.id, [rule])),
    ).toBe(true);
    const persisted = serializeWorkbook(session.workbook);
    expect(persisted.version).toBe(16);
    expect(deserializeWorkbook(persisted).sheets.get(sheet.id)?.conditionalFormats).toEqual([rule]);
    expect(deserializeSheet(serializeSheet(sheet)).conditionalFormats).toEqual([rule]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.conditionalFormats).toEqual([]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.conditionalFormats).toEqual([rule]);
  });

  test("subtracts a cleared rectangle while retaining the rule anchor and fragments", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createSetSheetConditionalFormatsCommand(sheet.id, [rule]));
    expect(
      executeWorkbookCommand(
        session,
        createClearSheetConditionalFormatsCommand(sheet.id, {
          start: { row: 2, column: 2 },
          end: { row: 4, column: 4 },
        }),
      ),
    ).toBe(true);
    expect(sheet.conditionalFormats).toEqual([
      {
        ...rule,
        ranges: [
          { start: { row: 1, column: 1 }, end: { row: 1, column: 5 } },
          { start: { row: 5, column: 1 }, end: { row: 5, column: 5 } },
          { start: { row: 2, column: 1 }, end: { row: 4, column: 1 } },
          { start: { row: 2, column: 5 }, end: { row: 4, column: 5 } },
        ],
      },
    ]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.conditionalFormats).toEqual([rule]);
  });
});
