import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { getCellValue, setCellValue, setColumnWidth, setRowHeight } from "@idea10/core/workbook";
import {
  activeCell,
  getCanvasLayout,
  mountSheetGrid,
  type SheetGridFixtureOptions,
} from "./fixture";

const ROW_HEIGHT = 24;
const COLUMN_WIDTH = 96;
const VIEWPORT_HEIGHT = 600;
const VIEWPORT_WIDTH = 960;

function mountCompactGrid(options?: SheetGridFixtureOptions) {
  return mountSheetGrid({
    initialRowCount: 100,
    initialColumnCount: 26,
    rowExpansionStep: 50,
    columnExpansionStep: 8,
    rowExpansionTail: 10,
    columnExpansionTail: 2,
    ...options,
  });
}

function expectExtent(
  scroller: { attributes(name: string): string | undefined },
  rowCount: number,
  columnCount: number,
): void {
  expect(scroller.attributes("aria-rowcount")).toBe(String(rowCount));
  expect(scroller.attributes("aria-colcount")).toBe(String(columnCount));
}

describe("SheetGrid extent scrolling", () => {
  test("does not allocate more rows or columns when native or external scrolling reaches the end", async () => {
    const { wrapper } = mountCompactGrid();
    const scroller = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
    scroller.element.scrollTop = 100 * ROW_HEIGHT - VIEWPORT_HEIGHT;
    scroller.element.scrollLeft = 26 * COLUMN_WIDTH - VIEWPORT_WIDTH;
    await scroller.trigger("scroll");
    expectExtent(scroller, 100, 26);

    wrapper.vm.scrollHorizontally(26 * COLUMN_WIDTH - VIEWPORT_WIDTH);
    await nextTick();
    expectExtent(scroller, 100, 26);
    wrapper.unmount();
  });

  test("grows only the axis whose wheel input crosses its allocated edge", async () => {
    const { wrapper } = mountCompactGrid();
    const scroller = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
    scroller.element.scrollTop = 100 * ROW_HEIGHT - VIEWPORT_HEIGHT;
    await scroller.trigger("scroll");
    await scroller.trigger("wheel", { deltaY: 24 });
    expectExtent(scroller, 150, 26);

    scroller.element.scrollLeft = 26 * COLUMN_WIDTH - VIEWPORT_WIDTH;
    await scroller.trigger("scroll");
    await scroller.trigger("wheel", { deltaY: 24, shiftKey: true });
    expectExtent(scroller, 150, 34);
    wrapper.unmount();
  });

  test("reclaims blank tail blocks after returning while retaining and then releasing sparse data", async () => {
    const { sheet, wrapper } = mountCompactGrid();
    const scroller = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
    scroller.element.scrollTop = 100 * ROW_HEIGHT - VIEWPORT_HEIGHT;
    scroller.element.scrollLeft = 26 * COLUMN_WIDTH - VIEWPORT_WIDTH;
    await scroller.trigger("scroll");
    await scroller.trigger("wheel", { deltaY: 24 });
    await scroller.trigger("wheel", { deltaY: 24, shiftKey: true });
    expectExtent(scroller, 150, 34);

    setCellValue(sheet, { row: 132, column: 30 }, "tail value");
    setRowHeight(sheet, 145, 40);
    setColumnWidth(sheet, 33, 144);
    wrapper.vm.navigateToCell({ row: 132, column: 30 });
    await nextTick();
    scroller.element.scrollTop = 0;
    scroller.element.scrollLeft = 0;
    await scroller.trigger("scroll");

    expectExtent(scroller, 150, 34);
    expect(getCellValue(sheet, { row: 132, column: 30 })).toBe("tail value");
    expect(wrapper.find('[data-cell-editor="AE133"]').exists()).toBe(true);

    setCellValue(sheet, { row: 132, column: 30 }, "");
    setRowHeight(sheet, 145, ROW_HEIGHT);
    setColumnWidth(sheet, 33, COLUMN_WIDTH);
    wrapper.vm.navigateToCell({ row: 0, column: 0 });
    await nextTick();
    scroller.element.scrollTop = 0;
    scroller.element.scrollLeft = 0;
    await scroller.trigger("scroll");

    expectExtent(scroller, 100, 26);
    expect(wrapper.find('[data-cell-editor="A1"]').exists()).toBe(true);
    wrapper.unmount();
  });

  test("keeps frozen and merged metadata reachable while selection navigates in the retained extent", async () => {
    const { sheet, wrapper } = mountCompactGrid({
      beforeMount(sheet) {
        sheet.freezePanes = { rows: 4, columns: 2 };
        sheet.mergedCells = [{ start: { row: 118, column: 29 }, end: { row: 119, column: 30 } }];
      },
    });
    const scroller = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
    expectExtent(scroller, 150, 34);

    wrapper.vm.navigateToCell({ row: 119, column: 30 });
    await nextTick();
    expect(activeCell(wrapper)).toBe("AD119");
    expect(getCanvasLayout(wrapper).getCellViewportRect({ row: 118, column: 29 })).not.toBeNull();

    scroller.element.scrollTop = 0;
    scroller.element.scrollLeft = 0;
    await scroller.trigger("scroll");
    expectExtent(scroller, 150, 34);
    expect(sheet.freezePanes).toEqual({ rows: 4, columns: 2 });
    wrapper.unmount();
  });
});
