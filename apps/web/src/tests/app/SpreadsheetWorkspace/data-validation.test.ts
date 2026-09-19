import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { getCellContent, setCellContent, type SheetDataValidation } from "@idea10/core/workbook";
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
  test("rejects duplicate direct input while retaining the pending editor request", () => {
    const controller = setup();
    const sheet = controller.activeSheet.value;
    sheet.dataValidations = [];
    sheet.duplicateRules = [
      {
        id: "reject-duplicates",
        kind: "reject",
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      },
    ];
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Taken" });

    expect(controller.commitCell({ address: { row: 1, column: 0 }, input: "Taken" })).toBe(false);
    expect(controller.validationFeedback.value).toMatchObject({
      style: "stop",
      source: "duplicate",
      target: { sheetId: sheet.id, address: { row: 1, column: 0 } },
    });
    expect(controller.acceptValidationInput()).toBe(false);
    expect(getCellContent(sheet, { row: 1, column: 0 })).toBeNull();
    expect(controller.commitCell({ address: { row: 1, column: 0 }, input: "Available" })).toBe(
      true,
    );
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({
      kind: "literal",
      value: "Available",
    });
    expect(controller.commitCell({ address: { row: 1, column: 0 }, input: "" })).toBe(true);
    expect(getCellContent(sheet, { row: 1, column: 0 })).toBeNull();
  });

  test("rejects a duplicate paste atomically", () => {
    const controller = setup();
    const sheet = controller.activeSheet.value;
    sheet.dataValidations = [];
    sheet.duplicateRules = [
      {
        id: "reject-duplicates",
        kind: "reject",
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      },
    ];
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Taken" });

    expect(
      controller.pasteCells({
        kind: "values",
        plan: {
          anchor: { row: 1, column: 0 },
          range: { start: { row: 1, column: 0 }, end: { row: 2, column: 0 } },
          values: [["Unique"], ["Taken"]],
        },
      }),
    ).toEqual({ ok: false, reason: "pasteRejected" });
    expect(controller.workspaceStatusText.value).toBe("Duplicate values are not allowed.");
    expect(getCellContent(sheet, { row: 1, column: 0 })).toBeNull();
    expect(getCellContent(sheet, { row: 2, column: 0 })).toBeNull();
  });

  test("allows undo when a rejection rule is added after the original edit", () => {
    const controller = setup();
    const sheet = controller.activeSheet.value;
    sheet.dataValidations = [];
    expect(controller.commitCell({ address, input: "Taken" })).toBe(true);
    sheet.duplicateRules = [
      {
        id: "reject-duplicates",
        kind: "reject",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      },
    ];
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "Taken" });

    expect(controller.undo()).toBe(true);
    expect(getCellContent(sheet, address)).toBeNull();
  });

  test("keeps a warning draft and switches to duplicate rejection when the candidate becomes stale", () => {
    const controller = setup({ errorStyle: "warning" });
    const sheet = controller.activeSheet.value;
    sheet.duplicateRules = [
      {
        id: "reject-duplicates",
        kind: "reject",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      },
    ];

    expect(controller.commitCell({ address, input: "12" })).toBe(false);
    expect(controller.validationFeedback.value?.style).toBe("warning");
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 12 });

    expect(controller.acceptValidationInput()).toBe(false);
    expect(controller.validationFeedback.value).toMatchObject({
      style: "stop",
      message: "Duplicate values are not allowed.",
    });
    expect(getCellContent(sheet, address)).toBeNull();
  });

  test("rejects formula input whose evaluated value duplicates the configured range", () => {
    const controller = setup();
    const sheet = controller.activeSheet.value;
    sheet.dataValidations = [];
    sheet.duplicateRules = [
      {
        id: "reject-duplicates",
        kind: "reject",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      },
    ];
    setCellContent(sheet, address, { kind: "literal", value: 7 });

    expect(controller.commitCell({ address: { row: 1, column: 0 }, input: "=A1" })).toBe(false);
    expect(getCellContent(sheet, { row: 1, column: 0 })).toBeNull();
  });

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
