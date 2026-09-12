import { describe, expect, test, vi } from "vitest";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { createSheetRenderFrame } from "../../../../modules/sheet-grid/rendering/sheet-render-frame";
import {
  paintSheetChrome,
  paintSheetForeground,
  paintSheetUnderlay,
} from "../../../../modules/sheet-grid/rendering/overlay-painter";
import type { SheetOverlayPalette } from "../../../../modules/sheet-grid/rendering/overlay-types";

function createContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    fillRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    roundRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 80 })),
  } as unknown as CanvasRenderingContext2D;
}

const palette: SheetOverlayPalette = {
  actionPrimary: "#3b82f6",
  mutedText: "#64748b",
  panel: "#ffffff",
  inverseText: "#ffffff",
  formulaReferenceColors: ["#ef4444", "#22c55e"],
};

function createFrame() {
  const geometry = createSheetGeometry({
    rowCount: 8,
    columnCount: 8,
    rowHeight: 20,
    columnWidth: 40,
  });
  const rows = createRowVisibilityIndex({ rowCount: 8, defaultRowHeight: 20 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 1, columns: 1 },
    viewportSize: { width: 120, height: 80 },
  });
  return createSheetRenderFrame(layout, { width: 36, height: 24 }, 1);
}

describe("overlay painter", () => {
  test("clips and translates body fragments once before painting underlay fills", () => {
    const frame = createFrame();
    const context = createContext();
    const fragments = frame.layout.getRangeFragments({
      start: { row: 0, column: 0 },
      end: { row: 2, column: 2 },
    });

    paintSheetUnderlay(context, frame, { rangeRects: fragments, readingRects: fragments }, palette);

    expect(context.translate).toHaveBeenCalledWith(36, 24);
    expect(context.rect).toHaveBeenCalledWith(0, 0, 40, 20);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 40, 20);
  });

  test("does not draw duplicate range-outline seams where frozen fragments meet", () => {
    const frame = createFrame();
    const context = createContext();
    const fragments = frame.layout.getRangeFragments({
      start: { row: 0, column: 0 },
      end: { row: 2, column: 2 },
    });

    paintSheetForeground(context, frame, { rangeRects: fragments }, palette, 0);

    // Four frozen fragments contribute their outer edges only (eight segments),
    // rather than each fragment outlining all four of its sides (sixteen).
    expect(context.stroke).toHaveBeenCalledTimes(8);
  });

  test("uses the shared clock for clipboard dashes and paints reference fills after borders", () => {
    const frame = createFrame();
    const context = createContext();
    const fragments = frame.layout.getRangeFragments({
      start: { row: 1, column: 1 },
      end: { row: 1, column: 1 },
    });

    paintSheetForeground(
      context,
      frame,
      {
        referenceGroups: [{ key: "ref", colorIndex: 0, rects: fragments, active: true }],
        clipboardRects: fragments,
      },
      palette,
      120,
    );

    expect(context.fillRect).toHaveBeenCalledWith(40, 20, 40, 20);
    expect(context.setLineDash).toHaveBeenCalledWith([5, 3]);
    expect(context.lineDashOffset).toBe(-2);
  });

  test("projects freeze chrome and operation previews into surface coordinates", () => {
    const frame = createFrame();
    const context = createContext();

    paintSheetChrome(
      context,
      frame,
      {
        freezeHandles: { visible: true, hovered: "rowStarter" },
        axisOperationPreview: { axis: "row", offset: 30, label: "Insert row" },
      },
      palette,
    );

    expect(context.fillRect).toHaveBeenCalledWith(0, 43.5, 156, 1);
    expect(context.fillRect).toHaveBeenCalledWith(36, 53, 120, 2);
    expect(context.fillText).toHaveBeenCalledWith("Insert row", 51, 72);
  });
});
