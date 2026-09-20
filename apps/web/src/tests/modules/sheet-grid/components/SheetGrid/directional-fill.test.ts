import { describe, expect, test } from "vitest";
import {
  executeReplaceableWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@idea10/core/history";
import { getCellContent, setCellContent, setCellStyle, getCellStyle } from "@idea10/core/workbook";
import { createCellFillActions } from "../../../../../modules/sheet-grid/cell-fill-actions";
import { mountSheetGrid, triggerCell } from "./fixture";

describe("SheetGrid directional fill entry", () => {
  test.each([
    { direction: "up" as const, source: { row: 2, column: 1 }, formula: "A3", expected: "A2" },
    { direction: "left" as const, source: { row: 1, column: 2 }, formula: "C1", expected: "B1" },
  ])(
    "fills $direction with translated formulas and one undo step",
    async ({ direction, source, formula, expected }) => {
      const target = { row: 1, column: 1 };
      const { wrapper, session, sheet } = mountSheetGrid({
        beforeMount(current) {
          setCellContent(current, target, { kind: "literal", value: "original" });
          setCellStyle(current, target, { italic: true });
          setCellContent(current, source, { kind: "formula", formula: { source: `=${formula}` } });
          setCellStyle(current, source, { bold: true });
        },
      });
      const actions = createCellFillActions({
        getWorkbook: () => session.workbook,
        getSheetId: () => sheet.id,
        getRevision: () => 0,
        execute: (command, token) => executeReplaceableWorkbookCommand(session, token, command),
      });
      await wrapper.setProps({ applyFill: actions.apply, workbookRevision: 0 });
      await triggerCell(wrapper, target, "mousedown", { button: 0 });
      await triggerCell(wrapper, source, "mousedown", { button: 0, shiftKey: true });

      expect(wrapper.vm.fillSelection(direction)).toBe(true);
      expect(getCellContent(sheet, target)).toEqual({
        kind: "formula",
        formula: { source: `=${expected}` },
      });
      expect(getCellStyle(sheet, target)?.bold).toBe(true);
      expect(session.history.undoStack).toHaveLength(1);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(getCellContent(sheet, target)).toEqual({ kind: "literal", value: "original" });
      expect(getCellStyle(sheet, target)?.italic).toBe(true);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(getCellContent(sheet, target)).toEqual({
        kind: "formula",
        formula: { source: `=${expected}` },
      });
      wrapper.unmount();
    },
  );
});
