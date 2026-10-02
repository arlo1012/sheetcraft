import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { DEFAULT_SHEET_PAGE_SETUP } from "@idea10/core/page-setup";
import { getCellValue } from "@idea10/core/workbook";
import type { SheetGridViewState } from "@idea10/sheet-engine/view-state";
import type { SheetGeometry } from "@idea10/sheet-engine/geometry";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import type { PageViewPaintState } from "../../../../../modules/page-layout/page-view-types";
import { activeCell, getCanvasLayout, mountSheetGrid, triggerCell } from "./fixture";

type Wrapper = ReturnType<typeof mountSheetGrid>["wrapper"];

function renderExtent(wrapper: Wrapper) {
  const grid = wrapper.get('[role="grid"]');
  return {
    rowCount: Number(grid.attributes("aria-rowcount")),
    columnCount: Number(grid.attributes("aria-colcount")),
  };
}

function pageView(wrapper: Wrapper) {
  return wrapper.getComponent(SheetSurface).props("pageView") as PageViewPaintState;
}

async function enterPageLayout(wrapper: Wrapper) {
  await wrapper.setProps({ viewMode: "page-layout" });
  await nextTick();
}

describe("SheetGrid page layout extent", () => {
  test("starts an empty 100 by 26 grid on one complete paper and creates only visible cells", async () => {
    const { sheet, session, wrapper } = mountSheetGrid({ initialColumnCount: 26 });
    await enterPageLayout(wrapper);
    const extent = renderExtent(wrapper);
    const state = pageView(wrapper);
    const paper = state.pages[0]!;
    const geometry = wrapper.getComponent(SheetSurface).props("geometry") as SheetGeometry;
    const last = geometry.getCellRect({ row: extent.rowCount - 1, column: extent.columnCount - 1 });
    expect(state.pages).toHaveLength(1);
    expect(wrapper.get('[role="grid"]').attributes("data-page-count")).toBe("1");
    expect(extent.rowCount).toBeLessThan(100);
    expect(extent.columnCount).toBeLessThan(26);
    expect(
      paper.contentRect.x + paper.contentRect.width - last.x - last.width,
    ).toBeGreaterThanOrEqual(0);
    expect(paper.contentRect.x + paper.contentRect.width - last.x - last.width).toBeLessThan(
      last.width,
    );
    expect(
      paper.contentRect.y + paper.contentRect.height - last.y - last.height,
    ).toBeGreaterThanOrEqual(0);
    expect(paper.contentRect.y + paper.contentRect.height - last.y - last.height).toBeLessThan(
      last.height,
    );
    expect(getCanvasLayout(wrapper).panes.body.rows.length).toBeLessThan(extent.rowCount);
    expect(sheet.cells.size).toBe(0);
    expect(session.history.undoStack).toHaveLength(0);
    wrapper.unmount();
  });

  test("adds one complete paper at each wheel edge and resets unused papers on reentry without changing print or normal extents", async () => {
    const { wrapper } = mountSheetGrid({ initialColumnCount: 26 });
    await enterPageLayout(wrapper);
    const initial = renderExtent(wrapper);
    const scroller = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
    const layout = getCanvasLayout(wrapper);
    scroller.element.scrollTop = layout.nativeScrollSize.height - layout.viewportSize.height;
    await scroller.trigger("scroll");
    await scroller.trigger("wheel", { deltaY: 24 });
    expect(renderExtent(wrapper)).toEqual({ ...initial, rowCount: initial.rowCount * 2 });
    await scroller.trigger("wheel", { deltaY: 24, shiftKey: true });
    expect(renderExtent(wrapper)).toEqual({
      rowCount: initial.rowCount * 2,
      columnCount: initial.columnCount * 2,
    });
    expect(wrapper.get('[role="grid"]').attributes("data-page-count")).toBe("1");
    const saved = wrapper.emitted("viewStateChange")!.at(-1)![0] as SheetGridViewState;
    expect(saved.gridExtent).toEqual({ rowCount: 100, columnCount: 26 });
    scroller.element.scrollTop = 0;
    scroller.element.scrollLeft = 0;
    await scroller.trigger("scroll");
    expect(renderExtent(wrapper).rowCount).toBe(initial.rowCount);
    await wrapper.setProps({ viewMode: "normal" });
    expect(renderExtent(wrapper)).toEqual({ rowCount: 100, columnCount: 26 });
    await enterPageLayout(wrapper);
    expect(renderExtent(wrapper)).toEqual(initial);
    wrapper.unmount();
  });

  test("fills and edits the terminal row and column of a 100 by 26 print range", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      initialColumnCount: 26,
      beforeMount(sheet) {
        sheet.pageSetup = {
          ...DEFAULT_SHEET_PAGE_SETUP,
          printArea: { start: { row: 0, column: 0 }, end: { row: 99, column: 25 } },
        };
      },
    });
    await enterPageLayout(wrapper);
    const extent = renderExtent(wrapper);
    expect(extent.rowCount).toBeGreaterThan(100);
    expect(extent.columnCount).toBeGreaterThan(26);
    const target = { row: extent.rowCount - 1, column: extent.columnCount - 1 };
    wrapper.vm.navigateToCell(target);
    await nextTick();
    const layout = getCanvasLayout(wrapper);
    expect(layout.panes.body.rows.map((row) => row.index)).toContain(target.row);
    expect(layout.panes.body.columns.map((column) => column.index)).toContain(target.column);
    await triggerCell(wrapper, target, "mousedown", { button: 0 });
    expect(activeCell(wrapper)).toBe("AD120");
    const editor = wrapper.get("textarea.cell-editor");
    await editor.setValue("terminal cell");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, target)).toBe("terminal cell");
    expect(sheet.pageSetup!.printArea!.end).toEqual({ row: 99, column: 25 });
    wrapper.unmount();
  });

  test("keeps a selected blank cell reachable when print scale reduces paper capacity", async () => {
    const { sheet, wrapper } = mountSheetGrid({ initialColumnCount: 26 });
    await enterPageLayout(wrapper);
    wrapper.vm.navigateToCell({ row: 30, column: 5 });
    await nextTick();
    sheet.pageSetup = { ...DEFAULT_SHEET_PAGE_SETUP, scale: 400 };
    await nextTick();
    expect(activeCell(wrapper)).toBe("F31");
    expect(renderExtent(wrapper).rowCount).toBeGreaterThan(30);
    expect(renderExtent(wrapper).columnCount).toBeGreaterThan(5);
    expect(getCanvasLayout(wrapper).getCellViewportRect({ row: 30, column: 5 })).not.toBeNull();
    expect(sheet.cells.size).toBe(0);
    wrapper.unmount();
  });

  test("fills a single paper beyond normal allocation at low print scale", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      initialColumnCount: 26,
      beforeMount(sheet) {
        sheet.pageSetup = { ...DEFAULT_SHEET_PAGE_SETUP, scale: 10 };
      },
    });
    await enterPageLayout(wrapper);
    expect(pageView(wrapper).pages).toHaveLength(1);
    const extent = renderExtent(wrapper);
    expect(extent.rowCount).toBeGreaterThan(100);
    expect(extent.columnCount).toBeGreaterThan(26);
    const target = { row: extent.rowCount - 1, column: extent.columnCount - 1 };
    wrapper.vm.navigateToCell(target);
    await nextTick();
    expect(getCanvasLayout(wrapper).getCellViewportRect(target)).not.toBeNull();
    expect(sheet.cells.size).toBe(0);
    wrapper.unmount();
  });
});
