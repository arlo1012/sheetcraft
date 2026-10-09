import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { getCellContent, MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "@sheetcraft/core/workbook";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { createAppI18n } from "../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;

function mountController() {
  let controller: ReturnType<typeof useSpreadsheetWorkspaceController> | undefined;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  if (!controller) throw new Error("Missing controller");
  return controller;
}

afterEach(() => wrapper?.unmount());

describe("formula edit ownership and traversal", () => {
  test("commits to the captured sheet after selection moves to another sheet", () => {
    const controller = mountController();
    const owner = controller.activeSheet.value;
    controller.addSheet();
    const current = controller.activeSheet.value;
    expect(current.id).not.toBe(owner.id);

    controller.commitCell({
      sheetId: owner.id,
      address: { row: 0, column: 0 },
      input: "=SUM(1,2)",
    });

    expect(getCellContent(owner, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(1,2)" },
    });
    expect(getCellContent(current, { row: 0, column: 0 })).toBeNull();
    expect(controller.undo()).toBe(true);
    expect(getCellContent(owner, { row: 0, column: 0 })).toBeNull();
  });

  test("does not redirect a removed edit target into the active sheet", () => {
    const controller = mountController();
    controller.commitCell({
      sheetId: "removed-sheet",
      address: { row: 0, column: 0 },
      input: "=1",
    });
    expect(getCellContent(controller.activeSheet.value, { row: 0, column: 0 })).toBeNull();
    expect(controller.session.history.undoStack).toHaveLength(0);
  });

  test("supports horizontal and vertical traversal with sheet limits and owner checks", () => {
    const controller = mountController();
    const navigateToCell = vi.fn();
    controller.setGridNavigator({ focusGrid: vi.fn(), navigateToCell } as never);
    const address = { row: 2, column: 3 };
    for (const [direction, expected] of [
      ["left", { row: 2, column: 2 }],
      ["right", { row: 2, column: 4 }],
      ["up", { row: 1, column: 3 }],
      ["down", { row: 3, column: 3 }],
    ] as const) {
      controller.traverseFromFormulaBar({ address, direction });
      expect(navigateToCell).toHaveBeenLastCalledWith(expected);
    }
    controller.traverseFromFormulaBar({ address: { row: 0, column: 0 }, direction: "left" });
    expect(navigateToCell).toHaveBeenLastCalledWith({ row: 0, column: 0 });
    controller.traverseFromFormulaBar({
      address: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
      direction: "right",
    });
    expect(navigateToCell).toHaveBeenLastCalledWith({
      row: MAX_SHEET_ROWS - 1,
      column: MAX_SHEET_COLUMNS - 1,
    });
    navigateToCell.mockClear();
    controller.traverseFromFormulaBar({ sheetId: "previous-sheet", address, direction: "down" });
    expect(navigateToCell).not.toHaveBeenCalled();
  });
});
