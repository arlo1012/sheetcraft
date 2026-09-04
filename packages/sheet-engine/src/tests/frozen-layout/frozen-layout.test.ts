import { describe, expect, test } from "vitest";
import { createFrozenPaneLayout } from "../../frozen-layout.js";
import { createSheetGeometry } from "../../geometry.js";

function createGeometry() {
  return createSheetGeometry({
    rowCount: 6,
    columnCount: 5,
    rowHeight: 20,
    columnWidth: 80,
  });
}

describe("frozen pane layout", () => {
  test("uses the body pane alone when no rows or columns are frozen", () => {
    const layout = createFrozenPaneLayout({
      geometry: createGeometry(),
      viewportSize: { width: 320, height: 120 },
    });

    expect(layout.panes.topLeft).toEqual({
      id: "topLeft",
      clip: { x: 0, y: 0, width: 0, height: 0 },
      visibleRange: null,
    });
    expect(layout.panes.body).toEqual({
      id: "body",
      clip: { x: 0, y: 0, width: 320, height: 120 },
      visibleRange: { startRow: 0, endRow: 5, startColumn: 0, endColumn: 3 },
    });
    expect(layout.getPaneForAddress({ row: 2, column: 3 })).toBe("body");
    expect(layout.getCellViewportRect({ row: 2, column: 3 })).toEqual({
      x: 240,
      y: 40,
      width: 80,
      height: 20,
    });
    expect(layout.getCellAtViewportPoint({ x: 319, y: 119 })).toEqual({ row: 5, column: 3 });
    expect(layout.getCellAtViewportPoint({ x: 320, y: 0 })).toBeNull();
    expect(layout.getCellAtViewportPoint({ x: Number.NaN, y: 0 })).toBeNull();
  });

  test("partitions the viewport at the first frozen row and column", () => {
    const layout = createFrozenPaneLayout({
      geometry: createGeometry(),
      freeze: { rows: 1, columns: 1 },
      viewportSize: { width: 320, height: 120 },
    });

    expect(layout.panes).toEqual({
      topLeft: {
        id: "topLeft",
        clip: { x: 0, y: 0, width: 80, height: 20 },
        visibleRange: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
      },
      top: {
        id: "top",
        clip: { x: 80, y: 0, width: 240, height: 20 },
        visibleRange: { startRow: 0, endRow: 0, startColumn: 1, endColumn: 3 },
      },
      left: {
        id: "left",
        clip: { x: 0, y: 20, width: 80, height: 100 },
        visibleRange: { startRow: 1, endRow: 5, startColumn: 0, endColumn: 0 },
      },
      body: {
        id: "body",
        clip: { x: 80, y: 20, width: 240, height: 100 },
        visibleRange: { startRow: 1, endRow: 5, startColumn: 1, endColumn: 3 },
      },
    });
    expect(layout.getCellAtViewportPoint({ x: 79, y: 19 })).toEqual({ row: 0, column: 0 });
    expect(layout.getCellAtViewportPoint({ x: 80, y: 19 })).toEqual({ row: 0, column: 1 });
    expect(layout.getCellAtViewportPoint({ x: 79, y: 20 })).toEqual({ row: 1, column: 0 });
    expect(layout.getCellAtViewportPoint({ x: 80, y: 20 })).toEqual({ row: 1, column: 1 });
  });

  test("uses both frozen axes with body-relative scrolling and custom dimensions", () => {
    const geometry = createSheetGeometry({
      rowCount: 10,
      columnCount: 6,
      rowHeight: 20,
      columnWidth: 80,
      rowHeights: new Map([[1, 30]]),
      columnWidths: new Map([[1, 100]]),
    });
    const layout = createFrozenPaneLayout({
      geometry,
      freeze: { rows: 2, columns: 2 },
      bodyScrollPosition: { x: 50, y: 10 },
      viewportSize: { width: 400, height: 160 },
    });

    expect(layout.frozenSize).toEqual({ width: 180, height: 50 });
    expect(layout.panes.top.visibleRange).toEqual({
      startRow: 0,
      endRow: 1,
      startColumn: 2,
      endColumn: 5,
    });
    expect(layout.panes.left.visibleRange).toEqual({
      startRow: 2,
      endRow: 7,
      startColumn: 0,
      endColumn: 1,
    });
    expect(layout.panes.body.visibleRange).toEqual({
      startRow: 2,
      endRow: 7,
      startColumn: 2,
      endColumn: 5,
    });
    expect(layout.getCellViewportRect({ row: 2, column: 2 })).toEqual({
      x: 130,
      y: 40,
      width: 80,
      height: 20,
    });
    expect(layout.getCellAtViewportPoint({ x: 180, y: 50 })).toEqual({ row: 2, column: 2 });
  });

  test("clamps body scrolling at the non-frozen content bounds", () => {
    const layout = createFrozenPaneLayout({
      geometry: createGeometry(),
      freeze: { rows: 1, columns: 1 },
      bodyScrollPosition: { x: 999, y: 999 },
      viewportSize: { width: 240, height: 80 },
    });

    expect(layout.bodyScrollPosition).toEqual({ x: 160, y: 40 });
    expect(layout.panes.body.visibleRange).toEqual({
      startRow: 3,
      endRow: 5,
      startColumn: 3,
      endColumn: 4,
    });
    expect(layout.getCellAtViewportPoint({ x: 80, y: 20 })).toEqual({ row: 3, column: 3 });
  });

  test("keeps all cells in the frozen pane when the freeze reaches both edges", () => {
    const geometry = createSheetGeometry({
      rowCount: 2,
      columnCount: 2,
      rowHeight: 20,
      columnWidth: 80,
    });
    const layout = createFrozenPaneLayout({
      geometry,
      freeze: { rows: 2, columns: 2 },
      bodyScrollPosition: { x: 20, y: 20 },
      viewportSize: { width: 160, height: 40 },
    });

    expect(layout.bodyScrollPosition).toEqual({ x: 0, y: 0 });
    expect(layout.panes.topLeft.visibleRange).toEqual({
      startRow: 0,
      endRow: 1,
      startColumn: 0,
      endColumn: 1,
    });
    expect(layout.panes.top.visibleRange).toBeNull();
    expect(layout.panes.left.visibleRange).toBeNull();
    expect(layout.panes.body.visibleRange).toBeNull();
    expect(layout.getCellAtViewportPoint({ x: 159, y: 39 })).toEqual({ row: 1, column: 1 });
  });

  test("clips oversized frozen regions without exposing or overlapping body panes", () => {
    const layout = createFrozenPaneLayout({
      geometry: createSheetGeometry({
        rowCount: 5,
        columnCount: 5,
        rowHeight: 20,
        columnWidth: 80,
      }),
      freeze: { rows: 3, columns: 3 },
      bodyScrollPosition: { x: 999, y: 999 },
      viewportSize: { width: 160, height: 40 },
    });

    expect(layout.frozenSize).toEqual({ width: 240, height: 60 });
    expect(layout.bodyScrollPosition).toEqual({ x: 160, y: 40 });
    expect(layout.panes).toEqual({
      topLeft: {
        id: "topLeft",
        clip: { x: 0, y: 0, width: 160, height: 40 },
        visibleRange: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 },
      },
      top: {
        id: "top",
        clip: { x: 160, y: 0, width: 0, height: 40 },
        visibleRange: null,
      },
      left: {
        id: "left",
        clip: { x: 0, y: 40, width: 160, height: 0 },
        visibleRange: null,
      },
      body: {
        id: "body",
        clip: { x: 160, y: 40, width: 0, height: 0 },
        visibleRange: null,
      },
    });
    expect(layout.getCellViewportRect({ row: 2, column: 2 })).toEqual({
      x: 160,
      y: 40,
      width: 80,
      height: 20,
    });
    expect(layout.getCellAtViewportPoint({ x: 159, y: 39 })).toEqual({ row: 1, column: 1 });
  });

  test("does not expose cells from a zero-sized viewport", () => {
    const layout = createFrozenPaneLayout({
      geometry: createGeometry(),
      freeze: { rows: 1, columns: 1 },
      bodyScrollPosition: { x: 160, y: 100 },
      viewportSize: { width: 0, height: 0 },
    });

    expect(layout.bodyScrollPosition).toEqual({ x: 160, y: 100 });
    expect(Object.values(layout.panes).every((pane) => pane.visibleRange === null)).toBe(true);
    expect(layout.getCellAtViewportPoint({ x: 0, y: 0 })).toBeNull();
    expect(layout.getCellAtViewportPoint({ x: -1, y: -1 })).toBeNull();
  });

  test("rejects freeze counts outside the geometry bounds", () => {
    const geometry = createGeometry();

    expect(() =>
      createFrozenPaneLayout({
        geometry,
        freeze: { rows: -1, columns: 0 },
        viewportSize: { width: 100, height: 100 },
      }),
    ).toThrow("Frozen row count");
    expect(() =>
      createFrozenPaneLayout({
        geometry,
        freeze: { rows: 0, columns: 6 },
        viewportSize: { width: 100, height: 100 },
      }),
    ).toThrow("Frozen column count");
  });
});
