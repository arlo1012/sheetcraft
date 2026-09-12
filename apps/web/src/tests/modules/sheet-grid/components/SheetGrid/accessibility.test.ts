import { describe, expect, test } from "vitest";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  getColumnWidth,
  getRowHeight,
  setCellValue,
} from "@idea10/core/workbook";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";

describe("SheetGrid accessibility", () => {
  test("exposes grid metadata and one labelled editor", () => {
    const { wrapper } = mountSheetGrid({ attachTo: document.body });
    try {
      const grid = wrapper.get('[role="grid"]');
      const editor = wrapper.get('textarea[aria-label="Cell A1, blank"]');

      expect(grid.attributes("aria-rowcount")).toBe("100");
      expect(grid.attributes("aria-colcount")).toBe("50");
      expect(wrapper.findAll("textarea.cell-editor")).toHaveLength(1);
      (editor.element as HTMLTextAreaElement).focus();
      expect(document.activeElement).toBe(editor.element);
    } finally {
      wrapper.unmount();
    }
  });

  test("announces the display value when a populated cell becomes active", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 1 }, "Budget");

    await triggerCell(wrapper, { row: 0, column: 1 }, "mousedown", { button: 0 });

    expect(wrapper.get("textarea.cell-editor").attributes("aria-label")).toBe("Cell B1, Budget");
  });

  test("marks visible range cells selected while keeping one active editor", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 1, column: 2 }, "mousedown", { button: 0, shiftKey: true });

    expect(wrapper.get('[role="grid"]').attributes("aria-multiselectable")).toBe("true");
    expect(activeCell(wrapper)).toBe("A1");
    expect(wrapper.findAll("[data-selection-range]")).not.toHaveLength(0);
    expect(wrapper.findAll("textarea.cell-editor")).toHaveLength(1);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false);
  });

  test("exposes keyboard-adjustable row and column resize separators", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const columnHandle = wrapper.get('[data-resize-column="0"]');
    const rowHandle = wrapper.get('[data-resize-row="0"]');

    expect(columnHandle.attributes()).toMatchObject({
      role: "separator",
      "aria-label": "Column A width",
      "aria-orientation": "vertical",
      "aria-valuemin": String(MIN_COLUMN_WIDTH),
      "aria-valuemax": String(MAX_COLUMN_WIDTH),
      "aria-valuenow": String(DEFAULT_COLUMN_WIDTH),
      tabindex: "0",
    });
    expect(rowHandle.attributes("aria-orientation")).toBe("horizontal");
    expect(rowHandle.attributes("aria-valuenow")).toBe(String(DEFAULT_ROW_HEIGHT));

    await columnHandle.trigger("keydown", { key: "ArrowRight" });
    await rowHandle.trigger("keydown", { key: "ArrowDown" });

    expect(getColumnWidth(sheet, 0)).toBe(DEFAULT_COLUMN_WIDTH + 8);
    expect(getRowHeight(sheet, 0)).toBe(DEFAULT_ROW_HEIGHT + 8);
    expect(session.history.undoStack).toHaveLength(2);
  });
});
