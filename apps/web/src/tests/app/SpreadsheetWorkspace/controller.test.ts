import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
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
});
