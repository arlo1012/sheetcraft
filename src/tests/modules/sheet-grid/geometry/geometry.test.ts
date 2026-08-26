import { describe, expect, test } from "vitest";
import {
  columnIndexToLabel,
  createSheetGeometry,
  getCellAddressLabel,
} from "../../../../modules/sheet-grid/geometry";

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

  test("keeps rendered cell coordinates local at deep logical rows", () => {
    const deepGeometry = createSheetGeometry({ rowCount: 700_000, columnCount: 50 });
    const scrollPosition = { x: 0, y: 699_049 * deepGeometry.rowHeight };

    expect(deepGeometry.getCellViewportRect({ row: 699_049, column: 0 }, scrollPosition).y).toBe(0);
    expect(deepGeometry.getCellViewportRect({ row: 699_050, column: 0 }, scrollPosition).y).toBe(
      24,
    );
    expect(deepGeometry.getCellViewportRect({ row: 699_051, column: 0 }, scrollPosition).y).toBe(
      48,
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

  test("formats spreadsheet column and cell labels", () => {
    expect(columnIndexToLabel(0)).toBe("A");
    expect(columnIndexToLabel(25)).toBe("Z");
    expect(columnIndexToLabel(26)).toBe("AA");
    expect(columnIndexToLabel(16_383)).toBe("XFD");
    expect(getCellAddressLabel({ row: 8, column: 27 })).toBe("AB9");
  });
});
