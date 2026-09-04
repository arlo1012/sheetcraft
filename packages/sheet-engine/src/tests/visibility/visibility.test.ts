import { describe, expect, test } from "vitest";
import { createRowVisibilityIndex } from "../../visibility.js";

describe("row visibility index", () => {
  test("maps visible rows, indexes, and offsets across normalized hidden intervals", () => {
    const index = createRowVisibilityIndex({
      rowCount: 10,
      defaultRowHeight: 20,
      rowHeights: new Map([
        [1, 50],
        [5, 35],
        [6, 10],
        [12, 40],
      ]),
      hiddenRows: [1, 12],
      hiddenIntervals: [
        { start: 4, end: 3 },
        { start: 7, end: 99 },
      ],
    });

    expect(index.rowCount).toBe(10);
    expect(index.visibleRowCount).toBe(4);
    expect(index.getTotalHeight()).toBe(85);
    expect(index.getVisibleRow(0)).toEqual({
      logicalRow: 0,
      visibleIndex: 0,
      offset: 0,
      height: 20,
    });
    expect(index.getVisibleRow(2)).toEqual({
      logicalRow: 2,
      visibleIndex: 1,
      offset: 20,
      height: 20,
    });
    expect(index.getVisibleRow(5)).toEqual({
      logicalRow: 5,
      visibleIndex: 2,
      offset: 40,
      height: 35,
    });
    expect(index.getVisibleRow(6)).toEqual({
      logicalRow: 6,
      visibleIndex: 3,
      offset: 75,
      height: 10,
    });

    expect(index.isRowVisible(1)).toBe(false);
    expect(index.getVisibleIndex(1)).toBeNull();
    expect(index.getVisibleIndex(6)).toBe(3);
    expect(index.getLogicalRow(0)).toBe(0);
    expect(index.getLogicalRow(3)).toBe(6);
    expect(index.getLogicalRow(4)).toBeNull();
    expect(index.getRowOffset(5)).toBe(40);
    expect(index.getVisibleOffset(3)).toBe(75);
    expect(index.getRowOffset(7)).toBeNull();
    expect(index.getBoundaryOffset(0)).toBe(0);
    expect(index.getBoundaryOffset(1)).toBe(20);
    expect(index.getBoundaryOffset(2)).toBe(20);
    expect(index.getBoundaryOffset(5)).toBe(40);
    expect(index.getBoundaryOffset(7)).toBe(85);
    expect(index.getBoundaryOffset(10)).toBe(85);
  });

  test("uses custom row-height boundaries for offset hit testing", () => {
    const index = createRowVisibilityIndex({
      rowCount: 7,
      defaultRowHeight: 20,
      rowHeights: new Map([
        [2, 35],
        [4, 10],
      ]),
      hiddenRows: [1, 3, 5],
    });

    expect(index.getTotalHeight()).toBe(85);
    expect(index.getLogicalRowAtOffset(-1)).toBeNull();
    expect(index.getLogicalRowAtOffset(0)).toBe(0);
    expect(index.getLogicalRowAtOffset(19)).toBe(0);
    expect(index.getLogicalRowAtOffset(20)).toBe(2);
    expect(index.getLogicalRowAtOffset(54)).toBe(2);
    expect(index.getLogicalRowAtOffset(55)).toBe(4);
    expect(index.getLogicalRowAtOffset(64)).toBe(4);
    expect(index.getLogicalRowAtOffset(65)).toBe(6);
    expect(index.getLogicalRowAtOffset(84)).toBe(6);
    expect(index.getLogicalRowAtOffset(85)).toBeNull();
    expect(index.getLogicalRowAtOffset(Number.NaN)).toBeNull();
  });

  test("ignores height overrides for hidden rows", () => {
    const index = createRowVisibilityIndex({
      rowCount: 5,
      defaultRowHeight: 20,
      rowHeights: new Map([
        [1, 200],
        [2, 35],
        [3, 1],
      ]),
      hiddenIntervals: [{ start: 1, end: 3 }],
    });

    expect(index.getTotalHeight()).toBe(40);
    expect(index.getVisibleRow(0)).toMatchObject({ offset: 0, height: 20 });
    expect(index.getVisibleRow(4)).toMatchObject({ offset: 20, height: 20 });
  });

  test("navigates over hidden rows from both visible and hidden logical positions", () => {
    const index = createRowVisibilityIndex({
      rowCount: 10,
      defaultRowHeight: 20,
      hiddenRows: [1],
      hiddenIntervals: [
        { start: 3, end: 4 },
        { start: 7, end: 9 },
      ],
    });

    expect(index.getNextVisibleRow(0)).toBe(2);
    expect(index.getNextVisibleRow(1)).toBe(2);
    expect(index.getNextVisibleRow(2)).toBe(5);
    expect(index.getNextVisibleRow(4)).toBe(5);
    expect(index.getNextVisibleRow(6)).toBeNull();
    expect(index.getNextVisibleRow(9)).toBeNull();
    expect(index.getPreviousVisibleRow(0)).toBeNull();
    expect(index.getPreviousVisibleRow(1)).toBe(0);
    expect(index.getPreviousVisibleRow(2)).toBe(0);
    expect(index.getPreviousVisibleRow(5)).toBe(2);
    expect(index.getPreviousVisibleRow(4)).toBe(2);
    expect(index.getPreviousVisibleRow(7)).toBe(6);
  });

  test("returns visible viewport rows with overscan and supports detached calls", () => {
    const index = createRowVisibilityIndex({
      rowCount: 8,
      defaultRowHeight: 20,
      rowHeights: new Map([[4, 30]]),
      hiddenIntervals: [{ start: 1, end: 2 }],
    });
    const { getVisibleRowsInViewport } = index;

    expect(getVisibleRowsInViewport(15, 50)).toEqual([
      { logicalRow: 0, visibleIndex: 0, offset: 0, height: 20 },
      { logicalRow: 3, visibleIndex: 1, offset: 20, height: 20 },
      { logicalRow: 4, visibleIndex: 2, offset: 40, height: 30 },
    ]);
    expect(getVisibleRowsInViewport(15, 50, 1).map((row) => row.logicalRow)).toEqual([0, 3, 4, 5]);
    expect(getVisibleRowsInViewport(110, 10).map((row) => row.logicalRow)).toEqual([7]);
    expect(getVisibleRowsInViewport(130, 1)).toEqual([]);
    expect(getVisibleRowsInViewport(0, 0)).toEqual([]);
  });

  test("includes rows intersecting a fractional viewport and excludes its end boundary", () => {
    const index = createRowVisibilityIndex({ rowCount: 4, defaultRowHeight: 20 });

    expect(index.getVisibleRowsInViewport(0, 20).map((row) => row.logicalRow)).toEqual([0]);
    expect(index.getVisibleRowsInViewport(0, 20.5).map((row) => row.logicalRow)).toEqual([0, 1]);
    expect(index.getVisibleRowsInViewport(19.5, 0.5).map((row) => row.logicalRow)).toEqual([0]);
    expect(index.getVisibleRowsInViewport(20, 20).map((row) => row.logicalRow)).toEqual([1]);
    expect(index.getVisibleRowsInViewport(60, 100).map((row) => row.logicalRow)).toEqual([3]);
    expect(index.getVisibleRowsInViewport(20, 20, Number.NaN).map((row) => row.logicalRow)).toEqual(
      [1],
    );
    expect(
      index.getVisibleRowsInViewport(20, 20, Number.POSITIVE_INFINITY).map((row) => row.logicalRow),
    ).toEqual([1]);
  });

  test("handles empty and fully hidden grids without materializing hidden rows", () => {
    const empty = createRowVisibilityIndex({ rowCount: 0, defaultRowHeight: 20 });
    const hidden = createRowVisibilityIndex({
      rowCount: 1_000_000,
      defaultRowHeight: 20,
      hiddenIntervals: [{ start: 0, end: 1_000_000 }],
    });

    expect(empty.visibleRowCount).toBe(0);
    expect(empty.getTotalHeight()).toBe(0);
    expect(empty.getVisibleRowsInViewport(0, 20)).toEqual([]);
    expect(hidden.visibleRowCount).toBe(0);
    expect(hidden.getTotalHeight()).toBe(0);
    expect(hidden.getVisibleRow(123_456)).toBeNull();
    expect(hidden.getNextVisibleRow(123_456)).toBeNull();
    expect(hidden.getPreviousVisibleRow(123_456)).toBeNull();
  });

  test("scales sparse million-row indexes without materializing every visible row", () => {
    const index = createRowVisibilityIndex({
      rowCount: 1_000_000,
      defaultRowHeight: 20,
      rowHeights: new Map([
        [500_000, 45],
        [750_000, 10],
      ]),
      hiddenIntervals: [
        { start: 100, end: 199 },
        { start: 900_000, end: 999_999 },
      ],
    });

    expect(index.visibleRowCount).toBe(899_900);
    expect(index.getTotalHeight()).toBe(17_998_015);
    expect(index.getVisibleIndex(200)).toBe(100);
    expect(index.getLogicalRow(500_000 - 100)).toBe(500_000);
    expect(index.getVisibleRow(500_000)).toMatchObject({
      visibleIndex: 499_900,
      offset: 9_998_000,
      height: 45,
    });
    expect(index.getLogicalRowAtOffset(9_998_044)).toBe(500_000);
    expect(index.getLogicalRowAtOffset(9_998_045)).toBe(500_001);
    expect(index.getVisibleRowsInViewport(9_998_040, 10, 1).map((row) => row.logicalRow)).toEqual([
      499_999, 500_000, 500_001, 500_002,
    ]);
  });

  test("rejects malformed dimensions and hidden row inputs", () => {
    expect(() => createRowVisibilityIndex({ rowCount: -1, defaultRowHeight: 20 })).toThrow(
      "Row count",
    );
    expect(() => createRowVisibilityIndex({ rowCount: 1, defaultRowHeight: 0 })).toThrow(
      "Default row height",
    );
    expect(() =>
      createRowVisibilityIndex({ rowCount: 1, defaultRowHeight: 20, hiddenRows: [-1] }),
    ).toThrow("Hidden row");
    expect(() =>
      createRowVisibilityIndex({
        rowCount: 1,
        defaultRowHeight: 20,
        hiddenIntervals: [{ start: 0.5, end: 1 }],
      }),
    ).toThrow("Hidden interval start");
    expect(() =>
      createRowVisibilityIndex({
        rowCount: 1,
        defaultRowHeight: 20,
        rowHeights: new Map([[0, 0]]),
      }),
    ).toThrow("Row height");
    expect(() =>
      createRowVisibilityIndex({
        rowCount: Number.MAX_SAFE_INTEGER,
        defaultRowHeight: 2,
      }),
    ).toThrow("Total row height");
  });

  test("returns null or an empty viewport for invalid query values", () => {
    const index = createRowVisibilityIndex({ rowCount: 3, defaultRowHeight: 20 });

    expect(index.isRowVisible(Number.NaN)).toBe(false);
    expect(index.getVisibleIndex(-1)).toBeNull();
    expect(index.getLogicalRow(3)).toBeNull();
    expect(index.getLogicalRow(0.5)).toBeNull();
    expect(index.getBoundaryOffset(-1)).toBeNull();
    expect(index.getBoundaryOffset(3.5)).toBeNull();
    expect(index.getBoundaryOffset(4)).toBeNull();
    expect(index.getLogicalRowAtOffset(Number.POSITIVE_INFINITY)).toBeNull();
    expect(index.getNextVisibleRow(-1)).toBeNull();
    expect(index.getPreviousVisibleRow(3)).toBeNull();
    expect(index.getVisibleRowsInViewport(Number.NaN, 20)).toEqual([]);
    expect(index.getVisibleRowsInViewport(0, Number.POSITIVE_INFINITY)).toEqual([]);
    expect(index.getVisibleRowsInViewport(0, -1)).toEqual([]);
    expect(index.getVisibleRowsInViewport(20, 20, -1).map((row) => row.logicalRow)).toEqual([1]);
  });
});
