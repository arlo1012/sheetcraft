import { describe, expect, test } from "vitest";
import { getViewportAxisBoundary, getViewportAxisBoundaryOffset } from "../../axis-interactions.js";
import { createSheetGeometry } from "../../geometry.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";
import { createRowVisibilityIndex } from "../../visibility.js";

function createLayout(options?: {
  rowCount?: number;
  columnCount?: number;
  hiddenIntervals?: Array<{ start: number; end: number }>;
  freeze?: { rows: number; columns: number };
  bodyScrollPosition?: { x: number; y: number };
  viewportSize?: { width: number; height: number };
  overscan?: number;
}) {
  const rowCount = options?.rowCount ?? 8;
  const columnCount = options?.columnCount ?? 6;
  return createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount, columnCount, rowHeight: 20, columnWidth: 80 }),
    rows: createRowVisibilityIndex({
      rowCount,
      defaultRowHeight: 20,
      hiddenIntervals: options?.hiddenIntervals,
    }),
    freeze: options?.freeze,
    bodyScrollPosition: options?.bodyScrollPosition,
    viewportSize: options?.viewportSize ?? { width: 240, height: 80 },
    overscan: options?.overscan,
  });
}

describe("viewport axis interactions", () => {
  test("maps frozen and body row boundaries into one viewport coordinate system", () => {
    const layout = createLayout({
      freeze: { rows: 2, columns: 1 },
      bodyScrollPosition: { x: 40, y: 20 },
      overscan: 2,
    });

    expect(getViewportAxisBoundary(layout, "row", 39)).toEqual({ index: 2, offset: 40 });
    expect(getViewportAxisBoundary(layout, "row", 41)).toEqual({ index: 3, offset: 40 });
    expect(getViewportAxisBoundary(layout, "row", 61)).toEqual({ index: 4, offset: 60 });
    expect(getViewportAxisBoundaryOffset(layout, "row", 0)).toBe(0);
    expect(getViewportAxisBoundaryOffset(layout, "row", 2)).toBe(40);
    expect(getViewportAxisBoundaryOffset(layout, "row", 3)).toBe(40);
    expect(getViewportAxisBoundaryOffset(layout, "row", 4)).toBe(60);
    expect(getViewportAxisBoundaryOffset(layout, "row", 5)).toBe(80);
  });

  test("maps body columns with body-relative scrolling and ignores overscan edges", () => {
    const layout = createLayout({
      freeze: { rows: 1, columns: 1 },
      bodyScrollPosition: { x: 40, y: 0 },
      overscan: 2,
    });

    expect(getViewportAxisBoundary(layout, "column", 80)).toEqual({ index: 2, offset: 120 });
    expect(getViewportAxisBoundary(layout, "column", 121)).toEqual({ index: 2, offset: 120 });
    expect(getViewportAxisBoundaryOffset(layout, "column", 2)).toBe(120);
    expect(getViewportAxisBoundaryOffset(layout, "column", 3)).toBe(200);
  });

  test("skips hidden logical row boundaries while retaining the next visible insertion index", () => {
    const layout = createLayout({ hiddenIntervals: [{ start: 1, end: 1 }] });

    expect(getViewportAxisBoundary(layout, "row", 20)).toEqual({ index: 2, offset: 20 });
    expect(getViewportAxisBoundaryOffset(layout, "row", 1)).toBe(20);
    expect(getViewportAxisBoundaryOffset(layout, "row", 2)).toBe(20);
  });

  test("keeps the final sheet boundary visible at a viewport tail", () => {
    const layout = createLayout({
      rowCount: 3,
      columnCount: 2,
      viewportSize: { width: 320, height: 120 },
    });

    expect(getViewportAxisBoundary(layout, "row", 110)).toEqual({ index: 3, offset: 60 });
    expect(getViewportAxisBoundaryOffset(layout, "row", 3)).toBe(60);
    expect(getViewportAxisBoundary(layout, "column", 310)).toEqual({ index: 2, offset: 160 });
    expect(getViewportAxisBoundaryOffset(layout, "column", 2)).toBe(160);
  });

  test("returns null outside the viewport or when the axis clips are empty", () => {
    const empty = createLayout({ viewportSize: { width: 0, height: 0 } });
    const layout = createLayout();

    expect(getViewportAxisBoundary(empty, "row", 0)).toBeNull();
    expect(getViewportAxisBoundaryOffset(empty, "column", 0)).toBeNull();
    expect(getViewportAxisBoundary(layout, "row", -1)).toBeNull();
    expect(getViewportAxisBoundary(layout, "column", 241)).toBeNull();
  });
});
