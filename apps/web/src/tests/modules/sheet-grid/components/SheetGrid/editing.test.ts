import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { DEFAULT_ROW_HEIGHT, getCellValue, setCellValue } from "@idea10/core/workbook";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";
import { useCellEditSession } from "../../../../../shared/cell-editing/useCellEditSession";

describe("cell editor", () => {
  test("replaces content with printable input and commits with Enter", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

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
    await triggerCell(wrapper, { row: 1, column: 0 }, "mousedown", { button: 0 });

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Enter" });
    expect(activeCell(wrapper)).toBe("A3");
    expect(wrapper.get("textarea.cell-editor").classes()).not.toContain("is-editing");
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Enter", shiftKey: true });
    expect(activeCell(wrapper)).toBe("A2");
    expect(session.history.undoStack).toHaveLength(0);

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "F2" });
    const editor = wrapper.get("textarea.cell-editor");
    expect(editor.classes()).toContain("is-editing");
    expect((editor.element as HTMLTextAreaElement).value).toBe("Original");
    await editor.setValue("Changed");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 1, column: 0 })).toBe("Changed");
    expect(activeCell(wrapper)).toBe("A3");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("edits existing content with F2 and cancels with Escape", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 1, column: 1 }, "Original");

    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0 });
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "F2" });
    expect((editor.element as HTMLTextAreaElement).value).toBe("Original");

    await editor.setValue("Changed");
    await editor.trigger("keydown", { key: "Escape" });
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("Original");
    expect(activeCell(wrapper)).toBe("B2");
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("preserves explicitly escaped text after reopening and committing it", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("keydown", { key: "'" });
    await editor.setValue("'0012");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("0012");

    await triggerCell(wrapper, { row: 0, column: 0 }, "mousedown", { button: 0 });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "F2" });
    expect((wrapper.get("textarea.cell-editor").element as HTMLTextAreaElement).value).toBe(
      "'0012",
    );
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Enter" });

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("0012");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("commits once when selecting another cell and supports Tab traversal", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("keydown", { key: "a" });
    await triggerCell(wrapper, { row: 2, column: 3 }, "mousedown", { button: 0 });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("a");
    expect(activeCell(wrapper)).toBe("D3");
    expect(session.history.undoStack).toHaveLength(1);

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "b" });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Tab" });
    expect(getCellValue(sheet, { row: 2, column: 3 })).toBe("b");
    expect(activeCell(wrapper)).toBe("E3");

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "c" });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Tab", shiftKey: true });
    expect(activeCell(wrapper)).toBe("D3");
  });

  test("does not move after Tab when the shared edit session rejects validation", async () => {
    const editSession = useCellEditSession({ onCommit: () => false });
    const { wrapper } = mountSheetGrid({ editSession });
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("keydown", { key: "i" });
    await editor.setValue("invalid");
    await editor.trigger("keydown", { key: "Tab" });

    expect(activeCell(wrapper)).toBe("A1");
    expect((editor.element as HTMLTextAreaElement).value).toBe("invalid");
    expect(editor.classes()).toContain("is-editing");
    expect((wrapper.vm as unknown as { flushPendingEdit: () => boolean }).flushPendingEdit()).toBe(
      false,
    );
  });

  test("keeps editing when the editor itself receives a pointer event", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("keydown", { key: "a" });
    await editor.trigger("mousedown", { button: 0 });
    await editor.setValue("ab");

    expect(editor.classes()).toContain("is-editing");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("keeps an in-progress editor mounted when its cell scrolls outside the viewport", async () => {
    const { session, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");
    const scroller = wrapper.get(".sheet-grid__scroller");

    await editor.trigger("keydown", { key: "d" });
    await editor.setValue("Draft");
    (scroller.element as HTMLDivElement).scrollTop = 1_200;
    await scroller.trigger("scroll");

    expect((wrapper.get("textarea.cell-editor").element as HTMLTextAreaElement).value).toBe(
      "Draft",
    );
    expect(wrapper.get("textarea.cell-editor").classes()).toContain("is-editing");
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("inserts a line break with Alt+Enter and commits it with plain Enter", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");

    await editor.trigger("keydown", { key: "F2" });
    await editor.setValue("firstXXsecond");
    editor.element.setSelectionRange(5, 7);
    await editor.trigger("keydown", { key: "Enter", altKey: true });

    expect(editor.element.value).toBe("first\nsecond");
    expect(editor.element.selectionStart).toBe(6);
    expect(editor.classes()).toContain("is-editing");
    expect(activeCell(wrapper)).toBe("A1");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);

    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("first\nsecond");
    expect(activeCell(wrapper)).toBe("A2");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("expands the edit overlay right and down without changing row geometry", async () => {
    const { wrapper } = mountSheetGrid();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    const frame = wrapper.get<HTMLElement>("[data-cell-editor-frame]");
    const initialWidth = Number.parseFloat(frame.element.style.width);

    Object.defineProperties(editor.element, {
      scrollWidth: { configurable: true, get: () => 240 },
      scrollHeight: { configurable: true, get: () => 72 },
    });
    await editor.trigger("keydown", { key: "F2" });
    await editor.setValue("first line\nsecond line with more content");
    await nextTick();

    expect(Number.parseFloat(frame.element.style.width)).toBe(248);
    expect(Number.parseFloat(frame.element.style.width)).toBeGreaterThan(initialWidth);
    expect(Number.parseFloat(frame.element.style.height)).toBeGreaterThan(DEFAULT_ROW_HEIGHT);
    const anchor = wrapper.get<HTMLElement>("[data-cell-editor-anchor]");
    expect(frame.element.parentElement).toBe(anchor.element);
  });
});
