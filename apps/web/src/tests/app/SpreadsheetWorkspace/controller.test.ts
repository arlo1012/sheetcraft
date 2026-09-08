import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  getCellStyle,
  getCellComputedValue,
  getCellContent,
  getCellValue,
  getWorkbookSheets,
  setCellStyle,
  setCellContent,
  setCellValue,
} from "@idea10/core/workbook";
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
  test("keeps formula source in the formula bar while the grid consumes its computed value", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    setCellValue(sheet, { row: 0, column: 0 }, 4);
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          active: { row: 0, column: 1 },
          anchor: { row: 0, column: 1 },
          focus: { row: 0, column: 1 },
          mode: "cells",
        },
      }),
    );

    controller.commitCell({ address: { row: 0, column: 1 }, input: "=A1 * 2" });

    expect(controller.activeCellInput.value).toBe("=A1 * 2");
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A1 * 2" },
    });
    expect(getCellComputedValue(sheet, { row: 0, column: 1 })).toBe(8);
  });

  test("keeps leading zeroes and formula-like input literal for a text-formatted cell", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const address = { row: 0, column: 0 };
    setCellStyle(sheet, address, { numberFormat: { kind: "text" } });

    controller.commitCell({ address, input: "0012" });
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "0012" });
    expect(controller.session.history.undoStack).toHaveLength(1);

    controller.commitCell({ address, input: "'=A1+1" });
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "=A1+1" });
    expect(controller.session.history.undoStack).toHaveLength(2);
    controller.undo();
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "0012" });
  });

  test("rebases copied formula content and dispatches local cuts to the move command", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    setCellValue(sheet, { row: 0, column: 0 }, 7);
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      {
        kind: "formula",
        formula: { source: "=A1 + 1" },
      },
    );

    controller.pasteCells({
      kind: "all",
      plan: {
        anchor: { row: 1, column: 2 },
        range: { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } },
        values: [[8]],
      },
      contents: [[{ kind: "formula", formula: { source: "=A1 + 1" } }]],
      sourceRange: { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } },
    });
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=B2 + 1" },
    });

    controller.pasteCells({
      kind: "all",
      plan: {
        anchor: { row: 2, column: 3 },
        range: { start: { row: 2, column: 3 }, end: { row: 2, column: 3 } },
        values: [[8]],
      },
      moveSource: { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } },
    });
    expect(getCellContent(sheet, { row: 0, column: 1 })).toBeNull();
    expect(getCellContent(sheet, { row: 2, column: 3 })).toEqual({
      kind: "formula",
      formula: { source: "=A1 + 1" },
    });
  });

  test("inserts Core's AutoSum recommendation as one reversible formula edit", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    setCellValue(sheet, { row: 0, column: 2 }, 2);
    setCellValue(sheet, { row: 1, column: 2 }, 3);
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          active: { row: 2, column: 2 },
          anchor: { row: 2, column: 2 },
          focus: { row: 2, column: 2 },
          mode: "cells",
        },
      }),
    );

    controller.autoSum();

    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(C1:C2)" },
    });
    expect(getCellComputedValue(sheet, { row: 2, column: 2 })).toBe(5);
    expect(controller.workspaceStatusText.value).toBe("Inserted =SUM(C1:C2)");
    expect(controller.session.history.undoStack).toHaveLength(1);
    expect(controller.undo()).toBe(true);
    expect(getCellContent(sheet, { row: 2, column: 2 })).toBeNull();
  });

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

  test("keeps selection-derived state stable for scroll-only view updates", () => {
    const controller = mountController();
    const selection = {
      active: { row: 3, column: 2 },
      anchor: { row: 1, column: 1 },
      focus: { row: 4, column: 5 },
      mode: "cells" as const,
    };
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection,
        scrollPosition: { x: 120, y: 240 },
        gridExtent: { rowCount: 120, columnCount: 40 },
      }),
    );

    const initialSelection = controller.activeSheetViewState.value?.selection;
    const initialAddress = controller.activeAddress.value;
    const initialSummary = controller.activeSelectionSummary.value;
    const initialStyle = controller.activeSelectionStyle.value;
    const initialDataToolState = controller.dataToolState.value;

    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          ...selection,
          active: { ...selection.active },
          anchor: { ...selection.anchor },
          focus: { ...selection.focus },
        },
        scrollPosition: { x: 480, y: 720 },
        gridExtent: { rowCount: 240, columnCount: 80 },
      }),
    );

    expect(controller.activeSheetViewState.value?.selection).toBe(initialSelection);
    expect(controller.activeSheetViewState.value?.scrollPosition).toEqual({ x: 480, y: 720 });
    expect(controller.activeSheetViewState.value?.gridExtent).toEqual({
      rowCount: 240,
      columnCount: 80,
    });
    expect(controller.activeAddress.value).toBe(initialAddress);
    expect(controller.activeSelectionSummary.value).toBe(initialSummary);
    expect(controller.activeSelectionStyle.value).toBe(initialStyle);
    expect(controller.dataToolState.value).toBe(initialDataToolState);

    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          active: { row: 8, column: 6 },
          anchor: { row: 8, column: 6 },
          focus: { row: 9, column: 7 },
          mode: "cells",
        },
        scrollPosition: { x: 480, y: 720 },
        gridExtent: { rowCount: 240, columnCount: 80 },
      }),
    );

    expect(controller.activeSheetViewState.value?.selection).not.toBe(initialSelection);
    expect(controller.activeAddress.value).toEqual({ row: 8, column: 6 });
    expect(controller.activeAddress.value).not.toBe(initialAddress);
    expect(controller.activeSelectionSummary.value).not.toBe(initialSummary);
    expect(controller.activeSelectionStyle.value).not.toBe(initialStyle);
    expect(controller.dataToolState.value).not.toBe(initialDataToolState);
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

  test("duplicates and reorders sheets through one reversible Core command each", () => {
    const controller = mountController();
    const sourceSheetId = controller.activeSheet.value.id;
    controller.addSheet();
    controller.addSheet();
    controller.selectSheet(sourceSheetId);
    controller.session.history.undoStack.splice(0);
    controller.session.history.redoStack.splice(0);
    const initialSheetIds = getWorkbookSheets(controller.session.workbook).map((sheet) => sheet.id);

    controller.duplicateSheet(sourceSheetId);

    const duplicateSheetId = controller.activeSheet.value.id;
    expect(getWorkbookSheets(controller.session.workbook).map((sheet) => sheet.id)).toEqual([
      sourceSheetId,
      duplicateSheetId,
      ...initialSheetIds.slice(1),
    ]);
    expect(controller.activeSheet.value.name).toBe("Sheet1 (2)");
    expect(controller.workspaceStatusText.value).toBe("Duplicated Sheet1 (2)");
    expect(controller.session.history.undoStack).toHaveLength(1);

    expect(controller.undo()).toBe(true);
    expect(controller.activeSheet.value.id).toBe(sourceSheetId);
    expect(controller.redo()).toBe(true);
    expect(controller.activeSheet.value.id).toBe(duplicateSheetId);

    controller.moveSheet({ sheetId: sourceSheetId, toIndex: 2 });

    expect(getWorkbookSheets(controller.session.workbook).map((sheet) => sheet.id)).toEqual([
      duplicateSheetId,
      initialSheetIds[1],
      sourceSheetId,
      initialSheetIds[2],
    ]);
    expect(controller.activeSheet.value.id).toBe(duplicateSheetId);
    expect(controller.workspaceStatusText.value).toBe("Moved Sheet1 to position 3");
    expect(controller.session.history.undoStack).toHaveLength(2);

    expect(controller.undo()).toBe(true);
    expect(getWorkbookSheets(controller.session.workbook).map((sheet) => sheet.id)).toEqual([
      sourceSheetId,
      duplicateSheetId,
      ...initialSheetIds.slice(1),
    ]);
    expect(controller.activeSheet.value.id).toBe(duplicateSheetId);
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
