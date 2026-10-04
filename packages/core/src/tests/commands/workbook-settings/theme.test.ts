import { describe, expect, test } from "vitest";
import {
  createApplyCellStyleCommand,
  createSetWorkbookThemeCommand,
} from "../../../commands/index.js";
import { createBuiltinCellStyles } from "../../../cell-styles.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../../serialization.js";
import { getActiveSheet, getCellStyle } from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

describe("workbook themes", () => {
  test("updates only theme-bound styles and restores them through history and snapshots", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const target = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
    const heading = createBuiltinCellStyles().find((style) => style.id === "heading-1")!;
    executeWorkbookCommand(session, createApplyCellStyleCommand(sheet.id, target, heading));
    const next = {
      ...session.workbook.theme,
      id: "test",
      name: "Test",
      accentColors: ["#112233", "#223344", "#334455", "#445566", "#556677", "#667788"] as [
        string,
        string,
        string,
        string,
        string,
        string,
      ],
    };
    expect(executeWorkbookCommand(session, createSetWorkbookThemeCommand(next))).toBe(true);
    expect(getCellStyle(sheet, target.start)?.textColor).toBe("#112233");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, target.start)?.textColor).toBe("#4f81bd");
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(deserializeWorkbook(serializeWorkbook(session.workbook)).theme).toEqual(next);
  });
});
