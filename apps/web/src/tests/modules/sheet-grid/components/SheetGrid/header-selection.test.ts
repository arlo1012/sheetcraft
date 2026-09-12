import { describe, expect, test } from "vitest";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import { getFloatingMenu, mountSheetGrid, triggerAxisHeader, triggerCell } from "./fixture";

function headerSelection(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]) {
  return wrapper.getComponent(SheetSurface).props("headers") as {
    selection: {
      startRow: number;
      endRow: number;
      startColumn: number;
      endColumn: number;
      mode: string;
    };
  };
}

describe("SheetGrid header selection paint state", () => {
  test("projects a cell selection into its intersecting row and column labels", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 2, column: 3 }, "mousedown", { button: 0 });
    expect(headerSelection(wrapper).selection).toMatchObject({
      startRow: 2,
      endRow: 2,
      startColumn: 3,
      endColumn: 3,
      mode: "cells",
    });
  });

  test("keeps all intersecting labels in the shared header paint state for a cell range", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 1, column: 2 }, "mousedown", { button: 0 });
    await triggerCell(wrapper, { row: 3, column: 4 }, "mousedown", { button: 0, shiftKey: true });
    expect(headerSelection(wrapper).selection).toMatchObject({
      startRow: 1,
      endRow: 3,
      startColumn: 2,
      endColumn: 4,
      mode: "cells",
    });
  });

  test("keeps header paint selection independent from reading highlights", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 4, column: 5 }, "mousedown", { button: 0 });
    await wrapper.setProps({ highlightEnabled: true });
    expect(headerSelection(wrapper).selection).toMatchObject({ startRow: 4, endColumn: 5 });
    await wrapper.setProps({ highlightEnabled: false });
    expect(headerSelection(wrapper).selection).toMatchObject({ startRow: 4, endColumn: 5 });
  });

  test("represents whole-axis selection mode separately from its perpendicular header range", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerAxisHeader(wrapper, "row", 2);
    expect(headerSelection(wrapper).selection).toMatchObject({
      startRow: 2,
      endRow: 2,
      mode: "rows",
    });
    await triggerAxisHeader(wrapper, "column", 3);
    expect(headerSelection(wrapper).selection).toMatchObject({
      startColumn: 3,
      endColumn: 3,
      mode: "columns",
    });
  });

  test("keeps native editor focus after a header selection and opens its axis menu with Shift+F10", async () => {
    const { wrapper } = mountSheetGrid({ attachTo: document.body });
    try {
      await triggerAxisHeader(wrapper, "row", 2);
      const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
      expect(document.activeElement).toBe(editor.element);
      await editor.trigger("keydown", { key: "F10", shiftKey: true });
      expect(getFloatingMenu().attributes("aria-label")).toBe("Row actions");
    } finally {
      wrapper.unmount();
    }
  });
});
