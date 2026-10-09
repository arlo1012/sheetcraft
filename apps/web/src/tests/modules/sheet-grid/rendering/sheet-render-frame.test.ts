import { describe, expect, test } from "vitest";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import {
  createSheetRenderFrame,
  getSurfaceCell,
} from "../../../../modules/sheet-grid/rendering/sheet-render-frame";

function createLayout(options?: {
  freeze?: { rows: number; columns: number };
  scroll?: { x: number; y: number };
}) {
  const geometry = createSheetGeometry({
    rowCount: 8,
    columnCount: 8,
    rowHeight: 20,
    columnWidth: 40,
  });
  return createSheetViewportLayout({
    geometry,
    rows: createRowVisibilityIndex({ rowCount: 8, defaultRowHeight: 20, hiddenRows: [2] }),
    freeze: options?.freeze,
    bodyScrollPosition: options?.scroll,
    viewportSize: { width: 120, height: 80 },
    mergeResolver: {
      getRangeAt: ({ row, column }) =>
        row <= 1 && column <= 1
          ? { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }
          : null,
    },
  });
}

describe("sheet render frame", () => {
  test("places headings after outer ruler lanes without changing body hit coordinates", () => {
    const frame = createSheetRenderFrame(
      createLayout(),
      { width: 62, height: 50 },
      1,
      { width: 36, height: 24 },
      { x: 26, y: 26 },
    );
    expect(frame.rowHeaders[1]?.clip).toMatchObject({ x: 26, y: 50, width: 36 });
    expect(frame.columnHeaders[1]?.clip).toMatchObject({ x: 62, y: 26, height: 24 });
    expect(getSurfaceCell(frame, { x: 70, y: 30 })).toBeNull();
    expect(getSurfaceCell(frame, { x: 63, y: 51 })).toEqual({ row: 0, column: 0 });
  });

  test("keeps empty frozen header panes harmless when no panes are frozen", () => {
    const frame = createSheetRenderFrame(createLayout(), { width: 36, height: 24 }, 1);

    expect(frame.size).toEqual({ width: 156, height: 104 });
    expect(frame.body).toEqual({ x: 36, y: 24, width: 120, height: 80 });
    expect(frame.rowHeaders).toHaveLength(2);
    expect(frame.columnHeaders).toHaveLength(2);
    expect(frame.rowHeaders[0]).toMatchObject({
      id: "frozen",
      clip: { x: 0, y: 24, width: 36, height: 0 },
      items: [],
    });
    expect(frame.columnHeaders[0]).toMatchObject({
      id: "frozen",
      clip: { x: 36, y: 0, width: 0, height: 24 },
      items: [],
    });
    expect(frame.rowHeaders[1]?.items.map((item) => item.index)).not.toContain(2);
  });

  test("projects frozen, scrolled and filtered headers into their shared surface coordinates", () => {
    const frame = createSheetRenderFrame(
      createLayout({ freeze: { rows: 1, columns: 1 }, scroll: { x: 40, y: 20 } }),
      { width: 36, height: 24 },
      1,
    );

    expect(frame.rowHeaders[0]?.items[0]).toMatchObject({ index: 0, offset: 24, size: 20 });
    expect(frame.columnHeaders[0]?.items[0]).toMatchObject({ index: 0, offset: 36, size: 40 });
    expect(frame.rowHeaders[1]?.items.map((item) => item.index)).toEqual([3, 4, 5]);
    expect(frame.columnHeaders[1]?.items.map((item) => item.index)).toEqual([2, 3]);
    expect(frame.rowHeaders[1]?.clip.y).toBe(44);
    expect(frame.columnHeaders[1]?.clip.x).toBe(76);
  });

  test("uses surface header insets for hit testing while retaining merged-cell anchors", () => {
    const frame = createSheetRenderFrame(
      createLayout({ freeze: { rows: 1, columns: 1 } }),
      { width: 36, height: 24 },
      1,
    );

    expect(getSurfaceCell(frame, { x: 35, y: 40 })).toBeNull();
    expect(getSurfaceCell(frame, { x: 37, y: 25 })).toEqual({ row: 0, column: 0 });
    expect(getSurfaceCell(frame, { x: 75, y: 43 })).toEqual({ row: 0, column: 0 });
  });
});
