import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { getCellContent, type SheetDataValidation } from "@idea10/core/workbook";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { createAppI18n } from "../../../shared/i18n";

type Controller = ReturnType<typeof useSpreadsheetWorkspaceController>;
let wrapper: ReturnType<typeof mount> | undefined;
const address = { row: 0, column: 0 };

function setup(rule: Partial<SheetDataValidation> = {}): Controller {
  let controller!: Controller;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  controller.activeSheet.value.dataValidations = [
    {
      id: "validation-1",
      range: { start: address, end: address },
      type: "whole",
      operator: "between",
      formula1: "1",
      formula2: "10",
      allowBlank: false,
      errorStyle: "stop",
      ...rule,
    },
  ];
  return controller;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe("workspace data validation", () => {
  test("rejects invalid direct input without recording history, then accepts a correction", () => {
    const controller = setup();
    expect(controller.commitCell({ address, input: "12" })).toBe(false);
    expect(controller.validationFeedback.value?.style).toBe("stop");
    expect(getCellContent(controller.activeSheet.value, address)).toBeNull();
    expect(controller.session.history.undoStack).toHaveLength(0);
    expect(controller.acceptValidationInput()).toBe(false);
    controller.dismissValidationInput();
    expect(controller.commitCell({ address, input: "8" })).toBe(true);
    expect(getCellContent(controller.activeSheet.value, address)).toEqual({
      kind: "literal",
      value: 8,
    });
    expect(controller.undo()).toBe(true);
    expect(getCellContent(controller.activeSheet.value, address)).toBeNull();
    expect(controller.redo()).toBe(true);
  });

  test("allows explicit acceptance of warning input as one undoable edit", () => {
    const controller = setup({ errorStyle: "warning", error: "Choose a number from 1 to 10" });
    expect(controller.commitCell({ address, input: "12" })).toBe(false);
    expect(controller.validationFeedback.value?.message).toBe("Choose a number from 1 to 10");
    expect(controller.acceptValidationInput()).toBe(true);
    expect(controller.validationFeedback.value).toBeUndefined();
    expect(getCellContent(controller.activeSheet.value, address)).toEqual({
      kind: "literal",
      value: 12,
    });
    expect(controller.session.history.undoStack).toHaveLength(1);
  });

  test("rejects a warning acceptance when its rule changed while the dialog was open", () => {
    const controller = setup({ errorStyle: "warning" });
    controller.commitCell({ address, input: "12" });
    controller.activeSheet.value.dataValidations![0]!.errorStyle = "stop";
    expect(controller.acceptValidationInput()).toBe(false);
    expect(getCellContent(controller.activeSheet.value, address)).toBeNull();
  });

  test("validates formula results and preserves literal list choices", () => {
    const controller = setup();
    expect(controller.commitCell({ address, input: "=20+1" })).toBe(false);
    expect(controller.commitCell({ address, input: "=2+1" })).toBe(true);
    controller.activeSheet.value.dataValidations = [
      {
        id: "list",
        range: { start: address, end: address },
        type: "list",
        list: ["=SUM(A1)", "001"],
        allowBlank: true,
      },
    ];
    expect(controller.commitCellValue({ address, value: "=SUM(A1)" })).toBe(true);
    expect(getCellContent(controller.activeSheet.value, address)).toEqual({
      kind: "literal",
      value: "=SUM(A1)",
    });
  });

  test("keeps validation dropdown metadata while error alerts are disabled", () => {
    const controller = setup({
      showError: false,
      prompt: "Enter a whole number",
      promptTitle: "Quantity",
    });
    expect(controller.commitCell({ address, input: "12" })).toBe(true);
    expect(controller.validationFeedback.value).toBeUndefined();
    expect(controller.activeValidationInfo.value?.prompt).toEqual({
      title: "Quantity",
      message: "Enter a whole number",
    });
  });
});
