import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createSheetFilterHiddenRowIntervals,
  createSetSheetFilterCriteriaCommand,
} from "@idea10/core/commands";
import { executeWorkbookCommand } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  getCellContent,
  setCellContent,
  setSheetMetadata,
  type CellAddress,
  type CellRange,
} from "@idea10/core/workbook";
import type { CellSelection } from "@idea10/sheet-engine/selection";
import { createSheetGridViewState } from "@idea10/sheet-engine/view-state";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { createAppI18n } from "../../../shared/i18n";

type Controller = ReturnType<typeof useSpreadsheetWorkspaceController>;

let wrapper: ReturnType<typeof mount> | undefined;

function mountController(locale: "en-US" | "zh-CN" = "en-US"): Controller {
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
    { global: { plugins: [createAppI18n(locale)] } },
  );
  if (!controller) throw new Error("Workspace controller did not initialize.");
  return controller;
}

function select(controller: Controller, selection: CellSelection): void {
  controller.updateActiveSheetViewState(createSheetGridViewState({ selection }));
}

function cellRangeSelection(range: CellRange, active: CellAddress = range.start): CellSelection {
  return {
    active: { ...active },
    anchor: { ...range.start },
    focus: { ...range.end },
    mode: "cells",
  };
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe("spreadsheet workspace data tools", () => {
  test("projects typed filter values and applies a reversible filter", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Status" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "Open" });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: "Closed" });
    select(
      controller,
      cellRangeSelection({ start: { row: 0, column: 0 }, end: { row: 3, column: 0 } }),
    );

    expect(controller.dataToolState.value).toMatchObject({
      filterEnabled: true,
      filter: {
        active: false,
        options: [
          { key: { kind: "blank" }, label: "blank" },
          { key: { kind: "string", value: "Closed" }, label: "Closed" },
          { key: { kind: "string", value: "Open" }, label: "Open" },
        ],
      },
    });

    controller.applyFilter([{ kind: "string", value: "Open" }]);

    expect(sheet.filter).toEqual({
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
      columns: [{ column: 0, allowedValues: [{ kind: "string", value: "Open" }] }],
    });
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 2, end: 3 }]);
    expect(controller.dataToolState.value.filter).toMatchObject({
      active: true,
      appliedKeys: [{ kind: "string", value: "Open" }],
    });
    expect(controller.session.history.undoStack.at(-1)?.operation).toBe("data.filter");
    expect(controller.undo()).toBe(true);
    expect(sheet.filter).toBeNull();
    expect(controller.redo()).toBe(true);
    expect(sheet.filter?.columns).toEqual([
      { column: 0, allowedValues: [{ kind: "string", value: "Open" }] },
    ]);

    controller.sortSelection("ascending");
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "Status",
    });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({
      kind: "literal",
      value: "Closed",
    });

    controller.applyFilter([]);
    expect(sheet.filter?.columns).toEqual([{ column: 0, allowedValues: [] }]);
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 1, end: 3 }]);

    controller.clearFilter();
    expect(sheet.filter).toBeNull();
  });

  test("sorts the selected rectangle and clears a stale clipboard outline", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    select(
      controller,
      cellRangeSelection({ start: { row: 0, column: 0 }, end: { row: 1, column: 0 } }),
    );
    const clearClipboard = vi.fn();
    controller.setGridNavigator({
      clearClipboard,
      focusGrid() {},
      navigateToCell() {},
    } as never);

    expect(controller.dataToolState.value.sortEnabled).toBe(true);
    controller.sortSelection("ascending");

    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: 1 });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({ kind: "literal", value: 2 });
    expect(clearClipboard).toHaveBeenCalledOnce();
    expect(controller.session.history.undoStack.at(-1)?.operation).toBe("data.sort");
    expect(controller.undo()).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: 2 });
    expect(controller.redo()).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: 1 });
  });

  test("matches filter state and sort availability to the active target range", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    executeWorkbookCommand(
      controller.session,
      createSetSheetFilterCriteriaCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
        [{ column: 0, allowedValues: [{ kind: "string", value: "Open" }] }],
      ),
    );

    select(
      controller,
      cellRangeSelection(
        { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
        { row: 4, column: 0 },
      ),
    );
    expect(controller.dataToolState.value).toMatchObject({
      sortEnabled: false,
      filter: { active: false },
    });

    select(
      controller,
      cellRangeSelection(
        { start: { row: 1, column: 0 }, end: { row: 3, column: 1 } },
        { row: 1, column: 0 },
      ),
    );
    expect(controller.dataToolState.value).toMatchObject({
      sortEnabled: true,
      filter: {
        active: true,
        appliedKeys: [{ kind: "string", value: "Open" }],
      },
    });
  });

  test("maps every freeze mode and reports a merge-boundary rejection", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    select(
      controller,
      cellRangeSelection(
        { start: { row: 2, column: 3 }, end: { row: 2, column: 3 } },
        { row: 2, column: 3 },
      ),
    );

    controller.freeze("panes");
    expect(sheet.freezePanes).toEqual({ rows: 2, columns: 3 });
    controller.unfreeze();
    expect(sheet.freezePanes).toEqual({ rows: 0, columns: 0 });
    controller.freeze("top-row");
    expect(sheet.freezePanes).toEqual({ rows: 1, columns: 0 });
    controller.freeze("first-column");
    expect(sheet.freezePanes).toEqual({ rows: 0, columns: 1 });

    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: null,
      mergedCells: [{ start: { row: 0, column: 0 }, end: { row: 1, column: 0 } }],
    });
    controller.freeze("top-row");
    expect(sheet.freezePanes).toEqual({ rows: 0, columns: 0 });
    expect(controller.workspaceStatusText.value).toBe("Frozen panes cannot cross a merged cell.");
  });

  test("merges and unmerges the selection through history-aware commands", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const range = { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } };
    setCellContent(sheet, range.start, { kind: "literal", value: "anchor" });
    setCellContent(sheet, range.end, { kind: "literal", value: "tail" });
    select(controller, cellRangeSelection(range, range.end));
    const clearClipboard = vi.fn();
    controller.setGridNavigator({
      clearClipboard,
      focusGrid() {},
      navigateToCell() {},
    } as never);

    expect(controller.mergeState.value).toEqual({ canMerge: true, canUnmerge: false });
    controller.mergeSelection();
    expect(sheet.mergedCells).toEqual([range]);
    expect(getCellContent(sheet, range.start)).toEqual({ kind: "literal", value: "anchor" });
    expect(getCellContent(sheet, range.end)).toBeNull();
    expect(controller.mergeState.value).toEqual({ canMerge: false, canUnmerge: true });

    controller.unmergeSelection();
    expect(sheet.mergedCells).toEqual([]);
    expect(clearClipboard).toHaveBeenCalledTimes(2);
    expect(controller.undo()).toBe(true);
    expect(sheet.mergedCells).toEqual([range]);
  });

  test("disables data and merge actions for incompatible selections", () => {
    const controller = mountController("zh-CN");
    const sheet = controller.activeSheet.value;
    executeWorkbookCommand(
      controller.session,
      createSetSheetFilterCriteriaCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        [],
      ),
    );
    select(
      controller,
      cellRangeSelection({ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }),
    );

    expect(controller.mergeState.value.canMerge).toBe(false);
    controller.mergeSelection();
    expect(controller.workspaceStatusText.value).toBe("当前选区无法合并或取消合并。");

    select(controller, {
      active: { row: 0, column: 0 },
      anchor: { row: 0, column: 0 },
      focus: { row: 2, column: 0 },
      mode: "rows",
    });
    expect(controller.dataToolState.value).toMatchObject({
      filterEnabled: false,
      sortEnabled: false,
    });
  });
});
