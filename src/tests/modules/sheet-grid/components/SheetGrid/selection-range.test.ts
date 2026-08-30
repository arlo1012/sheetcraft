import { describe, expect, test } from "vitest";
import { activeCell, mountSheetGrid } from "./fixture";

function selectionStyle(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]): string {
  return wrapper.get("[data-selection-range]").attributes("style") ?? "";
}

describe("SheetGrid range selection", () => {
  test("extends a range with Shift click while retaining the active cell", async () => {
    const { session, wrapper } = mountSheetGrid();

    await wrapper
      .get('[data-row="2"][data-column="2"]')
      .trigger("mousedown", { button: 0, shiftKey: true });

    expect(activeCell(wrapper)).toBe("A1");
    expect(selectionStyle(wrapper)).toContain("width: 288px");
    expect(selectionStyle(wrapper)).toContain("height: 72px");
    expect(wrapper.get('[data-row="1"][data-column="1"]').attributes("aria-selected")).toBe("true");
    expect(wrapper.get('[data-row="3"][data-column="3"]').attributes("aria-selected")).toBe(
      "false",
    );
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("extends with Shift arrows and ordinary arrows reset to one moved cell", async () => {
    const { session, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("keydown", { key: "ArrowRight", shiftKey: true });
    await editor.trigger("keydown", { key: "ArrowDown", shiftKey: true });

    expect(activeCell(wrapper)).toBe("A1");
    expect(selectionStyle(wrapper)).toContain("width: 192px");
    expect(selectionStyle(wrapper)).toContain("height: 48px");
    expect(wrapper.get('[data-row="1"][data-column="1"]').attributes("aria-selected")).toBe("true");

    await editor.trigger("keydown", { key: "ArrowRight" });
    expect(activeCell(wrapper)).toBe("B1");
    expect(selectionStyle(wrapper)).toContain("width: 96px");
    expect(selectionStyle(wrapper)).toContain("height: 24px");
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("cycles Tab and Enter inside a retained range", async () => {
    const { wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");
    await wrapper
      .get('[data-row="1"][data-column="1"]')
      .trigger("mousedown", { button: 0, shiftKey: true });

    await editor.trigger("keydown", { key: "Tab" });
    expect(activeCell(wrapper)).toBe("B1");
    expect(selectionStyle(wrapper)).toContain("width: 192px");
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Enter" });
    expect(activeCell(wrapper)).toBe("B2");
    expect(selectionStyle(wrapper)).toContain("height: 48px");
  });
});
