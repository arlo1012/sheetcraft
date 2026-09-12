import { describe, expect, test, vi } from "vitest";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { createSheetRenderFrame } from "../../../../modules/sheet-grid/rendering/sheet-render-frame";
import {
  DEFAULT_SHEET_HEADER_PALETTE,
  paintSheetHeaders,
} from "../../../../modules/sheet-grid/rendering/header-painter";

function createContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
    strokeRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createFrame(gutter = 0) {
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
    viewportSize: { width: 120, height: 80 },
  });
  return createSheetRenderFrame(layout, { width: 36 + gutter, height: 24 + gutter }, 1);
}

describe("header painter", () => {
  test("draws row and column labels from frame panes without clearing sibling layers", () => {
    const context = createContext();
    paintSheetHeaders(context, {
      frame: createFrame(),
      selection: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0, mode: "cells" },
      quickTools: { enabled: false, gutter: 0 },
      palette: DEFAULT_SHEET_HEADER_PALETTE,
    });

    expect(context.fillText).toHaveBeenCalledWith("A", 56, 11.5);
    expect(context.fillText).toHaveBeenCalledWith("1", 17.5, 34);
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  test("draws quick controls only for the current header target", () => {
    const context = createContext();
    paintSheetHeaders(context, {
      frame: createFrame(16),
      selection: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0, mode: "cells" },
      quickTools: { enabled: true, gutter: 16 },
      hovered: { axis: "row", index: 0, ownerIndex: 0, action: "axis" },
      palette: DEFAULT_SHEET_HEADER_PALETTE,
    });

    // Two insertion dots and the six-dot Lucide grip are painted for the revealed row.
    expect(context.arc).toHaveBeenCalledTimes(8);
  });

  test("keeps the corner triangle inset and separators out of the quick-tool gutters", () => {
    const context = createContext();
    const frame = createFrame(16);
    paintSheetHeaders(context, {
      frame,
      selection: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0, mode: "cells" },
      quickTools: { enabled: true, gutter: 16 },
      palette: DEFAULT_SHEET_HEADER_PALETTE,
    });

    expect(context.moveTo).toHaveBeenLastCalledWith(45, 25);
    expect(vi.mocked(context.lineTo).mock.calls.slice(-2)).toEqual([
      [45, 33],
      [37, 33],
    ]);
    expect(context.moveTo).toHaveBeenCalledWith(51.5, 16);
    expect(context.lineTo).toHaveBeenCalledWith(51.5, frame.size.height);
    expect(context.moveTo).toHaveBeenCalledWith(16, 39.5);
    expect(context.lineTo).toHaveBeenCalledWith(frame.size.width, 39.5);
    expect(context.moveTo).not.toHaveBeenCalledWith(51.5, 0);
    expect(context.moveTo).not.toHaveBeenCalledWith(0, 39.5);
  });
});
