import { defineComponent, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@idea10/core/history";
import {
  createSheetEvaluator,
  getActiveSheet,
  type SheetOutlineGroup,
} from "@idea10/core/workbook";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import type { SelectionMode } from "@idea10/sheet-engine/selection";
import { createAppI18n } from "../../../../shared/i18n";
import { useDataToolsController } from "../../../../modules/data-tools/useDataToolsController";

function fixture(groups: SheetOutlineGroup[]) {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  sheet.outlineGroups = groups;
  const selection = reactive({
    address: { row: 0, column: 0 },
    range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
    mode: "cells" as SelectionMode,
  });
  let controller!: ReturnType<typeof useDataToolsController>;
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useDataToolsController({
          getWorkbook: () => session.workbook,
          getSelection: () => selection,
          getSheetEvaluator: () => createSheetEvaluator(getActiveSheet(session.workbook)),
          getGeneration: () => 0,
          isBusy: () => false,
          execute: (command) => executeWorkbookCommand(session, command),
          flush: () => true,
          focusSheet: () => undefined,
          recalculate: () => undefined,
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  const select = (row: number, end = row, column = 15, mode: SelectionMode = "cells") => {
    selection.address = { row, column };
    selection.range = { start: { row, column }, end: { row: end, column } };
    selection.mode = mode;
  };
  return {
    session,
    sheet,
    controller,
    select,
    wrapper,
    states: () =>
      Object.fromEntries(sheet.outlineGroups!.map((group) => [group.id, group.collapsed])),
  };
}
const row = (id: string, start: number, end: number, collapsed = false): SheetOutlineGroup => ({
  id,
  axis: "row",
  start,
  end,
  collapsed,
});

describe("outline ribbon actions", () => {
  test("handles repeated groups with the same bounds without losing all targets", () => {
    const f = fixture([row("first", 1, 3), row("second", 1, 3)]);
    f.select(4);
    f.controller.setGroupsCollapsed(true);
    expect(f.states()).toEqual({ first: true, second: true });
    f.controller.setGroupsCollapsed(false);
    expect(f.states()).toEqual({ first: false, second: false });
    f.wrapper.unmount();
  });

  test("uses a summary row outside the detail range and expands every nested detail", () => {
    const f = fixture([row("parent", 1, 8, true), row("child", 2, 4, true)]);
    f.select(9);
    expect(f.controller.capabilities.value).toMatchObject({ expand: true, collapse: false });
    f.controller.setGroupsCollapsed(false);
    expect(f.states()).toEqual({ parent: false, child: false });
    undoWorkbookCommand(f.session);
    expect(f.states()).toEqual({ parent: true, child: true });
    f.wrapper.unmount();
  });

  test("finds subtotals above details and preserves summary metadata when clearing", () => {
    const f = fixture([row("subtotal-group-0", 3, 5)]);
    const metadata = {
      id: "subtotal",
      range: { start: { row: 1, column: 0 }, end: { row: 5, column: 1 } },
      generatedRows: [2],
      summaryBelow: false,
    };
    f.sheet.subtotalMetadata = [metadata];
    f.select(2);
    f.controller.setGroupsCollapsed(true);
    expect(f.states()).toEqual({ "subtotal-group-0": true });
    f.controller.clearOutline();
    expect(f.sheet.subtotalMetadata).toEqual([metadata]);
    f.wrapper.unmount();
  });

  test("collapses the selected inner summary without collapsing the enclosing group", () => {
    const f = fixture([row("parent", 1, 8), row("child", 2, 4)]);
    f.select(5);
    f.controller.setGroupsCollapsed(true);
    expect(f.states()).toEqual({ parent: false, child: true });
    f.wrapper.unmount();
  });

  test("uses the nearest group from a detail cell and opens a collapsed ancestor", () => {
    const f = fixture([row("parent", 1, 8, true), row("child", 2, 4, true)]);
    f.select(3);
    f.controller.setGroupsCollapsed(false);
    expect(f.states()).toEqual({ parent: false, child: false });
    f.controller.setGroupsCollapsed(true);
    expect(f.states()).toEqual({ parent: false, child: true });
    f.wrapper.unmount();
  });

  test("applies a multi-group selection atomically rather than just the active cell", () => {
    const f = fixture([row("first", 1, 3), row("second", 5, 7), row("other", 12, 14)]);
    f.select(1, 8);
    f.controller.setGroupsCollapsed(true);
    expect(f.states()).toEqual({ first: true, second: true, other: false });
    undoWorkbookCommand(f.session);
    expect(f.states()).toEqual({ first: false, second: false, other: false });
    f.wrapper.unmount();
  });

  test("respects whole-axis selection and ignores unrelated cells", () => {
    const f = fixture([
      row("rows", 1, 3),
      { id: "cols", axis: "column", start: 1, end: 3, collapsed: false },
    ]);
    f.select(2, 2, 2, "rows");
    f.controller.setGroupsCollapsed(true);
    expect(f.states()).toEqual({ rows: true, cols: false });
    f.select(2, 2, 4, "columns");
    f.controller.setGroupsCollapsed(true);
    expect(f.states()).toEqual({ rows: true, cols: true });
    f.select(20, 20, 20);
    expect(f.controller.capabilities.value).toMatchObject({
      expand: false,
      collapse: false,
      ungroupRows: false,
      ungroupColumns: false,
      clearOutline: true,
    });
    f.wrapper.unmount();
  });

  test("clears the whole sheet outline from outside any group and undo restores it", () => {
    const f = fixture([
      row("rows", 1, 3, true),
      { id: "cols", axis: "column", start: 1, end: 3, collapsed: false },
    ]);
    f.sheet.hiddenRows = new Set([20]);
    f.select(30, 30, 30);
    f.controller.clearOutline();
    expect(f.sheet.outlineGroups).toEqual([]);
    expect([...f.sheet.hiddenRows!]).toEqual([1, 2, 3, 20]);
    undoWorkbookCommand(f.session);
    expect(f.states()).toEqual({ rows: true, cols: false });
    expect([...f.sheet.hiddenRows!]).toEqual([20]);
    f.wrapper.unmount();
  });

  test("ungroups only the selected band instead of deleting the whole containing group", () => {
    const f = fixture([row("rows", 1, 6)]);
    f.select(3, 4);
    f.controller.ungroup("rows");
    expect(f.sheet.outlineGroups?.map(({ start, end }) => [start, end])).toEqual([
      [1, 2],
      [5, 6],
    ]);
    undoWorkbookCommand(f.session);
    expect(f.sheet.outlineGroups).toEqual([row("rows", 1, 6)]);
    f.wrapper.unmount();
  });
});
