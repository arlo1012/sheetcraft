import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { getCellValue } from "@idea10/core/workbook";
import { mountSheetGrid } from "./fixture";

describe("cell editor geometry", () => {
  test.each([
    { edge: "column", freeze: { rows: 0, columns: 2 }, row: 3, column: 2 },
    { edge: "row", freeze: { rows: 2, columns: 0 }, row: 2, column: 3 },
    { edge: "row and column", freeze: { rows: 2, columns: 2 }, row: 2, column: 2 },
  ])(
    "keeps the editor border inside its clip at a frozen $edge edge",
    async ({ freeze, row, column }) => {
      const { wrapper } = mountSheetGrid({
        beforeMount(sheet) {
          sheet.freezePanes = freeze;
        },
      });
      const cell = wrapper.get<HTMLElement>(`[data-row="${row}"][data-column="${column}"]`);
      const pane = cell.element.parentElement as HTMLElement;
      const initialClip = pane.style.clipPath;

      await cell.trigger("dblclick", { button: 0 });
      await nextTick();
      const frame = wrapper.get<HTMLElement>("[data-cell-editor-frame]").element;
      const insets = pane.style.clipPath
        .replace(/^inset\(|\)$/gu, "")
        .split(/\s+/u)
        .map(Number.parseFloat);
      const clipTop = insets[0] ?? 0;
      const clipLeft = insets[3] ?? insets[1] ?? 0;
      const frameTop =
        Number.parseFloat(cell.element.style.top) + Number.parseFloat(frame.style.top);
      const frameLeft =
        Number.parseFloat(cell.element.style.left) + Number.parseFloat(frame.style.left);

      expect(frameTop).toBeGreaterThanOrEqual(clipTop);
      expect(frameLeft).toBeGreaterThanOrEqual(clipLeft);

      await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Escape" });
      expect(pane.style.clipPath).toBe(initialClip);
    },
  );

  test("keeps a fitting editor aligned with the selected cell without extra trailing width", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.get('[data-row="1"][data-column="1"]').trigger("mousedown", { button: 0 });
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    const outline = wrapper.get<HTMLElement>("[data-active-cell]").element.style;
    Object.defineProperties(editor.element, {
      clientWidth: { configurable: true, get: () => 95 },
      scrollWidth: { configurable: true, get: () => 95 },
      scrollHeight: { configurable: true, get: () => 23 },
    });

    await editor.trigger("keydown", { key: "F2" });
    await nextTick();
    const frame = wrapper.get<HTMLElement>("[data-cell-editor-frame]").element.style;
    expect(frame.width).toBe(outline.width);
    expect(frame.height).toBe(outline.height);

    await editor.setValue("Short");
    await nextTick();
    expect(frame.width).toBe(outline.width);
    expect(frame.height).toBe(outline.height);
  });

  test("edits across the complete merged area and returns to ordinary cell dimensions", async () => {
    const { session, sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 5, column: 4 } }];
        sheet.columnWidths.set(2, 120);
        sheet.rowHeights.set(3, 40);
      },
    });
    const cell = wrapper.get<HTMLElement>('[data-row="1"][data-column="1"]');
    await cell.trigger("dblclick", { button: 0 });
    await nextTick();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    const frame = wrapper.get<HTMLElement>("[data-cell-editor-frame]").element.style;
    expect(editor.classes()).toContain("is-editing");
    expect(frame.width).toBe(`${Number.parseFloat(cell.element.style.width) + 1}px`);
    expect(frame.height).toBe(`${Number.parseFloat(cell.element.style.height) + 1}px`);
    expect(frame.width).toBe("409px");
    expect(frame.height).toBe("137px");

    await editor.setValue("Merged content");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("Merged content");
    expect(session.history.undoStack).toHaveLength(1);

    await wrapper.get('[data-row="6"][data-column="5"]').trigger("dblclick", { button: 0 });
    await nextTick();
    const nextFrame = wrapper.get<HTMLElement>("[data-cell-editor-frame]").element.style;
    expect(nextFrame.width).toBe("97px");
    expect(nextFrame.height).toBe("25px");
  });
});
