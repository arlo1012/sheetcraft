import { describe, expect, test } from "vitest";
import { setCellValue } from "@sheetcraft/core/workbook";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import { activeCell, mountSheetGrid, triggerAxisHeader, triggerCell } from "./fixture";

describe("SheetGrid accessibility", () => {
  test("exposes grid metadata and one labelled editor", () => {
    const { wrapper } = mountSheetGrid({ attachTo: document.body });
    try {
      const grid = wrapper.get('[role="grid"]');
      const editor = wrapper.get('textarea[aria-label="Cell A1, blank"]');

      expect(grid.attributes("aria-rowcount")).toBe("100");
      expect(grid.attributes("aria-colcount")).toBe("50");
      expect(grid.find("[data-sheet-surface]").exists()).toBe(true);
      expect(grid.find("textarea.cell-editor").exists()).toBe(true);
      expect(wrapper.findAll("textarea.cell-editor")).toHaveLength(1);
      (editor.element as HTMLTextAreaElement).focus();
      expect(document.activeElement).toBe(editor.element);
    } finally {
      wrapper.unmount();
    }
  });

  test("announces the display value when a populated cell becomes active", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 1 }, "Budget");

    await triggerCell(wrapper, { row: 0, column: 1 }, "mousedown", { button: 0 });

    expect(wrapper.get("textarea.cell-editor").attributes("aria-label")).toBe("Cell B1, Budget");
  });

  test("marks visible range cells selected while keeping one active editor", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 1, column: 2 }, "mousedown", { button: 0, shiftKey: true });

    expect(wrapper.get('[role="grid"]').attributes("aria-multiselectable")).toBe("true");
    expect(activeCell(wrapper)).toBe("A1");
    expect(
      (wrapper.getComponent(SheetSurface).props("overlays") as { rangeRects: unknown[] })
        .rangeRects,
    ).not.toHaveLength(0);
    expect(wrapper.findAll("textarea.cell-editor")).toHaveLength(1);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false);
  });

  test("exposes one focusable Canvas surface with an axis label after a header interaction", async () => {
    const { wrapper } = mountSheetGrid({ attachTo: document.body });
    try {
      await triggerAxisHeader(wrapper, "column", 0);
      const surface = wrapper
        .getComponent(SheetSurface)
        .get<HTMLCanvasElement>("[data-sheet-surface]");
      expect(surface.attributes("tabindex")).toBe("0");
      expect(surface.attributes("aria-label")).toBe("Select column A");
      expect(wrapper.findAll('[role="separator"]')).toHaveLength(0);
    } finally {
      wrapper.unmount();
    }
  });
});
