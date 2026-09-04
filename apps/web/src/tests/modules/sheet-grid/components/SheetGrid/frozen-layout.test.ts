import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { setCellStyle } from "@idea10/core/workbook";
import { activeCell, mountSheetGrid } from "./fixture";

function expectGridcellsToHaveUniqueLogicalRows(
  wrapper: ReturnType<typeof mountSheetGrid>["wrapper"],
): void {
  const cells = wrapper.findAll<HTMLElement>('[role="gridcell"]');
  const rowIndexes = new Set(cells.map((cell) => cell.attributes("data-row")));
  expect(wrapper.findAll('[role="row"]')).toHaveLength(rowIndexes.size);
  for (const cell of cells) {
    const row = cell.element.closest<HTMLElement>('[role="row"]');
    expect(row?.getAttribute("aria-rowindex")).toBe(
      String(Number(cell.attributes("data-row")) + 1),
    );
  }
}

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

  test("keeps one grid while cells and headers use all four frozen panes once", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    sheet.freezePanes = { rows: 2, columns: 1 };
    await nextTick();

    expect(wrapper.findAll('[role="grid"]')).toHaveLength(1);
    for (const pane of ["topLeft", "top", "left", "body"]) {
      expect(wrapper.find(`[data-pane="${pane}"]`).exists()).toBe(true);
    }
    expect(wrapper.findAll('[data-row="0"][data-column="0"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-row="0"][data-column="1"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-row="2"][data-column="0"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-row="2"][data-column="1"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-select-row="0"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-select-column="0"]')).toHaveLength(1);
    expectGridcellsToHaveUniqueLogicalRows(wrapper);
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

  test("groups visible gridcells into their logical accessibility rows", () => {
    const { wrapper } = mountSheetGrid();

    expectGridcellsToHaveUniqueLogicalRows(wrapper);
  });

  test("keeps one canonical gridcell when only a merged tail is visible", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    sheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 2, column: 1 } }];
    await nextTick();
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 48;
    await scroller.trigger("scroll");

    expect(wrapper.findAll('[data-row="0"][data-column="0"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-row="2"][data-column="0"]')).toHaveLength(0);
    expect(wrapper.findAll('[role="gridcell"]')).toHaveLength(
      new Set(
        wrapper
          .findAll('[role="gridcell"]')
          .map((cell) => `${cell.attributes("data-row")}:${cell.attributes("data-column")}`),
      ).size,
    );
  });

  test("reanchors an active merge tail when merged metadata changes", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    await wrapper.get('[data-row="2"][data-column="1"]').trigger("mousedown", { button: 0 });
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

    await wrapper.get('[data-row="0"][data-column="0"]').trigger("mousedown", { button: 0 });
    await wrapper
      .get('[data-row="2"][data-column="2"]')
      .trigger("mousedown", { button: 0, shiftKey: true });

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

  test("defensively renders an invalid cross-freeze merge with one semantic gridcell", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    sheet.freezePanes = { rows: 1, columns: 1 };
    sheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }];
    setCellStyle(sheet, { row: 0, column: 0 }, { fillColor: "#123456" });
    await nextTick();

    expect(wrapper.findAll('[data-row="0"][data-column="0"]')).toHaveLength(1);
    const fragments = wrapper.findAll('[aria-hidden="true"].sheet-cell-layer__merge-fragment');
    expect(fragments.length).toBeGreaterThan(0);
    expect(
      fragments.map((fragment) => (fragment.element as HTMLElement).style.backgroundColor),
    ).toEqual(Array.from({ length: fragments.length }, () => "#123456"));
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

    expect(wrapper.findAll('[data-row="0"][data-column="2"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-row="20"][data-column="2"]')).toHaveLength(1);
  });
});
