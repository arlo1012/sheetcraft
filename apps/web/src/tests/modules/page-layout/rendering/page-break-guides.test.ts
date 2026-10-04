import { describe, expect, test, vi } from "vitest";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import type { SheetPagination } from "@idea10/sheet-engine/page-layout";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { createSheetRenderFrame } from "../../../../modules/sheet-grid/rendering/sheet-render-frame";
import { paintPageBreakGuides } from "../../../../modules/page-layout/rendering/page-break-guides";

function createContext() {
  return {
    getTransform: vi.fn(() => ({ a: 1, d: 1, e: 0, f: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createFrame() {
  const geometry = createSheetGeometry({
    rowCount: 8,
    columnCount: 8,
    rowHeight: 20,
    columnWidth: 40,
  });
  const layout = createSheetViewportLayout({
    geometry,
    rows: createRowVisibilityIndex({ rowCount: 8, defaultRowHeight: 20 }),
    freeze: { rows: 1, columns: 1 },
    bodyScrollPosition: { x: 80, y: 20 },
    viewportSize: { width: 120, height: 80 },
  });
  return createSheetRenderFrame(layout, { width: 36, height: 24 }, 1);
}

describe("page-break guides", () => {
  test("projects automatic and manual breaks into their frozen-pane spans", () => {
    const context = createContext();
    const pagination = {
      rowBreaks: [{ index: 3, offset: 60, kind: "automatic" }],
      columnBreaks: [{ index: 4, offset: 160, kind: "manual" }],
    } satisfies Pick<SheetPagination, "rowBreaks" | "columnBreaks">;

    paintPageBreakGuides(context, createFrame(), pagination);

    expect(context.setLineDash).toHaveBeenNthCalledWith(1, [4, 3]);
    expect(context.setLineDash).toHaveBeenNthCalledWith(2, []);
    expect(context.moveTo).toHaveBeenNthCalledWith(1, 0, 40.5);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 40, 40.5);
    expect(context.moveTo).toHaveBeenNthCalledWith(2, 40, 40.5);
    expect(context.lineTo).toHaveBeenNthCalledWith(2, 120, 40.5);
    expect(context.moveTo).toHaveBeenNthCalledWith(3, 80.5, 0);
    expect(context.lineTo).toHaveBeenNthCalledWith(3, 80.5, 20);
    expect(context.moveTo).toHaveBeenNthCalledWith(4, 80.5, 20);
    expect(context.lineTo).toHaveBeenNthCalledWith(4, 80.5, 80);
  });

  test("does not paint a body break through frozen panes after scrolling", () => {
    const context = createContext();
    const pagination = {
      rowBreaks: [{ index: 3, offset: 60, kind: "manual" }],
      columnBreaks: [],
    } satisfies Pick<SheetPagination, "rowBreaks" | "columnBreaks">;

    paintPageBreakGuides(context, createFrame(), pagination);

    expect(context.rect).toHaveBeenCalledWith(0, 20, 40, 60);
    expect(context.rect).toHaveBeenCalledWith(40, 20, 80, 60);
    expect(context.rect).not.toHaveBeenCalledWith(0, 0, 40, 20);
    expect(context.rect).not.toHaveBeenCalledWith(40, 0, 80, 20);
  });
});
