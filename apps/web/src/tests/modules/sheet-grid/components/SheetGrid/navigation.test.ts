import { describe, expect, test } from "vitest";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";

describe("SheetGrid navigation", () => {
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
