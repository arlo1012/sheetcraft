import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { activeCell, getCanvasLayout, mountSheetGrid, triggerCell } from "./fixture";

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
    const scroller = wrapper.get(".sheet-grid__scroller");

    expect(Number(scroller.attributes("aria-rowcount"))).toBeGreaterThanOrEqual(29);
    expect(Number(scroller.attributes("aria-colcount"))).toBeGreaterThanOrEqual(18);
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
    expect(wrapper.findAll('[data-select-row="0"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-select-column="0"]')).toHaveLength(1);
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

    const frozenRows = wrapper.get('.sheet-row-headers [data-header-pane="frozen"]');
    const bodyRows = wrapper.get('.sheet-row-headers [data-header-pane="body"]');
    const frozenColumns = wrapper.get('.sheet-column-headers [data-header-pane="frozen"]');
    const bodyColumns = wrapper.get('.sheet-column-headers [data-header-pane="body"]');

    expect(frozenRows.attributes("style")).toContain("top: 0px");
    expect(frozenRows.attributes("style")).toContain("height: 72px");
    expect(bodyRows.attributes("style")).toContain("top: 72px");
    expect(bodyRows.attributes("style")).toContain("height: 528px");
    expect(frozenColumns.attributes("style")).toContain("left: 0px");
    expect(frozenColumns.attributes("style")).toContain("width: 96px");
    expect(bodyColumns.attributes("style")).toContain("left: 96px");
    expect(bodyColumns.attributes("style")).toContain("width: 864px");

    expect(frozenRows.get('[data-row="0"]').attributes("style")).toContain("top: 0px");
    expect(frozenColumns.get('[data-column="0"]').attributes("style")).toContain("left: 0px");
    expect(
      bodyRows
        .findAll<HTMLElement>("[data-row]")
        .some((item) => Number.parseFloat(item.element.style.top) < 0),
    ).toBe(true);
    expect(
      bodyColumns
        .findAll<HTMLElement>("[data-column]")
        .some((item) => Number.parseFloat(item.element.style.left) < 0),
    ).toBe(true);

    await frozenRows.get('[data-select-row="0"]').trigger("mousedown", { button: 0 });
    expect(frozenRows.get('[data-select-row="0"]').attributes("aria-pressed")).toBe("true");
  });

  test("keeps the canvas event and border surfaces fixed while viewport panes virtualize", () => {
    const { wrapper } = mountSheetGrid();
    const layout = getCanvasLayout(wrapper);
    expect(wrapper.findAll("[data-sheet-canvas], [data-sheet-border-canvas]")).toHaveLength(2);
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

    expect(wrapper.findAll("[data-selection-range]")).toHaveLength(4);
    const outlineStyles = wrapper
      .findAll<HTMLElement>("[data-selection-outline]")
      .map((outline) => outline.element.style);
    expect(outlineStyles).toHaveLength(4);
    const transparentSides = outlineStyles.flatMap((style) =>
      ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"].filter(
        (property) => style[property as keyof CSSStyleDeclaration] === "transparent",
      ),
    );
    expect(transparentSides).toHaveLength(8);
    for (const property of [
      "borderTopColor",
      "borderRightColor",
      "borderBottomColor",
      "borderLeftColor",
    ]) {
      expect(transparentSides.filter((side) => side === property)).toHaveLength(2);
    }
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

    expect(Number(scroller.attributes("aria-rowcount"))).toBeGreaterThanOrEqual(192);
    expect(Number(scroller.attributes("aria-colcount"))).toBeGreaterThanOrEqual(77);
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
