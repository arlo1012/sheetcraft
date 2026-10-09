import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  getCellContent,
  getCellStyle,
  MAX_SHEET_ROWS,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { createSheetGridViewState } from "@sheetcraft/sheet-engine/view-state";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { createAppI18n } from "../../../shared/i18n";

type Controller = ReturnType<typeof useSpreadsheetWorkspaceController>;
let wrapper: ReturnType<typeof mount> | undefined;

function mountController(): Controller {
  let controller: Controller | undefined;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  if (!controller) throw new Error("Controller did not initialize");
  return controller;
}

afterEach(() => wrapper?.unmount());

describe("number conversion selection commands", () => {
  test("converts the active cell, selection, and sparse current sheet as separate commands", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const first = { row: 0, column: 0 };
    const second = { row: 0, column: 1 };
    const numericText = { row: 0, column: 2 };
    const formula = { row: 0, column: 3 };
    const distant = { row: 700, column: 500 };
    const precisionSensitive = { row: 701, column: 500 };
    setCellContent(sheet, first, { kind: "literal", value: "12" });
    setCellContent(sheet, second, { kind: "literal", value: "25%" });
    setCellContent(sheet, numericText, { kind: "literal", value: "not a number" });
    setCellContent(sheet, formula, { kind: "formula", formula: { source: "=1+1" } });
    setCellContent(sheet, distant, { kind: "literal", value: "3.5" });
    setCellContent(sheet, precisionSensitive, {
      kind: "literal",
      value: "11111111111111111111",
    });

    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: { active: first, anchor: first, focus: second, mode: "cells" },
      }),
    );
    controller.convertNumberType("text-to-number", "cell");
    expect(getCellContent(sheet, first)).toEqual({ kind: "literal", value: 12 });
    expect(getCellContent(sheet, second)).toEqual({ kind: "literal", value: "25%" });
    expect(controller.session.history.undoStack).toHaveLength(1);

    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: { active: second, anchor: second, focus: formula, mode: "cells" },
      }),
    );
    controller.convertNumberType("text-to-number", "selection");
    expect(getCellContent(sheet, second)).toEqual({ kind: "literal", value: 0.25 });
    expect(getCellContent(sheet, numericText)).toEqual({ kind: "literal", value: "not a number" });
    expect(getCellContent(sheet, formula)).toEqual({
      kind: "formula",
      formula: { source: "=1+1" },
    });
    expect(controller.session.history.undoStack).toHaveLength(2);

    controller.convertNumberType("text-to-number", "sheet");
    expect(getCellContent(sheet, distant)).toEqual({ kind: "literal", value: 3.5 });
    expect(getCellContent(sheet, precisionSensitive)).toEqual({
      kind: "literal",
      value: "11111111111111111111",
    });
    expect(controller.session.history.undoStack).toHaveLength(3);
    controller.undo();
    expect(getCellContent(sheet, distant)).toEqual({ kind: "literal", value: "3.5" });
    controller.redo();
    expect(getCellContent(sheet, distant)).toEqual({ kind: "literal", value: 3.5 });
  });

  test("converts a sparse full-column selection with one undo and preserves unrelated cells", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const first = { row: 0, column: 0 };
    const last = { row: 50, column: 0 };
    const outside = { row: 0, column: 1 };
    setCellContent(sheet, first, { kind: "literal", value: "12.5" });
    setCellStyle(sheet, first, { bold: true, numberFormat: { kind: "text" } });
    setCellContent(sheet, last, { kind: "literal", value: "25%" });
    setCellContent(sheet, outside, { kind: "literal", value: "75" });
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          active: first,
          anchor: first,
          focus: { row: MAX_SHEET_ROWS - 1, column: 0 },
          mode: "columns",
        },
      }),
    );

    expect(controller.isFormattingSupported.value).toBe(false);
    controller.convertNumberType("text-to-number");
    expect(getCellContent(sheet, first)).toEqual({ kind: "literal", value: 12.5 });
    expect(getCellContent(sheet, last)).toEqual({ kind: "literal", value: 0.25 });
    expect(getCellContent(sheet, outside)).toEqual({ kind: "literal", value: "75" });
    expect(getCellStyle(sheet, first)).toEqual({ bold: true });
    expect(controller.workspaceStatusText.value).toContain("Converted 2 cells");
    expect(controller.session.history.undoStack).toHaveLength(1);

    controller.undo();
    expect(getCellContent(sheet, first)).toEqual({ kind: "literal", value: "12.5" });
    expect(getCellStyle(sheet, first)).toEqual({ bold: true, numberFormat: { kind: "text" } });
    controller.redo();
    expect(getCellContent(sheet, last)).toEqual({ kind: "literal", value: 0.25 });
    controller.convertNumberType("number-to-text");
    expect(getCellContent(sheet, first)).toEqual({ kind: "literal", value: "12.5" });
    expect(getCellStyle(sheet, first)).toEqual({ bold: true, numberFormat: { kind: "text" } });
  });

  test("leaves no-op selections and protected sheets unchanged", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, { kind: "literal", value: "Not a number" });
    controller.convertNumberType("text-to-number");
    expect(controller.workspaceStatusText.value).toBe("No convertible cells found.");
    expect(controller.session.history.undoStack).toHaveLength(0);

    setCellContent(sheet, address, { kind: "literal", value: "123" });
    sheet.properties.protected = true;
    controller.convertNumberType("text-to-number");
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "123" });
    expect(controller.session.history.undoStack).toHaveLength(0);
  });
});
