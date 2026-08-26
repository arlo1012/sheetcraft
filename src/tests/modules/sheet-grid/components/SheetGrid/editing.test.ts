import { describe, expect, test } from "vitest";
import { getCellValue, setCellValue } from "../../../../../modules/workbook/workbook";
import { activeCell, mountSheetGrid } from "./fixture";

describe("cell editor", () => {
  test("replaces content with printable input and commits with Enter", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("input.cell-editor");

    await editor.trigger("keydown", { key: "4" });
    await editor.setValue("42");
    expect(editor.classes()).toContain("is-editing");

    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe(42);
    expect(activeCell(wrapper)).toBe("A2");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("uses Enter to navigate and F2 to edit existing content", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 1, column: 0 }, "Original");
    await wrapper.get('[data-row="1"][data-column="0"]').trigger("mousedown", { button: 0 });

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "Enter" });
    expect(activeCell(wrapper)).toBe("A3");
    expect(wrapper.get("input.cell-editor").classes()).not.toContain("is-editing");
    await wrapper.get("input.cell-editor").trigger("keydown", { key: "Enter", shiftKey: true });
    expect(activeCell(wrapper)).toBe("A2");
    expect(session.history.undoStack).toHaveLength(0);

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "F2" });
    const editor = wrapper.get("input.cell-editor");
    expect(editor.classes()).toContain("is-editing");
    expect((editor.element as HTMLInputElement).value).toBe("Original");
    await editor.setValue("Changed");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 1, column: 0 })).toBe("Changed");
    expect(activeCell(wrapper)).toBe("A3");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("edits existing content with F2 and cancels with Escape", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 1, column: 1 }, "Original");

    await wrapper.get('[data-row="1"][data-column="1"]').trigger("mousedown", { button: 0 });
    const editor = wrapper.get("input.cell-editor");
    await editor.trigger("keydown", { key: "F2" });
    expect((editor.element as HTMLInputElement).value).toBe("Original");

    await editor.setValue("Changed");
    await editor.trigger("keydown", { key: "Escape" });
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("Original");
    expect(activeCell(wrapper)).toBe("B2");
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("preserves explicitly escaped text after reopening and committing it", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("input.cell-editor");

    await editor.trigger("keydown", { key: "'" });
    await editor.setValue("'0012");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("0012");

    await wrapper.get('[data-row="0"][data-column="0"]').trigger("mousedown", { button: 0 });
    await wrapper.get("input.cell-editor").trigger("keydown", { key: "F2" });
    expect((wrapper.get("input.cell-editor").element as HTMLInputElement).value).toBe("'0012");
    await wrapper.get("input.cell-editor").trigger("keydown", { key: "Enter" });

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("0012");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("commits once when selecting another cell and supports Tab traversal", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("input.cell-editor");

    await editor.trigger("keydown", { key: "a" });
    await wrapper.get('[data-row="2"][data-column="3"]').trigger("mousedown", { button: 0 });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("a");
    expect(activeCell(wrapper)).toBe("D3");
    expect(session.history.undoStack).toHaveLength(1);

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "b" });
    await wrapper.get("input.cell-editor").trigger("keydown", { key: "Tab" });
    expect(getCellValue(sheet, { row: 2, column: 3 })).toBe("b");
    expect(activeCell(wrapper)).toBe("E3");

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "c" });
    await wrapper.get("input.cell-editor").trigger("keydown", { key: "Tab", shiftKey: true });
    expect(activeCell(wrapper)).toBe("D3");
  });

  test("keeps editing when the editor itself receives a pointer event", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("input.cell-editor");

    await editor.trigger("keydown", { key: "a" });
    await editor.trigger("mousedown", { button: 0 });
    await editor.setValue("ab");

    expect(editor.classes()).toContain("is-editing");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("keeps an in-progress editor mounted when its cell scrolls outside the viewport", async () => {
    const { session, wrapper } = mountSheetGrid();
    const editor = wrapper.get("input.cell-editor");
    const scroller = wrapper.get(".sheet-grid__scroller");

    await editor.trigger("keydown", { key: "d" });
    await editor.setValue("Draft");
    (scroller.element as HTMLDivElement).scrollTop = 1_200;
    await scroller.trigger("scroll");

    expect((wrapper.get("input.cell-editor").element as HTMLInputElement).value).toBe("Draft");
    expect(wrapper.get("input.cell-editor").classes()).toContain("is-editing");
    expect(session.history.undoStack).toHaveLength(0);
  });
});
