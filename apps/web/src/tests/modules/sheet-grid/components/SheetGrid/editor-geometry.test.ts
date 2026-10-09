import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { getCellValue } from "@sheetcraft/core/workbook";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import { getCanvasLayout, mountSheetGrid, triggerCell } from "./fixture";

describe("cell editor geometry", () => {
  test.each([
    {
      edge: "column",
      freeze: { rows: 0, columns: 2 },
      row: 3,
      column: 2,
      paneId: "body",
    },
    {
      edge: "row",
      freeze: { rows: 2, columns: 0 },
      row: 2,
      column: 3,
      paneId: "body",
    },
    {
      edge: "row and column",
      freeze: { rows: 2, columns: 2 },
      row: 2,
      column: 2,
      paneId: "body",
    },
    {
      edge: "top-left frozen pane",
      freeze: { rows: 2, columns: 2 },
      row: 1,
      column: 1,
      paneId: "topLeft",
    },
  ])(
    "keeps the editor border inside its clip at a frozen $edge edge",
    async ({ freeze, row, column, paneId }) => {
      const { wrapper } = mountSheetGrid({
        beforeMount(sheet) {
          sheet.freezePanes = freeze;
        },
      });
      await triggerCell(wrapper, { row, column }, "dblclick", { button: 0 });
      await nextTick();
      const editorPane = wrapper.get<HTMLElement>(`[data-editor-pane="${paneId}"]`).element;
      const anchor = wrapper.get<HTMLElement>("[data-cell-editor-anchor]").element;
      const frame = wrapper.get<HTMLElement>("[data-cell-editor-frame]").element;
      const surfaceFrame = wrapper.getComponent(SheetSurface).props("frame");
      const outline = getCanvasLayout(wrapper).getCellViewportRect({ row, column })!;
      const insets = editorPane.style.clipPath
        .replace(/^inset\(|\)$/gu, "")
        .split(/\s+/u)
        .map(Number.parseFloat);
      const clipTop = insets[0] ?? 0;
      const clipLeft = insets[3] ?? insets[1] ?? 0;
      const frameTop = Number.parseFloat(anchor.style.top) + Number.parseFloat(frame.style.top);
      const frameLeft = Number.parseFloat(anchor.style.left) + Number.parseFloat(frame.style.left);

      expect(anchor.parentElement).toBe(editorPane);
      expect(frame.parentElement).toBe(anchor);
      expect(frameTop).toBeGreaterThanOrEqual(clipTop);
      expect(frameLeft).toBeGreaterThanOrEqual(clipLeft);
      expect(Number.parseFloat(editorPane.style.left) + frameLeft).toBe(
        surfaceFrame.body.x + outline.x - 1,
      );
      expect(Number.parseFloat(editorPane.style.top) + frameTop).toBe(
        surfaceFrame.body.y + outline.y - 1,
      );

      await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Escape" });
      expect(wrapper.find("[data-cell-editor-anchor]").exists()).toBe(true);
    },
  );

  test("keeps a scrolled body editor in its pane-local viewport coordinates", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.freezePanes = { rows: 2, columns: 2 };
      },
    });
    const scroller = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
    scroller.element.scrollTop = 500;
    scroller.element.scrollLeft = 400;
    await scroller.trigger("scroll");
    await nextTick();

    const layout = getCanvasLayout(wrapper);
    const body = layout.panes.body;
    const address = body.rows
      .flatMap((row) => body.columns.map((column) => ({ row: row.index, column: column.index })))
      .find((address) => {
        const rect = layout.getCellViewportRect(address);
        return rect && rect.x >= body.clip.x && rect.y >= body.clip.y;
      });
    expect(address).toBeDefined();
    await triggerCell(wrapper, address!, "dblclick", { button: 0 });
    await nextTick();

    const pane = wrapper.get<HTMLElement>('[data-editor-pane="body"]').element;
    const anchor = wrapper.get<HTMLElement>("[data-cell-editor-anchor]").element;
    const surfaceFrame = wrapper.getComponent(SheetSurface).props("frame");
    const outline = layout.getCellViewportRect(address!)!;

    expect(Number.parseFloat(pane.style.left) + Number.parseFloat(anchor.style.left)).toBe(
      surfaceFrame.body.x + outline.x,
    );
    expect(Number.parseFloat(pane.style.top) + Number.parseFloat(anchor.style.top)).toBe(
      surfaceFrame.body.y + outline.y,
    );
  });

  test("keeps a fitting editor aligned with the selected cell without extra trailing width", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0 });
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    const outline = getCanvasLayout(wrapper).getCellViewportRect({ row: 1, column: 1 })!;
    Object.defineProperties(editor.element, {
      clientWidth: { configurable: true, get: () => 95 },
      scrollWidth: { configurable: true, get: () => 95 },
      scrollHeight: { configurable: true, get: () => 23 },
    });

    await editor.trigger("keydown", { key: "F2" });
    await nextTick();
    const frame = wrapper.get<HTMLElement>("[data-cell-editor-frame]").element.style;
    expect(frame.width).toBe(`${outline.width + 1}px`);
    expect(frame.height).toBe(`${outline.height + 1}px`);

    await editor.setValue("Short");
    await nextTick();
    expect(frame.width).toBe(`${outline.width + 1}px`);
    expect(frame.height).toBe(`${outline.height + 1}px`);
  });

  test("edits across the complete merged area and returns to ordinary cell dimensions", async () => {
    const { session, sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 5, column: 4 } }];
        sheet.columnWidths.set(2, 120);
        sheet.rowHeights.set(3, 40);
      },
    });
    const layout = getCanvasLayout(wrapper);
    const mergedRange = layout.getMergedRangeAt({ row: 1, column: 1 });
    const mergedRect = layout.getRangePaneRects(mergedRange!)[0]?.rect;
    await triggerCell(wrapper, { row: 1, column: 1 }, "dblclick", { button: 0 });
    await nextTick();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    const frame = wrapper.get<HTMLElement>("[data-cell-editor-frame]").element.style;
    expect(editor.classes()).toContain("is-editing");
    expect(frame.width).toBe(`${mergedRect!.width + 1}px`);
    expect(frame.height).toBe(`${mergedRect!.height + 1}px`);
    expect(frame.width).toBe("409px");
    expect(frame.height).toBe("137px");

    await editor.setValue("Merged content");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("Merged content");
    expect(session.history.undoStack).toHaveLength(1);

    await triggerCell(wrapper, { row: 6, column: 5 }, "dblclick", { button: 0 });
    await nextTick();
    const nextFrame = wrapper.get<HTMLElement>("[data-cell-editor-frame]").element.style;
    expect(nextFrame.width).toBe("97px");
    expect(nextFrame.height).toBe("25px");
  });
});
