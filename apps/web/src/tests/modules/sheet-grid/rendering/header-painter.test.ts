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
    viewportSize: { width: 120, height: 80 },
  });
  return createSheetRenderFrame(layout, { width: 36, height: 24 }, 1);
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

    expect(context.fillText).toHaveBeenCalledWith("A", 56, 12);
    expect(context.fillText).toHaveBeenCalledWith("1", 18, 34);
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  test("draws quick controls only for the current header target", () => {
    const context = createContext();
    paintSheetHeaders(context, {
      frame: createFrame(),
      selection: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0, mode: "cells" },
      quickTools: { enabled: true, gutter: 16 },
      hovered: { axis: "row", index: 0, ownerIndex: 0, action: "axis" },
      palette: DEFAULT_SHEET_HEADER_PALETTE,
    });

    // Two insertion dots and one three-stroke grip are painted for the revealed row.
    expect(context.arc).toHaveBeenCalledTimes(2);
  });
});
