import { effectScope, reactive } from "vue";
import { describe, expect, test } from "vitest";
import { createSheet, getDefaultRowHeight, MAX_SHEET_ROWS } from "@sheetcraft/core/workbook";
import { createCellSelection } from "@sheetcraft/sheet-engine/selection";
import { useSheetViewport } from "../../../../../modules/sheet-grid/composables/useSheetViewport";

function fixture(withDefaultCallback = true) {
  const scope = effectScope();
  const sheet = reactive(createSheet("Viewport", "sheet"));
  const selection = createCellSelection({ row: 0, column: 0 });
  const view = scope.run(() =>
    useSheetViewport({
      initialExtent: { rowCount: 100, columnCount: 10 },
      getGridExtentPolicy: () => ({
        growth: { rowCount: 10, columnCount: 5 },
        tail: { rowCount: 0, columnCount: 0 },
      }),
      getColumnWidths: () => sheet.columnWidths,
      getDefaultRowHeight: withDefaultCallback ? () => getDefaultRowHeight(sheet) : undefined,
      getRowHeights: () => sheet.rowHeights,
      getHiddenRows: () => sheet.hiddenRows,
      getContentExtent: () => ({ rowCount: 1, columnCount: 1 }),
      getFreezePanes: () => sheet.freezePanes,
      getMergedCells: () => sheet.mergedCells,
      getHiddenRowIntervals: () => [],
      getSelection: () => selection,
      onScrollStart: () => {},
      onViewStateChange: () => {},
    }),
  )!;
  return { scope, sheet, view };
}

describe("viewport sheet-owned default row height", () => {
  test("uses default20 for geometry, hits, sparse full-sheet navigation and virtualization", () => {
    const { scope, sheet, view } = fixture();
    try {
      sheet.defaultRowHeight = 20;
      sheet.rowHeights.set(1, 24);
      sheet.rowHeights.set(3, 24);
      sheet.hiddenRows = new Set([2, 3]);
      view.viewportSize.height = 100;
      expect(view.baseGeometry.value.rowHeight).toBe(20);
      expect(view.baseGeometry.value.getCellRect({ row: 4, column: 0 })).toMatchObject({
        y: 44,
        height: 20,
      });
      expect(view.baseGeometry.value.getCellAtPoint({ x: 1, y: 44 })).toEqual({
        row: 4,
        column: 0,
      });
      expect(view.layout.value.getCellAtViewportPoint({ x: 1, y: 43 })).toEqual({
        row: 1,
        column: 0,
      });
      expect(view.layout.value.getCellAtViewportPoint({ x: 1, y: 44 })).toEqual({
        row: 4,
        column: 0,
      });
      expect(view.navigationRows.value.getBoundaryOffset(MAX_SHEET_ROWS)).toBe(
        MAX_SHEET_ROWS * 20 - 36,
      );
      expect(view.baseRows.value.getTotalHeight()).toBe(1964);
      expect(view.layout.value.panes.body.rows.map((row) => row.index)).not.toContain(2);
      expect(view.layout.value.panes.body.rows.map((row) => row.index)).not.toContain(3);
      expect(view.layout.value.panes.body.rows.length).toBeLessThan(12);
      expect([...sheet.rowHeights]).toEqual([
        [1, 24],
        [3, 24],
      ]);
      expect(sheet.cells.size).toBe(0);
    } finally {
      scope.stop();
    }
  });

  test("keeps default20 frozen rows and body-scroll hits on the same physical grid", () => {
    const { scope, sheet, view } = fixture();
    try {
      sheet.defaultRowHeight = 20;
      sheet.rowHeights.set(1, 24);
      sheet.rowHeights.set(3, 24);
      sheet.hiddenRows = new Set([2, 3]);
      sheet.freezePanes = { rows: 2, columns: 0 };
      view.viewportSize.height = 100;
      view.scrollPosition.y = 200;
      expect(view.layout.value.frozenSize.height).toBe(44);
      expect(view.layout.value.getCellViewportRect({ row: 1, column: 0 })).toMatchObject({
        y: 20,
        height: 24,
      });
      expect(view.layout.value.getCellViewportRect({ row: 14, column: 0 })).toMatchObject({
        y: 44,
        height: 20,
      });
      expect(view.layout.value.getCellAtViewportPoint({ x: 1, y: 43 })).toEqual({
        row: 1,
        column: 0,
      });
      expect(view.layout.value.getCellAtViewportPoint({ x: 1, y: 44 })).toEqual({
        row: 14,
        column: 0,
      });
      expect(view.layout.value.panes.body.rows.map((row) => row.index)).toContain(14);
      expect(view.layout.value.panes.body.rows.length).toBeLessThan(12);
    } finally {
      scope.stop();
    }
  });

  test("invalidates both metric views when the sheet baseline changes", () => {
    const { scope, sheet, view } = fixture();
    try {
      const geometry = view.baseGeometry.value;
      const navigation = view.navigationRows.value;
      sheet.defaultRowHeight = 20;
      expect(view.baseGeometry.value).not.toBe(geometry);
      expect(view.navigationRows.value).not.toBe(navigation);
      expect(view.layout.value.getCellAtViewportPoint({ x: 1, y: 21 })).toEqual({
        row: 1,
        column: 0,
      });
      sheet.defaultRowHeight = 24;
      expect(view.baseGeometry.value.rowHeight).toBe(24);
      expect(view.baseRows.value.getBoundaryOffset(1)).toBe(24);
      expect(view.layout.value.getCellAtViewportPoint({ x: 1, y: 21 })).toEqual({
        row: 0,
        column: 0,
      });
      expect(sheet.rowHeights.size).toBe(0);
    } finally {
      scope.stop();
    }
  });

  test("preserves the optional-callback fallback of 24", () => {
    const { scope, view } = fixture(false);
    try {
      expect(view.baseGeometry.value.rowHeight).toBe(24);
      expect(view.baseRows.value.getBoundaryOffset(1)).toBe(24);
      expect(view.navigationRows.value.getBoundaryOffset(MAX_SHEET_ROWS)).toBe(MAX_SHEET_ROWS * 24);
    } finally {
      scope.stop();
    }
  });
});
