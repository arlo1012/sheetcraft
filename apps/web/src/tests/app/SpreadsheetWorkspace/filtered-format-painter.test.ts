import { defineComponent, h } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
  setCellValue,
  type CellAddress,
  type CellRange,
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
        controller = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  if (!controller) throw new Error("Workspace controller did not initialize.");
  return controller;
}

function selectRange(
  controller: Controller,
  range: CellRange,
  active: CellAddress = range.start,
): void {
  controller.updateActiveSheetViewState(
    createSheetGridViewState({
      selection: {
        active: { ...active },
        anchor: { ...range.start },
        focus: { ...range.end },
        mode: "cells",
      },
    }),
  );
}

function setVisibleRowFilter(controller: Controller): void {
  const sheet = controller.activeSheet.value;
  sheet.filter = {
    range: { start: { row: 0, column: 0 }, end: { row: 4, column: 2 } },
    columns: [{ column: 0, allowedValues: [{ kind: "string", value: "show" }] }],
  };
  setCellValue(sheet, { row: 0, column: 0 }, "Status");
  setCellValue(sheet, { row: 1, column: 0 }, "show");
  setCellValue(sheet, { row: 2, column: 0 }, "hidden");
  setCellValue(sheet, { row: 3, column: 0 }, "show");
  setCellValue(sheet, { row: 4, column: 0 }, "show");
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe("filtered format painter", () => {
  test("captures only visible source styles and applies them only to visible destination rows", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    setVisibleRowFilter(controller);
    setCellStyle(sheet, { row: 1, column: 1 }, { bold: true });
    setCellStyle(sheet, { row: 2, column: 1 }, { italic: true });
    setCellStyle(sheet, { row: 3, column: 1 }, { underline: true });
    setCellStyle(sheet, { row: 4, column: 1 }, { fillColor: "#123456" });
    for (const row of [1, 2, 3, 4]) {
      setCellContent(
        sheet,
        { row, column: 2 },
        {
          kind: "formula",
          formula: { source: `=A${row + 1}` },
        },
      );
    }
    setCellStyle(sheet, { row: 2, column: 2 }, { italic: true });
    selectRange(controller, {
      start: { row: 1, column: 1 },
      end: { row: 4, column: 1 },
    });

    controller.activateFormatPainter();
    controller.applyFormatPainterTarget({
      start: { row: 1, column: 2 },
      end: { row: 4, column: 2 },
    });

    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=A2" },
    });
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=A3" },
    });
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toEqual({ bold: true });
    expect(getCellStyle(sheet, { row: 2, column: 2 })).toEqual({ italic: true });
    expect(getCellStyle(sheet, { row: 3, column: 2 })).toEqual({ underline: true });
    expect(getCellStyle(sheet, { row: 4, column: 2 })).toEqual({ fillColor: "#123456" });
    expect(controller.session.history.undoStack).toHaveLength(1);
    expect(controller.formatPainterActive.value).toBe(false);

    expect(controller.undo()).toBe(true);
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=A2" },
    });
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 2, column: 2 })).toEqual({ italic: true });
    expect(getCellStyle(sheet, { row: 3, column: 2 })).toBeUndefined();
  });

  test("keeps format painter armed when its target intersects merged cells", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    setCellStyle(sheet, { row: 1, column: 1 }, { bold: true });
    sheet.mergedCells = [{ start: { row: 3, column: 3 }, end: { row: 3, column: 4 } }];
    selectRange(controller, {
      start: { row: 1, column: 1 },
      end: { row: 1, column: 1 },
    });

    controller.activateFormatPainter();
    controller.applyFormatPainterTarget({
      start: { row: 3, column: 3 },
      end: { row: 3, column: 4 },
    });

    expect(controller.formatPainterActive.value).toBe(true);
    expect(controller.session.history.undoStack).toHaveLength(0);
    expect(controller.workspaceStatusText.value).toBe(
      "Copying, cutting, or pasting merged cells is not supported. Unmerge them first.",
    );
    expect(getCellStyle(sheet, { row: 3, column: 3 })).toBeUndefined();
  });
});
