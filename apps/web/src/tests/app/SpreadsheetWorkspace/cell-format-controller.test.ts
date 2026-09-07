import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createWorkbook, getCellStyle, setCellStyle, setCellValue } from "@idea10/core/workbook";
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
  if (!controller) throw new Error("Controller did not initialize");
  return controller;
}
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe("cell format selection commands", () => {
  test("captures mixed fields and applies the complete dialog to its original range with one undo", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const first = { row: 0, column: 0 };
    const second = { row: 0, column: 1 };
    setCellValue(sheet, first, 123.45);
    setCellStyle(sheet, first, { bold: true, fillColor: "#ff0000" });
    setCellStyle(sheet, second, { italic: true, fillColor: "#0000ff" });
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          active: first,
          anchor: first,
          focus: second,
          mode: "cells",
        },
      }),
    );
    const target = controller.captureCellFormatSelection()!;
    expect(target.state.bold).toBe("mixed");
    expect(target.state.fillColor.mixed).toBe(true);
    expect(target.sampleValue).toBe(123.45);
    expect(controller.applyCellFormat({}, target)).toBe(true);
    expect(controller.session.history.undoStack).toHaveLength(0);
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          active: { row: 4, column: 4 },
          anchor: { row: 4, column: 4 },
          focus: { row: 4, column: 4 },
          mode: "cells",
        },
      }),
    );
    expect(
      controller.applyCellFormat(
        {
          style: {
            horizontalAlign: "center",
            numberFormat: { kind: "percent", fractionDigits: 2 },
          },
          borders: [{ preset: "outer", border: { style: "dashDot", color: "#22a06b" } }],
        },
        target,
      ),
    ).toBe(true);
    expect(controller.session.history.undoStack).toHaveLength(1);
    expect(getCellStyle(sheet, first)).toMatchObject({
      bold: true,
      fillColor: "#ff0000",
      horizontalAlign: "center",
      borderTop: { style: "dashDot", color: "#22a06b" },
    });
    expect(getCellStyle(sheet, second)).toMatchObject({
      italic: true,
      fillColor: "#0000ff",
      horizontalAlign: "center",
    });
    expect(getCellStyle(sheet, { row: 4, column: 4 })).toBeUndefined();
    controller.undo();
    expect(getCellStyle(sheet, first)).toEqual({ bold: true, fillColor: "#ff0000" });
    expect(getCellStyle(sheet, second)).toEqual({ italic: true, fillColor: "#0000ff" });
  });

  test("updates existing border color immediately, preserves its line style and creates no new border", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const address = { row: 0, column: 0 };
    setCellStyle(sheet, address, { borderBottom: { style: "double", color: "#20242c" } });
    controller.updateBorderFormat({ color: "#ff0000" });
    expect(getCellStyle(sheet, address)).toEqual({
      borderBottom: { style: "double", color: "#ff0000" },
    });
    expect(controller.session.history.undoStack).toHaveLength(1);
    controller.undo();
    expect(getCellStyle(sheet, address)?.borderBottom?.color).toBe("#20242c");
    setCellStyle(sheet, address, undefined);
    controller.updateBorderFormat({ color: "#0000ff" });
    expect(getCellStyle(sheet, address)).toBeUndefined();
    expect(controller.session.history.undoStack).toHaveLength(0);
  });

  test("rejects protected targets and snapshots from a replaced workbook", () => {
    const controller = mountController();
    const original = controller.captureCellFormatSelection()!;
    controller.activeSheet.value.properties.protected = true;
    expect(controller.captureCellFormatSelection()).toBeUndefined();
    expect(controller.applyCellFormat({ style: { bold: true } }, original)).toBe(false);
    controller.activeSheet.value.properties.protected = false;
    controller.replaceWorkbook(createWorkbook({ idFactory: createSequentialIdFactory() }));
    expect(controller.applyCellFormat({ style: { bold: true } }, original)).toBe(false);
    expect(controller.session.history.undoStack).toHaveLength(0);
  });
});
