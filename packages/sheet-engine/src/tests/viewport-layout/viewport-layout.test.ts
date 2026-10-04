import { describe, expect, test } from "vitest";
import { createSheetGeometry } from "../../geometry.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";
import { createRowVisibilityIndex, type RowVisibilityIndex } from "../../visibility.js";

function createLayout(options?: {
  rowCount?: number;
  columnCount?: number;
  rowHeights?: ReadonlyMap<number, number>;
  hiddenIntervals?: Array<{ start: number; end: number }>;
  freeze?: { rows: number; columns: number };
  bodyScrollPosition?: { x: number; y: number };
  viewportSize?: { width: number; height: number };
  mergeResolver?: {
    getRangeAt: (address: { row: number; column: number }) => {
      start: { row: number; column: number };
      end: { row: number; column: number };
    } | null;
  };
  overscan?: number;
}) {
  const rowCount = options?.rowCount ?? 6;
  const columnCount = options?.columnCount ?? 5;
  const rowHeights = options?.rowHeights ?? new Map();
  return createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount,
      columnCount,
      rowHeight: 20,
      columnWidth: 80,
      rowHeights,
    }),
    rows: createRowVisibilityIndex({
      rowCount,
      defaultRowHeight: 20,
      rowHeights,
      hiddenIntervals: options?.hiddenIntervals,
    }),
    freeze: options?.freeze,
    bodyScrollPosition: options?.bodyScrollPosition,
    viewportSize: options?.viewportSize ?? { width: 320, height: 120 },
    mergeResolver: options?.mergeResolver,
    overscan: options?.overscan,
  });
}

describe("sheet viewport layout", () => {
  test("matches a continuous, unfrozen viewport without materializing the sheet", () => {
    const layout = createLayout();
    const addresses: string[] = [];

    layout.forEachVisibleCell((address, paneId) => {
      addresses.push(`${paneId}:${address.row}:${address.column}`);
    });

    expect(layout.getTotalSize()).toEqual({ width: 400, height: 120 });
    expect(layout.panes.body.clip).toEqual({ x: 0, y: 0, width: 320, height: 120 });
    expect(layout.panes.body.rows.map((row) => row.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(layout.panes.body.columns.map((column) => column.index)).toEqual([0, 1, 2, 3]);
    expect(addresses).toHaveLength(24);
    expect(layout.getCellViewportRect({ row: 2, column: 3 })).toEqual({
      x: 240,
      y: 40,
      width: 80,
      height: 20,
    });
    expect(layout.getCellAtViewportPoint({ x: 319, y: 119 })).toEqual({ row: 5, column: 3 });
  });

  test("does not freeze a projected row origin when no rows are frozen", () => {
    const geometry = createSheetGeometry({
      rowCount: 6,
      columnCount: 4,
      rowHeight: 20,
      columnWidth: 80,
    });
    const source = createRowVisibilityIndex({ rowCount: 6, defaultRowHeight: 20 });
    const leadingSpace = 24;
    const rows: RowVisibilityIndex = {
      ...source,
      getVisibleRow(row) {
        const visible = source.getVisibleRow(row);
        return visible ? { ...visible, offset: visible.offset + leadingSpace } : null;
      },
      getRowOffset(row) {
        const offset = source.getRowOffset(row);
        return offset === null ? null : offset + leadingSpace;
      },
      getVisibleOffset(index) {
        const offset = source.getVisibleOffset(index);
        return offset === null ? null : offset + leadingSpace;
      },
      getBoundaryOffset(row) {
        const offset = source.getBoundaryOffset(row);
        return offset === null ? null : offset + leadingSpace;
      },
      getLogicalRowAtOffset(offset) {
        return source.getLogicalRowAtOffset(offset - leadingSpace);
      },
      getVisibleRowsInViewport(offset, height, overscan) {
        return source
          .getVisibleRowsInViewport(offset - leadingSpace, height, overscan)
          .map((row) => ({ ...row, offset: row.offset + leadingSpace }));
      },
      getTotalHeight: () => source.getTotalHeight() + leadingSpace,
    };
    const layout = createSheetViewportLayout({
      geometry,
      rows,
      freeze: { rows: 0, columns: 0 },
      bodyScrollPosition: { x: 0, y: 20 },
      viewportSize: { width: 160, height: 100 },
    });
    const atEnd = createSheetViewportLayout({
      geometry,
      rows,
      freeze: { rows: 0, columns: 0 },
      bodyScrollPosition: { x: 0, y: 999 },
      viewportSize: { width: 160, height: 100 },
    });

    expect(layout.frozenSize).toEqual({ width: 0, height: 0 });
    expect(layout.panes.body.clip).toEqual({ x: 0, y: 0, width: 160, height: 100 });
    expect(layout.getCellViewportRect({ row: 0, column: 0 })).toMatchObject({ y: 4 });
    expect(layout.getCellAtViewportPoint({ x: 1, y: 4 })).toEqual({ row: 0, column: 0 });
    expect(atEnd.bodyScrollPosition.y).toBe(44);
    expect(atEnd.getCellViewportRect({ row: 5, column: 0 })).toMatchObject({ y: 80 });
  });

  test("maps discontinuous rows through frozen panes and body-relative scrolling", () => {
    const layout = createLayout({
      rowCount: 8,
      columnCount: 6,
      rowHeights: new Map([[2, 30]]),
      hiddenIntervals: [{ start: 1, end: 1 }],
      freeze: { rows: 3, columns: 2 },
      bodyScrollPosition: { x: 50, y: 20 },
      viewportSize: { width: 320, height: 100 },
    });

    expect(layout.frozenSize).toEqual({ width: 160, height: 50 });
    expect(layout.panes.topLeft.rows.map((row) => row.index)).toEqual([0, 2]);
    expect(layout.panes.body.rows.map((row) => row.index)).toEqual([4, 5, 6]);
    expect(layout.panes.top.columns.map((column) => column.index)).toEqual([2, 3, 4]);
    expect(layout.getCellRect({ row: 1, column: 0 })).toBeNull();
    expect(layout.getCellAtViewportPoint({ x: 159, y: 49 })).toEqual({ row: 2, column: 1 });
    expect(layout.getCellAtViewportPoint({ x: 160, y: 50 })).toEqual({ row: 4, column: 2 });

    const addresses = new Set<string>();
    layout.forEachVisibleCell((address) => {
      addresses.add(`${address.row}:${address.column}`);
    });
    expect(addresses.size).toBe(25);
  });

  test("clamps body scrolling and makes a body cell visible without moving frozen axes", () => {
    const clamped = createLayout({
      rowCount: 10,
      columnCount: 8,
      freeze: { rows: 1, columns: 1 },
      bodyScrollPosition: { x: 999, y: 999 },
      viewportSize: { width: 240, height: 80 },
    });
    const atOrigin = createLayout({
      rowCount: 10,
      columnCount: 8,
      freeze: { rows: 1, columns: 1 },
      viewportSize: { width: 240, height: 80 },
    });

    expect(clamped.bodyScrollPosition).toEqual({ x: 400, y: 120 });
    expect(atOrigin.getScrollPositionForAddress({ row: 5, column: 4 })).toEqual({ x: 160, y: 40 });
    expect(atOrigin.getScrollPositionForAddress({ row: 0, column: 0 })).toEqual({ x: 0, y: 0 });
  });

  test("exposes the one-host native scroll size for oversized and full freezes", () => {
    const oversizedFrozen = createLayout({
      rowCount: 5,
      columnCount: 5,
      freeze: { rows: 3, columns: 3 },
      viewportSize: { width: 160, height: 40 },
    });
    const fullyFrozen = createLayout({
      rowCount: 2,
      columnCount: 2,
      freeze: { rows: 2, columns: 2 },
      viewportSize: { width: 300, height: 100 },
    });

    expect(oversizedFrozen.nativeScrollSize).toEqual({ width: 320, height: 80 });
    expect(fullyFrozen.nativeScrollSize).toEqual({ width: 160, height: 40 });
  });

  test("fragments ranges across all panes and maps merged-cell hits to their anchor", () => {
    const merge = {
      start: { row: 1, column: 1 },
      end: { row: 2, column: 2 },
    };
    const layout = createLayout({
      freeze: { rows: 1, columns: 1 },
      viewportSize: { width: 240, height: 80 },
      mergeResolver: {
        getRangeAt(address) {
          return address.row >= 1 && address.row <= 2 && address.column >= 1 && address.column <= 2
            ? merge
            : null;
        },
      },
    });

    expect(
      layout.getRangeFragments({ start: { row: 0, column: 0 }, end: { row: 2, column: 2 } }),
    ).toEqual([
      { paneId: "topLeft", rect: { x: 0, y: 0, width: 80, height: 20 } },
      { paneId: "top", rect: { x: 80, y: 0, width: 160, height: 20 } },
      { paneId: "left", rect: { x: 0, y: 20, width: 80, height: 40 } },
      { paneId: "body", rect: { x: 80, y: 20, width: 160, height: 40 } },
    ]);
    expect(layout.getAnchorForAddress({ row: 2, column: 2 })).toEqual({ row: 1, column: 1 });
    expect(layout.getCellAtViewportPoint({ x: 200, y: 50 })).toEqual({ row: 1, column: 1 });
  });

  test("provides pane-aware rectangles a presenter can use without recalculating scroll", () => {
    const layout = createLayout({
      rowCount: 8,
      columnCount: 6,
      freeze: { rows: 1, columns: 1 },
      bodyScrollPosition: { x: 40, y: 20 },
      viewportSize: { width: 240, height: 80 },
    });

    const cells = [
      { address: { row: 0, column: 0 }, paneId: "topLeft", rect: { x: 0, y: 0 } },
      { address: { row: 0, column: 2 }, paneId: "top", rect: { x: 120, y: 0 } },
      { address: { row: 2, column: 0 }, paneId: "left", rect: { x: 0, y: 20 } },
      { address: { row: 2, column: 2 }, paneId: "body", rect: { x: 120, y: 20 } },
    ] as const;

    for (const cell of cells) {
      expect(layout.getPaneForAddress(cell.address)).toBe(cell.paneId);
      expect(layout.getCellViewportRect(cell.address)).toMatchObject(cell.rect);
    }
  });

  test("visits an offscreen merge anchor once when only its tail is visible", () => {
    const merge = {
      start: { row: 0, column: 0 },
      end: { row: 2, column: 1 },
    };
    const layout = createLayout({
      rowCount: 6,
      columnCount: 4,
      bodyScrollPosition: { x: 0, y: 40 },
      viewportSize: { width: 160, height: 40 },
      mergeResolver: {
        getRangeAt(address) {
          return address.row <= 2 && address.column <= 1 ? merge : null;
        },
      },
    });
    const calls: string[] = [];

    layout.forEachVisibleCell((address, paneId) => {
      calls.push(`${paneId}:${address.row}:${address.column}`);
    });

    expect(calls).toEqual(["body:0:0", "body:3:0", "body:3:1"]);
    expect(calls.filter((call) => call === "body:0:0")).toHaveLength(1);

    const anchor = { row: 0, column: 0 };
    const range = layout.getMergedRangeAt(anchor);
    expect(range).toEqual(merge);
    expect(layout.getRangePaneRects(range!)).toEqual([
      {
        paneId: "body",
        rect: { x: 0, y: -40, width: 160, height: 60 },
        clippedRect: { x: 0, y: 0, width: 160, height: 20 },
      },
    ]);
  });

  test("normalizes and validates merged ranges supplied by a resolver", () => {
    const reversed = createLayout({
      mergeResolver: {
        getRangeAt: () => ({
          start: { row: 2, column: 2 },
          end: { row: 1, column: 1 },
        }),
      },
    });
    const outOfBounds = createLayout({
      mergeResolver: {
        getRangeAt: () => ({
          start: { row: 0, column: 0 },
          end: { row: 6, column: 0 },
        }),
      },
    });
    const notContaining = createLayout({
      mergeResolver: {
        getRangeAt: () => ({
          start: { row: 0, column: 0 },
          end: { row: 0, column: 0 },
        }),
      },
    });

    expect(reversed.getMergedRangeAt({ row: 2, column: 2 })).toEqual({
      start: { row: 1, column: 1 },
      end: { row: 2, column: 2 },
    });
    expect(reversed.getAnchorForAddress({ row: 2, column: 2 })).toEqual({ row: 1, column: 1 });
    expect(() => outOfBounds.getMergedRangeAt({ row: 0, column: 0 })).toThrow("outside the grid");
    expect(() => notContaining.getMergedRangeAt({ row: 1, column: 1 })).toThrow("contain");
  });

  test("rejects out-of-bounds addresses and ranges across layout APIs", () => {
    const layout = createLayout({ rowCount: 3, columnCount: 3 });
    const invalidAddresses = [
      { row: -1, column: 0 },
      { row: 3, column: 0 },
      { row: 0, column: -1 },
      { row: 0, column: 3 },
    ];

    for (const address of invalidAddresses) {
      expect(() => layout.getCellRect(address)).toThrow("outside the grid");
      expect(() => layout.getCellViewportRect(address)).toThrow("outside the grid");
      expect(() => layout.getPaneForAddress(address)).toThrow("outside the grid");
      expect(() => layout.getMergedRangeAt(address)).toThrow("outside the grid");
      expect(() => layout.getAnchorForAddress(address)).toThrow("outside the grid");
      expect(() => layout.getScrollPositionForAddress(address)).toThrow("outside the grid");
    }
    expect(() =>
      layout.getRangeRect({ start: { row: 0, column: 0 }, end: { row: 3, column: 0 } }),
    ).toThrow("outside the grid");
    expect(() =>
      layout.getRangeFragments({ start: { row: 0, column: -1 }, end: { row: 0, column: 0 } }),
    ).toThrow("outside the grid");
  });

  test("keeps a million-row viewport bounded by visible rows and columns", () => {
    const layout = createLayout({
      rowCount: 1_000_000,
      columnCount: 10,
      hiddenIntervals: [
        { start: 100, end: 199 },
        { start: 900_000, end: 999_999 },
      ],
      freeze: { rows: 1, columns: 1 },
      bodyScrollPosition: { x: 0, y: 9_998_000 },
      viewportSize: { width: 320, height: 120 },
      overscan: 2,
    });
    let count = 0;
    layout.forEachVisibleCell(() => {
      count += 1;
    });

    expect(layout.panes.body.rows).toHaveLength(9);
    expect(layout.panes.body.columns).toHaveLength(5);
    expect(count).toBeLessThan(100);
  });
});
