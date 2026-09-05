import { describe, expect, test } from "vitest";
import {
  getFloatingImageSheetRect,
  getFloatingImageViewportFragments,
  moveFloatingImageBy,
} from "../../floating-image-layout.js";
import { createSheetGeometry } from "../../geometry.js";
import { createRowVisibilityIndex } from "../../visibility.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";

function createLayout(options?: {
  hiddenIntervals?: Array<{ start: number; end: number }>;
  freeze?: { rows: number; columns: number };
  bodyScrollPosition?: { x: number; y: number };
}) {
  return createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount: 8, columnCount: 8, rowHeight: 20, columnWidth: 80 }),
    rows: createRowVisibilityIndex({
      rowCount: 8,
      defaultRowHeight: 20,
      hiddenIntervals: options?.hiddenIntervals,
    }),
    freeze: options?.freeze,
    bodyScrollPosition: options?.bodyScrollPosition,
    viewportSize: { width: 240, height: 80 },
  });
}

describe("floating image layout", () => {
  test("uses the anchor cell's continuous sheet position plus the image offset", () => {
    const rect = getFloatingImageSheetRect(
      { anchor: { row: 2, column: 1 }, offsetX: 11, offsetY: 7, width: 130, height: 70 },
      createLayout(),
    );
    expect(rect).toEqual({ x: 91, y: 47, width: 130, height: 70 });
  });

  test("clips a spanning image independently in all frozen panes", () => {
    const fragments = getFloatingImageViewportFragments(
      { anchor: { row: 0, column: 0 }, offsetX: 40, offsetY: 10, width: 180, height: 70 },
      createLayout({ freeze: { rows: 1, columns: 1 } }),
    );
    expect(fragments).toEqual([
      {
        paneId: "topLeft",
        rect: { x: 40, y: 10, width: 180, height: 70 },
        clippedRect: { x: 40, y: 10, width: 40, height: 10 },
      },
      {
        paneId: "top",
        rect: { x: 40, y: 10, width: 180, height: 70 },
        clippedRect: { x: 80, y: 10, width: 140, height: 10 },
      },
      {
        paneId: "left",
        rect: { x: 40, y: 10, width: 180, height: 70 },
        clippedRect: { x: 40, y: 20, width: 40, height: 60 },
      },
      {
        paneId: "body",
        rect: { x: 40, y: 10, width: 180, height: 70 },
        clippedRect: { x: 80, y: 20, width: 140, height: 60 },
      },
    ]);
  });

  test("applies body scrolling only to non-frozen pane fragments", () => {
    const fragments = getFloatingImageViewportFragments(
      { anchor: { row: 1, column: 1 }, offsetX: 0, offsetY: 0, width: 100, height: 40 },
      createLayout({ freeze: { rows: 1, columns: 1 }, bodyScrollPosition: { x: 40, y: 20 } }),
    );
    expect(fragments).toEqual([
      {
        paneId: "body",
        rect: { x: 40, y: 0, width: 100, height: 40 },
        clippedRect: { x: 80, y: 20, width: 60, height: 20 },
      },
    ]);
  });

  test("does not render an image whose anchor row is hidden", () => {
    const layout = createLayout({ hiddenIntervals: [{ start: 2, end: 2 }] });
    const image = { anchor: { row: 2, column: 0 }, offsetX: 0, offsetY: 0, width: 80, height: 40 };
    expect(getFloatingImageSheetRect(image, layout)).toBeNull();
    expect(getFloatingImageViewportFragments(image, layout)).toEqual([]);
  });

  test("rebases a moved image to a cell anchor with non-negative offsets", () => {
    const layout = createLayout();
    const moved = moveFloatingImageBy(
      { anchor: { row: 1, column: 1 }, offsetX: 4, offsetY: 6, width: 120, height: 60 },
      { x: 100, y: -40 },
      layout,
    );
    expect(moved).toEqual({
      anchor: { row: 0, column: 2 },
      offsetX: 24,
      offsetY: 0,
      width: 120,
      height: 60,
    });
  });
});
