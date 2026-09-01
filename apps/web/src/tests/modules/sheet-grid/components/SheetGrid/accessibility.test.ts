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
import { mountSheetGrid } from "./fixture";

describe("SheetGrid accessibility", () => {
  test("exposes virtualized rows and keeps the editor inside the active gridcell", () => {
    const { wrapper } = mountSheetGrid();
    const activeGridCell = wrapper.get('[role="gridcell"][aria-selected="true"]');

    expect(activeGridCell.get('textarea[aria-label="Cell A1, blank"]')).toBeDefined();
    expect(activeGridCell.element.parentElement?.getAttribute("role")).toBe("row");
    expect(activeGridCell.element.parentElement?.getAttribute("aria-rowindex")).toBe("1");
  });

  test("announces the display value when a populated cell becomes active", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 1 }, "Budget");

    await wrapper.get('[data-row="0"][data-column="1"]').trigger("mousedown", { button: 0 });

    expect(wrapper.get("textarea.cell-editor").attributes("aria-label")).toBe("Cell B1, Budget");
  });

  test("marks visible range cells selected while keeping one active editor", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper
      .get('[data-row="1"][data-column="2"]')
      .trigger("mousedown", { button: 0, shiftKey: true });

    expect(wrapper.get('[role="grid"]').attributes("aria-multiselectable")).toBe("true");
    expect(wrapper.get('[data-row="0"][data-column="2"]').attributes("aria-selected")).toBe("true");
    expect(wrapper.get('[data-row="2"][data-column="2"]').attributes("aria-selected")).toBe(
      "false",
    );
    expect(wrapper.findAll("textarea.cell-editor")).toHaveLength(1);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true);
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
