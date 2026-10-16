import { describe, expect, test } from "vitest";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core";
import { MAX_SHEET_ROWS, createSheet, getDefaultRowHeight } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "../../geometry.js";
import { createRowVisibilityIndex } from "../../visibility.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";
import { createPictureViewMetrics } from "../../picture-frame-layout.js";
import { createSheetPagination } from "../../page-layout.js";

function fixture(rowCount = 8) {
  const sheet = createSheet("Imported", "s");
  sheet.defaultRowHeight = 20;
  sheet.rowHeights = new Map([
    [1, 24],
    [3, 24],
  ]);
  sheet.hiddenRows = new Set([2, 3]);
  const geometry = createSheetGeometry({
    rowCount,
    columnCount: 2,
    rowHeight: getDefaultRowHeight(sheet),
    rowHeights: sheet.rowHeights,
    hiddenRows: sheet.hiddenRows,
  });
  const rows = createRowVisibilityIndex({
    rowCount,
    defaultRowHeight: getDefaultRowHeight(sheet),
    rowHeights: sheet.rowHeights,
    hiddenRows: sheet.hiddenRows,
  });
  return { sheet, geometry, rows };
}

describe("physical sheet-owned row geometry", () => {
  test("shares 20-pixel defaults, explicit 24 and hidden boundaries across hit tests and virtualization", () => {
    const { sheet, geometry, rows } = fixture();
    expect(geometry.getCellRect({ row: 0, column: 0 })).toMatchObject({ y: 0, height: 20 });
    expect(geometry.getCellRect({ row: 1, column: 0 })).toMatchObject({ y: 20, height: 24 });
    expect(geometry.getCellRect({ row: 4, column: 0 })).toMatchObject({ y: 44, height: 20 });
    expect(geometry.getCellAtPoint({ x: 1, y: 43 })).toEqual({ row: 1, column: 0 });
    expect(geometry.getCellAtPoint({ x: 1, y: 44 })).toEqual({ row: 4, column: 0 });
    expect(geometry.getVisibleRange({ x: 0, y: 44 }, { width: 96, height: 40 }, 0)).toMatchObject({
      startRow: 4,
      endRow: 5,
    });
    expect(rows.getVisibleRowsInViewport(44, 40, 0).map((row) => row.logicalRow)).toEqual([4, 5]);
    expect(rows.getTotalHeight()).toBe(124);
    expect(geometry.getTotalSize().height).toBe(124);
    const metrics = createPictureViewMetrics(sheet, geometry, rows);
    expect(metrics.rows.nominalSize(0)).toBe(20);
    expect(metrics.rows.nominalSize(1)).toBe(24);
    expect(metrics.rows.nominalSize(2)).toBe(20);
    expect(metrics.rows.nominalSize(3)).toBe(24);
    expect(metrics.rows.visibleSize(2)).toBe(0);
    expect(metrics.rows.visibleSize(3)).toBe(0);
    expect(metrics.rows.visiblePrefix(8)).toBe(124);
    expect(metrics.rows.visiblePrefix(9)).toBe(144);
    expect(sheet.rowHeights).toEqual(
      new Map([
        [1, 24],
        [3, 24],
      ]),
    );
  });

  test("uses identical row boundaries for frozen panes, scrolling and pagination", () => {
    const { geometry, rows } = fixture();
    const layout = createSheetViewportLayout({
      geometry,
      rows,
      freeze: { rows: 4 },
      viewportSize: { width: 192, height: 84 },
    });
    expect(layout.frozenSize.height).toBe(44);
    expect(layout.getCellRect({ row: 2, column: 0 })).toBeNull();
    expect(layout.getCellViewportRect({ row: 4, column: 0 })).toMatchObject({ y: 44, height: 20 });
    expect(layout.getCellAtViewportPoint({ x: 1, y: 44 })).toEqual({ row: 4, column: 0 });
    expect(layout.getScrollPositionForAddress({ row: 7, column: 0 }).y).toBe(40);
    const pagination = createSheetPagination({
      geometry,
      rows,
      setup: { ...DEFAULT_SHEET_PAGE_SETUP, rowBreaks: [4] },
      printRange: { start: { row: 0, column: 0 }, end: { row: 7, column: 1 } },
    });
    expect(pagination.rowBreaks).toContainEqual({ index: 4, offset: 44, kind: "manual" });
    expect(pagination.getPage(0, 0)?.sheetRect.height).toBe(44);
    expect(pagination.getPage(1, 0)?.sheetRect).toMatchObject({ y: 44, height: 80 });
  });

  test("keeps mismatch guards meaningful for an imported 20-pixel sheet", () => {
    const { sheet, geometry, rows } = fixture();
    expect(() => createPictureViewMetrics(sheet, geometry, rows)).not.toThrow();
    expect(() =>
      createPictureViewMetrics(sheet, createSheetGeometry({ rowCount: 8, columnCount: 2 }), rows),
    ).toThrow(/unscaled/);
    expect(() =>
      createPictureViewMetrics(
        sheet,
        geometry,
        createRowVisibilityIndex({
          rowCount: 8,
          defaultRowHeight: 24,
          rowHeights: sheet.rowHeights,
          hiddenRows: sheet.hiddenRows,
        }),
      ),
    ).toThrow(/default height/);
  });

  test("represents the maximum row endpoint sparsely with the same physical prefix", () => {
    const { sheet, geometry, rows } = fixture(MAX_SHEET_ROWS);
    const expected = MAX_SHEET_ROWS * 20 - 36;
    expect(geometry.getTotalSize().height).toBe(expected);
    expect(rows.getTotalHeight()).toBe(expected);
    expect(createPictureViewMetrics(sheet, geometry, rows).rows.visiblePrefix(MAX_SHEET_ROWS)).toBe(
      expected,
    );
    expect(geometry.getCellAtPoint({ x: 1, y: expected - 1 })).toEqual({
      row: MAX_SHEET_ROWS - 1,
      column: 0,
    });
    expect(sheet.rowHeights.size).toBe(2);
  });
});
