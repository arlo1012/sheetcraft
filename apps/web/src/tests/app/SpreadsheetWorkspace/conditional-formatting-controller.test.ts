import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createSheet, createWorkbook, insertSheet, MAX_SHEET_ROWS } from "@idea10/core/workbook";
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
afterEach(() => wrapper?.unmount());

describe("conditional formatting workspace commands", () => {
  test("saves only changed manager sheets while keeping each sheet's rules separate", () => {
    const controller = mountController();
    const first = controller.activeSheet.value;
    const second = createSheet("Details", "details");
    insertSheet(controller.session.workbook, second);
    const generation = controller.workbookGeneration.value;
    const firstRule = {
      id: "first-rule",
      ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
      anchor: { row: 0, column: 0 },
      condition: { kind: "cellValue" as const, operator: "greaterThan" as const, value: 1 },
      style: { fillColor: "#FDE2E1" },
    };
    const secondRule = {
      ...firstRule,
      id: "second-rule",
      condition: { ...firstRule.condition, value: 2 },
    };
    second.conditionalFormats = [secondRule];

    expect(
      controller.setConditionalFormatsForSheets(
        [{ sheetId: first.id, rules: [firstRule] }],
        generation,
      ),
    ).toBe(true);
    expect(first.conditionalFormats).toEqual([firstRule]);
    expect(second.conditionalFormats).toEqual([secondRule]);
    expect(controller.session.history.undoStack).toHaveLength(1);
  });

  test("rejects all manager changes when a target is protected or the draft is stale", () => {
    const controller = mountController();
    const first = controller.activeSheet.value;
    const second = createSheet("Details", "details");
    insertSheet(controller.session.workbook, second);
    const generation = controller.workbookGeneration.value;
    const rule = {
      id: "rule",
      ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
      anchor: { row: 0, column: 0 },
      condition: { kind: "cellValue" as const, operator: "greaterThan" as const, value: 1 },
      style: { fillColor: "#FDE2E1" },
    };
    second.properties.protected = true;

    expect(
      controller.setConditionalFormatsForSheets(
        [
          { sheetId: first.id, rules: [rule] },
          { sheetId: second.id, rules: [rule] },
        ],
        generation,
      ),
    ).toBe(false);
    expect(first.conditionalFormats).toEqual([]);
    expect(second.conditionalFormats).toEqual([]);
    expect(controller.session.history.undoStack).toHaveLength(0);

    second.properties.protected = false;
    controller.replaceWorkbook(createWorkbook({ idFactory: createSequentialIdFactory() }));
    expect(
      controller.setConditionalFormatsForSheets([{ sheetId: first.id, rules: [rule] }], generation),
    ).toBe(false);
    expect(controller.session.history.undoStack).toHaveLength(0);
  });

  test("allows sparse whole-column rules and restores partial clearing with undo", () => {
    const controller = mountController();
    const start = { row: 0, column: 0 };
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          active: start,
          anchor: start,
          focus: { row: MAX_SHEET_ROWS - 1, column: 0 },
          mode: "columns",
        },
      }),
    );
    expect(controller.captureCellFormatSelection()).toBeUndefined();
    const target = controller.captureConditionalFormattingSelection()!;
    expect(target.range.end.row).toBe(MAX_SHEET_ROWS - 1);
    const rules = [
      {
        id: "threshold",
        ranges: [target.range],
        anchor: start,
        condition: { kind: "cellValue" as const, operator: "greaterThan" as const, value: 10 },
        style: { fillColor: "#FDE2E1" },
      },
    ];
    expect(controller.setConditionalFormats(rules, target)).toBe(true);
    expect(controller.session.history.undoStack).toHaveLength(1);
    expect(controller.setConditionalFormats(rules, target)).toBe(true);
    expect(controller.session.history.undoStack).toHaveLength(1);
    controller.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: { active: start, anchor: start, focus: start, mode: "cells" },
      }),
    );
    expect(controller.clearConditionalFormats("selection")).toBe(true);
    expect(controller.activeSheet.value.conditionalFormats?.[0]?.ranges[0]?.start.row).toBe(1);
    controller.undo();
    expect(controller.activeSheet.value.conditionalFormats?.[0]?.ranges[0]?.start.row).toBe(0);
    controller.undo();
    expect(controller.activeSheet.value.conditionalFormats).toEqual([]);
    controller.redo();
    expect(controller.activeSheet.value.conditionalFormats).toHaveLength(1);
  });

  test("rejects protected targets and drafts from a replaced workbook", () => {
    const controller = mountController();
    const target = controller.captureConditionalFormattingSelection()!;
    controller.activeSheet.value.properties.protected = true;
    expect(controller.captureConditionalFormattingSelection()).toBeUndefined();
    expect(controller.setConditionalFormats([], target)).toBe(false);
    expect(controller.clearConditionalFormats("sheet")).toBe(false);
    controller.activeSheet.value.properties.protected = false;
    controller.replaceWorkbook(createWorkbook({ idFactory: createSequentialIdFactory() }));
    expect(controller.setConditionalFormats([], target)).toBe(false);
    expect(controller.session.history.undoStack).toHaveLength(0);
  });
});
