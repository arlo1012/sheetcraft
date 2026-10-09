import { DOMWrapper } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { getCellValue, setCellNote, setCellValue } from "@sheetcraft/core/workbook";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import {
  activeCell,
  getFloatingMenu,
  hasFloatingMenu,
  mountSheetGrid,
  triggerCell,
} from "./fixture";

function rangeWidth(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]): number | undefined {
  return (
    wrapper.getComponent(SheetSurface).props("overlays") as {
      rangeRects?: Array<{ rect: { width: number } }>;
    }
  ).rangeRects?.[0]?.rect.width;
}

describe("SheetGrid cell context menu", () => {
  test("offers note actions for the context cell and forwards its merged-cell anchor", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    sheet.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 1, column: 2 } }];
    setCellNote(sheet, { row: 1, column: 1 }, { text: "Review me" });

    await triggerCell(wrapper, { row: 1, column: 2 }, "contextmenu", {
      clientX: 200,
      clientY: 48,
    });
    const menu = getFloatingMenu();
    expect(menu.get('[data-cell-action="edit-note"]').text()).toContain("Edit Note");
    expect(menu.get('[data-cell-action="delete-note"]').text()).toContain("Delete Notes");
    await menu.get('[data-cell-action="edit-note"]').trigger("click");

    expect(wrapper.emitted("editNote")).toEqual([[{ row: 1, column: 1 }]]);
  });

  test("uses Shift+F2 to request note editing for the active cell", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "F2", shiftKey: true });

    expect(wrapper.emitted("editNote")).toEqual([[{ row: 0, column: 0 }]]);
  });

  test("preserves a cell range when right-clicking inside it and clears it atomically", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "A");
    setCellValue(sheet, { row: 0, column: 1 }, "B");
    setCellValue(sheet, { row: 1, column: 0 }, "C");
    setCellValue(sheet, { row: 1, column: 1 }, "D");
    setCellValue(sheet, { row: 2, column: 2 }, "outside");
    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0, shiftKey: true });

    await triggerCell(wrapper, { row: 1, column: 1 }, "contextmenu", {
      clientX: 160,
      clientY: 48,
    });
    const menu = getFloatingMenu();
    expect(menu.attributes("aria-label")).toBe("Cell actions");
    expect(activeCell(wrapper)).toBe("A1");
    expect(rangeWidth(wrapper)).toBe(192);
    await menu.get('[data-cell-action="clear"]').trigger("click");
    await wrapper.vm.$nextTick();
    await new DOMWrapper(document.body)
      .get('ul[aria-label="Clear"]')
      .get('[data-cell-action="clear-contents"]')
      .trigger("click");

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe("outside");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("switches to a right-clicked cell outside the current selection", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "keep");
    setCellValue(sheet, { row: 2, column: 2 }, "remove");
    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0, shiftKey: true });

    await triggerCell(wrapper, { row: 2, column: 2 }, "contextmenu", {
      clientX: 256,
      clientY: 72,
    });
    expect(activeCell(wrapper)).toBe("C3");
    expect(rangeWidth(wrapper)).toBe(96);
    await getFloatingMenu().get('[data-cell-action="clear"]').trigger("click");
    await wrapper.vm.$nextTick();
    await new DOMWrapper(document.body)
      .get('ul[aria-label="Clear"]')
      .get('[data-cell-action="clear-contents"]')
      .trigger("click");

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("keep");
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBeNull();
  });

  test("opens from keyboard and restores focus on Escape", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const { wrapper } = mountSheetGrid({ attachTo: host });
    try {
      const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
      editor.element.focus();
      await editor.trigger("keydown", { key: "ContextMenu" });
      let menu = getFloatingMenu();
      expect(document.activeElement).toBe(menu.get('[data-cell-action="insert"]').element);
      await menu.trigger("keydown", { key: "Escape" });
      await wrapper.vm.$nextTick();
      expect(hasFloatingMenu()).toBe(false);
      expect(document.activeElement).toBe(editor.element);

      await editor.trigger("keydown", { key: "F10", shiftKey: true });
      menu = getFloatingMenu();
      expect(menu.attributes("aria-label")).toBe("Cell actions");
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });

  test("leaves the editing textarea context menu to the browser", async () => {
    const { wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "F2" });
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 80,
      clientY: 40,
    });
    editor.element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(hasFloatingMenu()).toBe(false);
  });
});
