import { describe, expect, test } from "vitest";
import { activeCell, mountSheetGrid } from "./fixture";

describe("SheetGrid navigation", () => {
  test("selects cells and navigates without changing workbook history", async () => {
    const { session, wrapper } = mountSheetGrid();

    expect(activeCell(wrapper)).toBe("A1");
    await wrapper.get('[data-row="2"][data-column="2"]').trigger("mousedown", { button: 0 });
    expect(activeCell(wrapper)).toBe("C3");

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "ArrowLeft" });
    await wrapper.get("input.cell-editor").trigger("keydown", { key: "ArrowUp" });
    expect(activeCell(wrapper)).toBe("B2");

    await wrapper.get('[data-row="0"][data-column="0"]').trigger("mousedown", { button: 0 });
    await wrapper.get("input.cell-editor").trigger("keydown", { key: "ArrowLeft" });
    await wrapper.get("input.cell-editor").trigger("keydown", { key: "ArrowUp" });
    expect(activeCell(wrapper)).toBe("A1");
    expect(session.history.undoStack).toHaveLength(0);
  });
});
