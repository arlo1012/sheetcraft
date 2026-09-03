import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { getCellStyle, getCellValue, setCellStyle, setCellValue } from "@idea10/core/workbook";
import { createSheetGridViewState } from "@idea10/sheet-engine/view-state";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { createAppI18n } from "../../../shared/i18n";

type Controller = ReturnType<typeof useSpreadsheetWorkspaceController>;

let wrapper: ReturnType<typeof mount> | undefined;

function mountController(): Controller {
  let controller: Controller | undefined;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useSpreadsheetWorkspaceController({
          idFactory: createSequentialIdFactory(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n()] } },
  );
  if (!controller) {
    throw new Error("Workspace controller did not initialize.");
  }
  return controller;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe("spreadsheet workspace controller", () => {
  test("uses each sheet view state as the single source of selection", () => {
    const controller = mountController();
    const firstSheetId = controller.activeSheet.value.id;
    const firstViewState = createSheetGridViewState({
      selection: {
        active: { row: 3, column: 2 },
        anchor: { row: 1, column: 1 },
        focus: { row: 4, column: 5 },
        mode: "cells",
      },
      scrollPosition: { x: 120, y: 240 },
    });

    controller.updateActiveSheetViewState(firstViewState);
    expect(controller.activeAddress.value).toEqual({ row: 3, column: 2 });
    expect(controller.activeSelectionRange.value).toEqual({
      start: { row: 1, column: 1 },
      end: { row: 4, column: 5 },
    });

    controller.addSheet();
    expect(controller.activeAddress.value).toEqual({ row: 0, column: 0 });
    controller.selectSheet(firstSheetId);
    expect(controller.activeSheetViewState.value).toEqual(firstViewState);
    expect(controller.viewStates.size).toBe(1);
  });

  test("preserves deleted sheet view state so undo restores the same viewport", () => {
    const controller = mountController();
    const firstSheetId = controller.activeSheet.value.id;
    const firstViewState = createSheetGridViewState({
      selection: {
        active: { row: 8, column: 4 },
        anchor: { row: 8, column: 4 },
        focus: { row: 10, column: 6 },
        mode: "cells",
      },
      scrollPosition: { x: 80, y: 300 },
    });
    controller.updateActiveSheetViewState(firstViewState);
    controller.addSheet();
    controller.selectSheet(firstSheetId);

    controller.deleteSheet(firstSheetId);
    expect(controller.viewStates.has(firstSheetId)).toBe(true);
    expect(controller.session.workbook.sheets.has(firstSheetId)).toBe(false);

    expect(controller.undo()).toBe(true);
    expect(controller.activeSheet.value.id).toBe(firstSheetId);
    expect(controller.activeSheetViewState.value).toEqual(firstViewState);
  });

  test("discards deleted sheet view state after its history entry is evicted", () => {
    const controller = mountController();
    const firstSheetId = controller.activeSheet.value.id;
    controller.updateActiveSheetViewState(
      createSheetGridViewState({ scrollPosition: { x: 40, y: 160 } }),
    );
    controller.addSheet();
    controller.selectSheet(firstSheetId);
    controller.session.history.maxEntries = 1;

    controller.deleteSheet(firstSheetId);
    expect(controller.viewStates.has(firstSheetId)).toBe(true);

    controller.renameSheet({ sheetId: controller.activeSheet.value.id, name: "Retained" });
    expect(controller.viewStates.has(firstSheetId)).toBe(false);
  });

  test("pastes values without changing target formatting as one history entry", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const target = { row: 2, column: 3 };
    setCellValue(sheet, target, "target");
    setCellStyle(sheet, target, { bold: true });

    controller.pasteCells({
      kind: "values",
      plan: {
        anchor: target,
        range: { start: target, end: target },
        values: [["source"]],
      },
    });

    expect(getCellValue(sheet, target)).toBe("source");
    expect(getCellStyle(sheet, target)).toEqual({ bold: true });
    expect(controller.session.history.undoStack).toHaveLength(1);
    expect(controller.undo()).toBe(true);
    expect(getCellValue(sheet, target)).toBe("target");
    expect(getCellStyle(sheet, target)).toEqual({ bold: true });
  });

  test("pastes exact formatting without changing target values as one history entry", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const first = { row: 4, column: 2 };
    const second = { row: 4, column: 3 };
    setCellValue(sheet, first, "keep first");
    setCellValue(sheet, second, "keep second");
    setCellStyle(sheet, first, { italic: true });
    setCellStyle(sheet, second, { bold: true });

    controller.pasteCells({
      kind: "formats",
      plan: {
        anchor: first,
        range: { start: first, end: second },
        values: [["ignored", "ignored"]],
      },
      styles: [[{ bold: true }, null]],
    });

    expect(getCellValue(sheet, first)).toBe("keep first");
    expect(getCellValue(sheet, second)).toBe("keep second");
    expect(getCellStyle(sheet, first)).toEqual({ bold: true });
    expect(getCellStyle(sheet, second)).toBeUndefined();
    expect(controller.session.history.undoStack).toHaveLength(1);
    expect(controller.undo()).toBe(true);
    expect(getCellValue(sheet, first)).toBe("keep first");
    expect(getCellStyle(sheet, first)).toEqual({ italic: true });
    expect(getCellStyle(sheet, second)).toEqual({ bold: true });
  });

  test("adjusts decimals across a mixed selection as one reversible formatting entry", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const first = { row: 2, column: 1 };
    const second = { row: 2, column: 2 };
    setCellValue(sheet, first, 0.125);
    setCellStyle(sheet, first, { numberFormat: { kind: "number", fractionDigits: 2 } });
    setCellStyle(sheet, second, {
      numberFormat: { kind: "currency", currency: "CNY", fractionDigits: 4 },
    });
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: { active: first, anchor: first, focus: second, mode: "cells" },
      }),
    );

    controller.adjustNumberFormatDecimals(-1);

    expect(controller.activeCellInput.value).toBe("0.125");
    expect(getCellStyle(sheet, first)?.numberFormat).toEqual({ kind: "number", fractionDigits: 1 });
    expect(getCellStyle(sheet, second)?.numberFormat).toEqual({
      kind: "currency",
      currency: "CNY",
      fractionDigits: 3,
    });
    expect(controller.session.history.undoStack).toHaveLength(1);

    expect(controller.undo()).toBe(true);
    expect(getCellStyle(sheet, first)?.numberFormat?.fractionDigits).toBe(2);
    expect(getCellStyle(sheet, second)?.numberFormat?.fractionDigits).toBe(4);
  });

  test("paints captured formatting across a target selection without changing values", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const sourceStart = { row: 1, column: 1 };
    const sourceEnd = { row: 1, column: 2 };
    const targetStart = { row: 4, column: 4 };
    const targetEnd = { row: 5, column: 7 };
    setCellStyle(sheet, sourceStart, { bold: true, fillColor: "#123456" });
    setCellStyle(sheet, sourceEnd, { italic: true });
    setCellValue(sheet, targetStart, "keep first");
    setCellValue(sheet, targetEnd, "keep last");
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          active: sourceStart,
          anchor: sourceStart,
          focus: sourceEnd,
          mode: "cells",
        },
      }),
    );

    controller.activateFormatPainter();
    expect(controller.formatPainterActive.value).toBe(true);
    controller.applyFormatPainterTarget({ start: targetStart, end: targetEnd });

    expect(getCellValue(sheet, targetStart)).toBe("keep first");
    expect(getCellValue(sheet, targetEnd)).toBe("keep last");
    expect(getCellStyle(sheet, { row: 4, column: 4 })).toEqual({
      bold: true,
      fillColor: "#123456",
    });
    expect(getCellStyle(sheet, { row: 4, column: 5 })).toEqual({ italic: true });
    expect(getCellStyle(sheet, { row: 5, column: 4 })).toEqual({
      bold: true,
      fillColor: "#123456",
    });
    expect(controller.session.history.undoStack).toHaveLength(1);
    expect(controller.formatPainterActive.value).toBe(false);

    expect(controller.undo()).toBe(true);
    expect(getCellStyle(sheet, targetStart)).toBeUndefined();
    expect(getCellStyle(sheet, targetEnd)).toBeUndefined();
  });

  test("keeps format painter armed when the target range cannot tile the captured format", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const sourceStart = { row: 1, column: 1 };
    const sourceEnd = { row: 1, column: 2 };
    setCellStyle(sheet, sourceStart, { bold: true });
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          active: sourceStart,
          anchor: sourceStart,
          focus: sourceEnd,
          mode: "cells",
        },
      }),
    );

    controller.activateFormatPainter();
    controller.applyFormatPainterTarget({
      start: { row: 4, column: 4 },
      end: { row: 4, column: 6 },
    });

    expect(controller.formatPainterActive.value).toBe(true);
    expect(controller.session.history.undoStack).toHaveLength(0);
    expect(controller.workspaceStatusText.value).toBe(
      "The target selection does not fit the copied formatting.",
    );

    controller.cancelFormatPainter();
    expect(controller.formatPainterActive.value).toBe(false);
  });
});
