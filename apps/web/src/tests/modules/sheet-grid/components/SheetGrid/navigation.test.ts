import { describe, expect, test } from "vitest";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";

describe("SheetGrid navigation", () => {
  test("requests a table body expansion from the final data cell on Tab", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.tables = [
          {
            id: "table-1",
            name: "Table1",
            range: { start: { row: 2, column: 1 }, end: { row: 4, column: 2 } },
            columns: [
              { id: "name", name: "Name" },
              { id: "amount", name: "Amount" },
            ],
            style: { id: "table-medium-1", name: "Medium 1", category: "medium", elements: {} },
            headerRow: true,
            totalRow: false,
            firstColumn: false,
            lastColumn: false,
            bandedRows: true,
            bandedColumns: false,
            filterButton: true,
            filter: null,
          },
        ];
      },
    });
    await triggerCell(wrapper, { row: 4, column: 2 }, "mousedown", { button: 0 });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Tab" });

    expect(wrapper.emitted("tableExpandRequest")?.[0]?.[0]).toEqual({
      tableId: "table-1",
      range: { start: { row: 2, column: 1 }, end: { row: 5, column: 2 } },
      next: { row: 5, column: 1 },
    });
  });

  test("selects cells and navigates without changing workbook history", async () => {
    const { session, wrapper } = mountSheetGrid();

    expect(activeCell(wrapper)).toBe("A1");
    await triggerCell(wrapper, { row: 2, column: 2 }, "mousedown", { button: 0 });
    expect(activeCell(wrapper)).toBe("C3");

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "ArrowLeft" });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "ArrowUp" });
    expect(activeCell(wrapper)).toBe("B2");

    await triggerCell(wrapper, { row: 0, column: 0 }, "mousedown", { button: 0 });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "ArrowLeft" });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "ArrowUp" });
    expect(activeCell(wrapper)).toBe("A1");
    expect(session.history.undoStack).toHaveLength(0);
  });
});
