import { describe, expect, test } from "vitest";
import { getCellValue, setCellValue } from "../../../../../modules/workbook/workbook";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { activeCell, mountSheetGrid } from "./fixture";

describe("SheetGrid range clearing", () => {
  test("clears a selected rectangle with Delete and preserves one-step history", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "A");
    setCellValue(sheet, { row: 0, column: 1 }, "B");
    setCellValue(sheet, { row: 1, column: 0 }, "C");
    setCellValue(sheet, { row: 1, column: 1 }, "D");
    setCellValue(sheet, { row: 2, column: 2 }, "outside");
    await wrapper
      .get('[data-row="1"][data-column="1"]')
      .trigger("mousedown", { button: 0, shiftKey: true });

    const copied = createTestClipboardEvent("copy");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(copied.event);
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[data-clipboard-range]").exists()).toBe(true);

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Delete" });

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 1, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe("outside");
    expect(session.history.undoStack).toHaveLength(1);
    expect(activeCell(wrapper)).toBe("A1");
    expect(wrapper.get("[data-selection-range]").attributes("style")).toContain("width: 192px");
    expect(wrapper.find("[data-clipboard-range]").exists()).toBe(false);

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("A");
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("D");

    await wrapper
      .get("textarea.cell-editor")
      .trigger("keydown", { key: "z", ctrlKey: true, shiftKey: true });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();
  });

  test("uses Backspace to clear a single cell", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "remove");
    const event = new KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
      cancelable: true,
    });

    wrapper.get("textarea.cell-editor").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(sheet.cells.size).toBe(0);
    expect(session.history.undoStack).toHaveLength(1);
    expect(activeCell(wrapper)).toBe("A1");
  });

  test("leaves Delete and Backspace inside editing and composition", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "keep");
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "F2" });

    await editor.trigger("keydown", { key: "Backspace" });
    await editor.trigger("compositionstart");
    await editor.trigger("keydown", { key: "Delete", isComposing: true });

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("keep");
    expect(session.history.undoStack).toHaveLength(0);
    expect(editor.classes()).toContain("is-editing");
  });
});
