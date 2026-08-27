import { describe, expect, test } from "vitest";
import { setCellValue } from "../../../../../modules/workbook/workbook";
import { mountSheetGrid } from "./fixture";

describe("SheetGrid accessibility", () => {
  test("exposes virtualized rows and keeps the editor inside the active gridcell", () => {
    const { wrapper } = mountSheetGrid();
    const activeGridCell = wrapper.get('[role="gridcell"][aria-selected="true"]');

    expect(activeGridCell.get('input[aria-label="Cell A1, blank"]')).toBeDefined();
    expect(activeGridCell.element.parentElement?.getAttribute("role")).toBe("row");
    expect(activeGridCell.element.parentElement?.getAttribute("aria-rowindex")).toBe("1");
  });

  test("announces the display value when a populated cell becomes active", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 1 }, "Budget");

    await wrapper.get('[data-row="0"][data-column="1"]').trigger("mousedown", { button: 0 });

    expect(wrapper.get("input.cell-editor").attributes("aria-label")).toBe("Cell B1, Budget");
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
    expect(wrapper.findAll("input.cell-editor")).toHaveLength(1);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true);
  });
});
