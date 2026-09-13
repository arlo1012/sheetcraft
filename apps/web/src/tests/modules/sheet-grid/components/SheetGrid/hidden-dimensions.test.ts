import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import {
  createSetSheetDefaultColumnWidthCommand,
  createSetSheetDimensionHiddenCommand,
} from "@idea10/core/commands";
import { executeWorkbookCommand, undoWorkbookCommand } from "@idea10/core/history";
import { activeCell, getCanvasLayout, mountSheetGrid } from "./fixture";

describe("hidden axis rendering and navigation", () => {
  test("hides headers, skips hidden columns and rows with arrows, and restores sizes on undo", async () => {
    const { wrapper, session, sheet } = mountSheetGrid();
    executeWorkbookCommand(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "column", [1], true),
    );
    executeWorkbookCommand(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "row", [1], true),
    );
    await nextTick();
    const layout = getCanvasLayout(wrapper);
    expect(layout.panes.body.columns.map((column) => column.index)).not.toContain(1);
    expect(layout.panes.body.rows.map((row) => row.index)).not.toContain(1);
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "ArrowRight" });
    expect(activeCell(wrapper)).toBe("C1");
    await editor.trigger("keydown", { key: "ArrowDown" });
    expect(activeCell(wrapper)).toBe("C3");
    undoWorkbookCommand(session);
    await nextTick();
    expect(getCanvasLayout(wrapper).panes.body.rows.map((row) => row.index)).toContain(1);
    wrapper.unmount();
  });

  test("moves an active hidden first column to the next visible cell and applies the standard width", async () => {
    const { wrapper, session, sheet } = mountSheetGrid();
    executeWorkbookCommand(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "column", [0], true),
    );
    await nextTick();
    expect(activeCell(wrapper)).toBe("B1");
    executeWorkbookCommand(session, createSetSheetDefaultColumnWidthCommand(sheet.id, 75));
    await nextTick();
    expect(getCanvasLayout(wrapper).getCellViewportRect({ row: 0, column: 1 })?.width).toBe(75);
    wrapper.unmount();
  });
});
