import { describe, expect, test } from "vitest";
import { setCellStyle, setCellValue } from "@idea10/core/workbook";
import { activeCell, getCanvasLayout, mountSheetGrid, triggerCell } from "./fixture";
import SheetCanvasLayer from "../../../../../modules/sheet-grid/components/SheetCanvasLayer.vue";

describe("SheetGrid viewport", () => {
  test("can hide headers without reserving their grid space", () => {
    const { wrapper } = mountSheetGrid({ showHeaders: false });

    expect(wrapper.find(".sheet-grid__corner").exists()).toBe(false);
    expect(wrapper.find(".sheet-column-headers").exists()).toBe(false);
    expect(wrapper.find(".sheet-row-headers").exists()).toBe(false);
    expect(wrapper.get(".sheet-grid").attributes("style")).toContain(
      "--sheet-row-header-width: 0px",
    );
    expect(wrapper.get(".sheet-grid").attributes("style")).toContain(
      "--sheet-column-header-height: 0px",
    );
  });

  test("hides default grid lines while retaining explicit borders", () => {
    const { wrapper } = mountSheetGrid({
      showGridLines: false,
      beforeMount(sheet) {
        setCellStyle(
          sheet,
          { row: 0, column: 0 },
          { borderRight: { style: "thin", color: "#123456" } },
        );
      },
    });

    expect(wrapper.getComponent(SheetCanvasLayer).props("showGridLines")).toBe(false);
    expect(wrapper.findAll("[data-sheet-canvas], [data-sheet-border-canvas]")).toHaveLength(2);
  });

  test("renders only the viewport and overscan cells while scrolling", async () => {
    const { wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller");

    expect(wrapper.findAll("[data-sheet-canvas], [data-sheet-border-canvas]")).toHaveLength(2);
    (scroller.element as HTMLDivElement).scrollTop = 1_200;
    (scroller.element as HTMLDivElement).scrollLeft = 800;
    await scroller.trigger("scroll");

    const layout = getCanvasLayout(wrapper);
    expect(layout.panes.body.rows.map((row) => row.index)).toContain(48);
    expect(layout.panes.body.columns.map((column) => column.index)).toContain(8);
    expect(layout.getCellViewportRect({ row: 50, column: 8 })).toMatchObject({ x: -32, y: 0 });
    expect(wrapper.findAll("[data-sheet-canvas], [data-sheet-border-canvas]")).toHaveLength(2);
  });

  test("keeps the allocated extent stable when native scrolling reaches its tail", async () => {
    const { wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 1_800;
    (scroller.element as HTMLDivElement).scrollLeft = 3_840;
    await scroller.trigger("scroll");

    expect(scroller.attributes("aria-rowcount")).toBe("100");
    expect(scroller.attributes("aria-colcount")).toBe("50");
    expect((scroller.element as HTMLDivElement).scrollTop).toBe(1_800);
    expect((scroller.element as HTMLDivElement).scrollLeft).toBe(3_840);
  });

  test("expands before keyboard navigation crosses an allocated edge", async () => {
    const { session, wrapper } = mountSheetGrid({
      initialRowCount: 30,
      initialColumnCount: 12,
      rowExpansionStep: 5,
      columnExpansionStep: 4,
      rowExpansionTail: 0,
      columnExpansionTail: 0,
    });
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 120;
    (scroller.element as HTMLDivElement).scrollLeft = 192;
    await scroller.trigger("scroll");
    await triggerCell(wrapper, { row: 29, column: 11 }, "mousedown", { button: 0 });

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Enter" });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Tab" });

    expect(activeCell(wrapper)).toBe("M31");
    expect(scroller.attributes("aria-rowcount")).toBe("35");
    expect(scroller.attributes("aria-colcount")).toBe("16");
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("brings an offscreen active cell back into view on keyboard navigation", async () => {
    const { wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 1_200;
    await scroller.trigger("scroll");

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "ArrowDown" });

    expect(activeCell(wrapper)).toBe("A2");
    expect((scroller.element as HTMLDivElement).scrollTop).toBe(24);
  });

  test("anchors the first visible row when wrapped content above it reflows", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 1_200;
    await scroller.trigger("scroll");
    expect(getCanvasLayout(wrapper).getCellViewportRect({ row: 50, column: 0 })?.y).toBe(0);

    setCellValue(sheet, { row: 0, column: 0 }, "wrapped ".repeat(40));
    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true });
    await wrapper.vm.$nextTick();

    expect((scroller.element as HTMLDivElement).scrollTop).toBeGreaterThan(1_200);
    expect(getCanvasLayout(wrapper).getCellViewportRect({ row: 50, column: 0 })?.y).toBe(0);
    expect(wrapper.findAll("[data-sheet-canvas], [data-sheet-border-canvas]")).toHaveLength(2);
  });
});
