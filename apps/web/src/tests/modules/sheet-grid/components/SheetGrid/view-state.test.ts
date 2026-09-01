import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { createSheetGridViewState } from "../../../../../modules/sheet-grid/view-state";
import { mountSheetGrid } from "./fixture";

describe("SheetGrid view state", () => {
  test("restores a sheet's selection and scroll position when its identity changes", async () => {
    const viewState = createSheetGridViewState({
      selection: {
        active: { row: 8, column: 4 },
        anchor: { row: 7, column: 3 },
        focus: { row: 8, column: 4 },
        mode: "cells",
      },
      scrollPosition: { x: 288, y: 168 },
      gridExtent: { rowCount: 100, columnCount: 50 },
    });
    const { session, wrapper } = mountSheetGrid();
    const firstSheet = session.workbook.sheets.values().next().value;
    if (!firstSheet) {
      throw new Error("Expected the fixture workbook to have a sheet.");
    }
    const secondSheet = {
      ...firstSheet,
      id: "sheet-2",
      name: "Sheet2",
      cells: new Map(),
      rowHeights: new Map(),
      columnWidths: new Map(),
    };

    await wrapper.setProps({ sheet: secondSheet, viewState });
    await nextTick();

    const scroller = wrapper.get(".sheet-grid__scroller").element as HTMLDivElement;
    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("E9");
    expect(scroller.scrollLeft).toBe(288);
    expect(scroller.scrollTop).toBe(168);
  });
});
