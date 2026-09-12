import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import {
  activeCell,
  getCanvasLayout,
  getSheetRenderFrame,
  mountSheetGrid,
  triggerCell,
} from "./fixture";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";

describe("SheetGrid frozen viewport", () => {
  test("expands for persisted freeze and merge metadata before its first render", () => {
    const { wrapper } = mountSheetGrid({
      initialRowCount: 4,
      initialColumnCount: 4,
      beforeMount(sheet) {
        sheet.freezePanes = { rows: 18, columns: 12 };
        sheet.mergedCells = [{ start: { row: 26, column: 15 }, end: { row: 28, column: 17 } }];
      },
    });

    expect(Number(wrapper.get('[role="grid"]').attributes("aria-rowcount"))).toBeGreaterThanOrEqual(
      29,
    );
    expect(Number(wrapper.get('[role="grid"]').attributes("aria-colcount"))).toBeGreaterThanOrEqual(
      18,
    );
  });

  test("keeps one grid while the canvas layout and headers use all four frozen panes", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    sheet.freezePanes = { rows: 2, columns: 1 };
    await nextTick();

    expect(wrapper.findAll('[role="grid"]')).toHaveLength(1);
    const layout = getCanvasLayout(wrapper);
    for (const pane of ["topLeft", "top", "left", "body"] as const) {
      expect(layout.panes[pane].rows.length).toBeGreaterThan(0);
      expect(layout.panes[pane].columns.length).toBeGreaterThan(0);
    }
    expect(layout.getPaneForAddress({ row: 0, column: 0 })).toBe("topLeft");
    expect(layout.getPaneForAddress({ row: 0, column: 1 })).toBe("top");
    expect(layout.getPaneForAddress({ row: 2, column: 0 })).toBe("left");
    expect(layout.getPaneForAddress({ row: 2, column: 1 })).toBe("body");
    const frame = getSheetRenderFrame(wrapper);
    expect(frame.rowHeaders).toHaveLength(2);
    expect(frame.columnHeaders).toHaveLength(2);
  });

  test("clips overscanned body headers below and after frozen headers", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    sheet.freezePanes = { rows: 3, columns: 1 };
    await nextTick();

    const scroller = wrapper.get(".sheet-grid__scroller");
    const element = scroller.element as HTMLDivElement;
    element.scrollTop = 500;
    element.scrollLeft = 400;
    await scroller.trigger("scroll");

    const frame = getSheetRenderFrame(wrapper);
    expect(frame.rowHeaders.map((pane) => pane.clip)).toEqual([
      { x: 0, y: 28, width: 48, height: 72 },
      { x: 0, y: 100, width: 48, height: 528 },
    ]);
    expect(frame.columnHeaders.map((pane) => pane.clip)).toEqual([
      { x: 48, y: 0, width: 96, height: 28 },
      { x: 144, y: 0, width: 864, height: 28 },
    ]);
    expect(frame.rowHeaders[0]?.items[0]?.offset).toBe(28);
    expect(frame.columnHeaders[0]?.items[0]?.offset).toBe(48);
    expect(frame.rowHeaders[1]?.items.some((item) => item.offset < 100)).toBe(true);
    expect(frame.columnHeaders[1]?.items.some((item) => item.offset < 144)).toBe(true);
  });

  test("keeps the canvas event and border surfaces fixed while viewport panes virtualize", () => {
    const { wrapper } = mountSheetGrid();
    const layout = getCanvasLayout(wrapper);
    expect(wrapper.findAll("[data-sheet-canvas], [data-sheet-surface]")).toHaveLength(2);
    expect(layout.panes.body.rows.length).toBeLessThan(100);
    expect(layout.panes.body.columns.length).toBeLessThan(50);
  });

  test("keeps a canonical merge anchor when only a merged tail is visible", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    sheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 2, column: 1 } }];
    await nextTick();
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 48;
    await scroller.trigger("scroll");

    const layout = getCanvasLayout(wrapper);
    expect(layout.getAnchorForAddress({ row: 2, column: 0 })).toEqual({ row: 0, column: 0 });
    expect(layout.getMergedRangeAt({ row: 2, column: 0 })).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 2, column: 1 },
    });
  });

  test("reanchors an active merge tail when merged metadata changes", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 2, column: 1 }, "mousedown", { button: 0 });
    expect(activeCell(wrapper)).toBe("B3");

    sheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 2, column: 1 } }];
    await nextTick();

    expect(activeCell(wrapper)).toBe("A1");
    const viewState = wrapper.emitted("viewStateChange")?.at(-1)?.[0];
    expect(viewState).toMatchObject({
      selection: {
        active: { row: 0, column: 0 },
        anchor: { row: 0, column: 0 },
        focus: { row: 2, column: 1 },
        mode: "cells",
      },
    });
  });

  test("fragments a selection at frozen pane boundaries", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    sheet.freezePanes = { rows: 1, columns: 1 };
    await nextTick();

    await triggerCell(wrapper, { row: 0, column: 0 }, "mousedown", { button: 0 });
    await triggerCell(wrapper, { row: 2, column: 2 }, "mousedown", { button: 0, shiftKey: true });

    const overlays = wrapper.getComponent(SheetSurface).props("overlays");
    expect(overlays.rangeRects).toHaveLength(4);
    expect(overlays.rangeRects!.map((fragment: { paneId: string }) => fragment.paneId)).toEqual(
      expect.arrayContaining(["topLeft", "top", "left", "body"]),
    );
    // The overlay painter receives fragments, then omits shared edges while stroking.
    // This keeps split frozen-pane selections visually continuous without DOM outlines.
    expect(overlays.activeRects).toHaveLength(1);
  });

  test("keeps invalid cross-freeze merge fragments in the canvas layout", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    sheet.freezePanes = { rows: 1, columns: 1 };
    sheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }];
    await nextTick();

    const layout = getCanvasLayout(wrapper);
    expect(layout.getMergedRangeAt({ row: 1, column: 1 })).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 1, column: 1 },
    });
    expect(
      layout.getRangePaneRects({ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }),
    ).not.toHaveLength(0);
  });

  test("expands and reclamps the viewport when freeze or merge metadata grows", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 1_200;
    await scroller.trigger("scroll");

    sheet.freezePanes = { rows: 180, columns: 70 };
    sheet.mergedCells = [{ start: { row: 190, column: 75 }, end: { row: 191, column: 76 } }];
    await nextTick();

    expect(Number(wrapper.get('[role="grid"]').attributes("aria-rowcount"))).toBeGreaterThanOrEqual(
      192,
    );
    expect(Number(wrapper.get('[role="grid"]').attributes("aria-colcount"))).toBeGreaterThanOrEqual(
      77,
    );
    expect((scroller.element as HTMLDivElement).scrollTop).toBeGreaterThanOrEqual(0);
  });

  test("resolves a large merge metadata set without duplicating visible cell owners", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    sheet.mergedCells = Array.from({ length: 400 }, (_, index) => ({
      start: { row: index, column: 2 },
      end: { row: index, column: 3 },
    }));
    await nextTick();

    const layout = getCanvasLayout(wrapper);
    expect(layout.getAnchorForAddress({ row: 0, column: 3 })).toEqual({ row: 0, column: 2 });
    expect(layout.getAnchorForAddress({ row: 20, column: 3 })).toEqual({ row: 20, column: 2 });
  });
});
