import { describe, expect, test } from "vitest";
import { createSheetGeometry } from "../../geometry.js";
import { columnIndexToLabel, getCellAddressLabel } from "@idea10/core/coordinates";

describe("sheet geometry", () => {
  const geometry = createSheetGeometry({
    rowCount: 100,
    columnCount: 50,
    rowHeight: 20,
    columnWidth: 80,
  });

  test("maps cell addresses and points with fixed dimensions", () => {
    expect(geometry.getCellRect({ row: 3, column: 2 })).toEqual({
      x: 160,
      y: 60,
      width: 80,
      height: 20,
    });
    expect(geometry.getCellAtPoint({ x: 159, y: 59 })).toEqual({ row: 2, column: 1 });
    expect(geometry.getCellAtPoint({ x: -1, y: 0 })).toBeNull();
  });

  test("uses sparse row and column overrides for coordinates and hit testing", () => {
    const variableGeometry = createSheetGeometry({
      rowCount: 5,
      columnCount: 5,
      rowHeight: 20,
      columnWidth: 80,
      rowHeights: new Map([
        [1, 30],
        [3, 10],
      ]),
      columnWidths: new Map([
        [1, 100],
        [3, 40],
      ]),
    });

    expect(variableGeometry.getRowOffset(3)).toBe(70);
    expect(variableGeometry.getColumnOffset(3)).toBe(260);
    expect(variableGeometry.getCellRect({ row: 3, column: 3 })).toEqual({
      x: 260,
      y: 70,
      width: 40,
      height: 10,
    });
    expect(variableGeometry.getCellAtPoint({ x: 179, y: 49 })).toEqual({ row: 1, column: 1 });
    expect(variableGeometry.getCellAtPoint({ x: 180, y: 50 })).toEqual({ row: 2, column: 2 });
    expect(variableGeometry.getTotalSize()).toEqual({ width: 380, height: 100 });
  });

  test("ignores valid dimension overrides outside the allocated grid extent", () => {
    const geometryWithFutureDimensions = createSheetGeometry({
      rowCount: 10,
      columnCount: 10,
      rowHeights: new Map([[700_000, 40]]),
      columnWidths: new Map([[16_000, 144]]),
    });

    expect(geometryWithFutureDimensions.getTotalSize()).toEqual({ width: 960, height: 240 });
  });

  test("keeps rendered cell coordinates local at deep logical rows", () => {
    const deepGeometry = createSheetGeometry({
      rowCount: 700_000,
      columnCount: 50,
      rowHeights: new Map([
        [1, 40],
        [699_049, 48],
      ]),
    });
    const scrollPosition = { x: 0, y: deepGeometry.getRowOffset(699_049) };

    expect(deepGeometry.getCellViewportRect({ row: 699_049, column: 0 }, scrollPosition).y).toBe(0);
    expect(deepGeometry.getCellViewportRect({ row: 699_050, column: 0 }, scrollPosition).y).toBe(
      48,
    );
    expect(deepGeometry.getCellViewportRect({ row: 699_051, column: 0 }, scrollPosition).y).toBe(
      72,
    );
  });

  test("computes a clipped visible range with overscan", () => {
    expect(geometry.getVisibleRange({ x: 160, y: 40 }, { width: 160, height: 60 }, 1)).toEqual({
      startRow: 1,
      endRow: 5,
      startColumn: 1,
      endColumn: 4,
    });

    expect(geometry.getVisibleRange({ x: 0, y: 0 }, { width: 80, height: 20 }, 3)).toEqual({
      startRow: 0,
      endRow: 3,
      startColumn: 0,
      endColumn: 3,
    });
  });

  test("returns the minimum scroll adjustment needed to reveal a cell", () => {
    expect(
      geometry.getScrollPositionForCell(
        { row: 8, column: 5 },
        { x: 0, y: 0 },
        { width: 240, height: 100 },
      ),
    ).toEqual({ x: 240, y: 80 });
  });

  test("uses variable dimensions for visible ranges and scroll adjustment", () => {
    const variableGeometry = createSheetGeometry({
      rowCount: 10,
      columnCount: 10,
      rowHeight: 20,
      columnWidth: 80,
      rowHeights: new Map([[2, 40]]),
      columnWidths: new Map([[2, 160]]),
    });

    expect(
      variableGeometry.getVisibleRange({ x: 160, y: 40 }, { width: 160, height: 40 }, 0),
    ).toEqual({
      startRow: 2,
      endRow: 2,
      startColumn: 2,
      endColumn: 2,
    });
    expect(
      variableGeometry.getScrollPositionForCell(
        { row: 3, column: 3 },
        { x: 0, y: 0 },
        { width: 160, height: 40 },
      ),
    ).toEqual({ x: 240, y: 60 });
  });

  test("formats spreadsheet column and cell labels", () => {
    expect(columnIndexToLabel(0)).toBe("A");
    expect(columnIndexToLabel(25)).toBe("Z");
    expect(columnIndexToLabel(26)).toBe("AA");
    expect(columnIndexToLabel(16_383)).toBe("XFD");
    expect(getCellAddressLabel({ row: 8, column: 27 })).toBe("AB9");
  });
});
