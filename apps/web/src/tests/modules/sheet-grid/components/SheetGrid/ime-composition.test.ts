import { nextTick } from "vue";
import { describe, expect, test, vi } from "vitest";
import { getCellValue } from "@sheetcraft/core/workbook";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";

describe("cell editor IME composition", () => {
  test("keeps composition inside the editor until an explicit commit", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("compositionstart");
    await editor.setValue("中文");
    await editor.trigger("keydown", { key: "Enter", altKey: true, isComposing: true });
    await editor.trigger("keydown", { key: "Enter", isComposing: true });
    expect((editor.element as HTMLTextAreaElement).value).toBe("中文");
    expect(activeCell(wrapper)).toBe("A1");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);

    await editor.trigger("compositionend");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("中文");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("cancels composition without writing workbook history", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("compositionstart");
    await editor.setValue("未完成");
    await editor.setValue("");
    await editor.trigger("compositionend", { data: "" });

    expect(wrapper.get("textarea.cell-editor").classes()).not.toContain("is-editing");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("preserves an existing edit draft when a nested composition is canceled", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "F2" });
    await editor.setValue("draft");

    await editor.trigger("compositionstart");
    await editor.setValue("draft unfinished");
    await editor.setValue("draft");
    await editor.trigger("compositionend", { data: "" });

    expect(wrapper.get("textarea.cell-editor").classes()).toContain("is-editing");
    expect((wrapper.get("textarea.cell-editor").element as HTMLTextAreaElement).value).toBe(
      "draft",
    );
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("draft");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("finishes a deferred blur after composition ends", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("compositionstart");
    await editor.setValue("中文");
    await editor.trigger("blur");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();

    await editor.trigger("compositionend", { data: "中文" });

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("中文");
    expect(wrapper.get("textarea.cell-editor").classes()).not.toContain("is-editing");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("does not reclaim focus when a blurred composition is canceled", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    await nextTick();
    const editor = wrapper.get("textarea.cell-editor");
    const focusSpy = vi.spyOn(editor.element as HTMLTextAreaElement, "focus");

    await editor.trigger("compositionstart");
    await editor.setValue("未完成");
    await editor.trigger("blur");
    await editor.setValue("");
    focusSpy.mockClear();
    await editor.trigger("compositionend", { data: "" });
    await nextTick();

    expect(focusSpy).not.toHaveBeenCalled();
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
    focusSpy.mockRestore();
  });

  test("defers a pointer selection until composition finishes", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("compositionstart");
    await editor.setValue("中文");

    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0 });

    expect(activeCell(wrapper)).toBe("A1");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);

    await editor.trigger("compositionend", { data: "中文" });

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("中文");
    expect(activeCell(wrapper)).toBe("B2");
    expect(session.history.undoStack).toHaveLength(1);
  });
});
