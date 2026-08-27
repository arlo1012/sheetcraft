import { nextTick } from "vue";
import { describe, expect, test, vi } from "vitest";
import { getCellValue } from "../../../../../modules/workbook/workbook";
import { activeCell, mountSheetGrid } from "./fixture";

describe("cell editor IME composition", () => {
  test("keeps composition inside the editor until an explicit commit", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("input.cell-editor");

    await editor.trigger("compositionstart");
    await editor.setValue("中文");
    await editor.trigger("keydown", { key: "Enter", isComposing: true });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);

    await editor.trigger("compositionend");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("中文");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("cancels composition without writing workbook history", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("input.cell-editor");

    await editor.trigger("compositionstart");
    await editor.setValue("未完成");
    await editor.setValue("");
    await editor.trigger("compositionend", { data: "" });

    expect(wrapper.get("input.cell-editor").classes()).not.toContain("is-editing");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("finishes a deferred blur after composition ends", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("input.cell-editor");

    await editor.trigger("compositionstart");
    await editor.setValue("中文");
    await editor.trigger("blur");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();

    await editor.trigger("compositionend", { data: "中文" });

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("中文");
    expect(wrapper.get("input.cell-editor").classes()).not.toContain("is-editing");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("does not reclaim focus when a blurred composition is canceled", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    await nextTick();
    const editor = wrapper.get("input.cell-editor");
    const focusSpy = vi.spyOn(editor.element as HTMLInputElement, "focus");

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
    const editor = wrapper.get("input.cell-editor");
    await editor.trigger("compositionstart");
    await editor.setValue("中文");

    await wrapper.get('[data-row="1"][data-column="1"]').trigger("mousedown", { button: 0 });

    expect(activeCell(wrapper)).toBe("A1");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);

    await editor.trigger("compositionend", { data: "中文" });

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("中文");
    expect(activeCell(wrapper)).toBe("B2");
    expect(session.history.undoStack).toHaveLength(1);
  });
});
