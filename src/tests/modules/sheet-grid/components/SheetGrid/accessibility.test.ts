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
});
