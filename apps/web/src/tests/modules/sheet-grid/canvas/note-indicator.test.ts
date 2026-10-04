import { describe, expect, test, vi } from "vitest";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { paintSheetScene } from "../../../../modules/sheet-grid/canvas/scene-painter";
import type { SheetCanvasScene } from "../../../../modules/sheet-grid/canvas/cell-scene";

function createContext() {
  return {
    fillStyle: "",
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, d: 1, e: 0, f: 0 })),
  } as unknown as CanvasRenderingContext2D;
}

describe("cell note indicator", () => {
  test("paints a red triangle at the upper-right corner of a merged cell", () => {
    const geometry = createSheetGeometry({
      rowCount: 2,
      columnCount: 2,
      rowHeight: 20,
      columnWidth: 40,
    });
    const rows = createRowVisibilityIndex({
      rowCount: 2,
      defaultRowHeight: 20,
    });
    const layout = createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 80, height: 40 },
      mergeResolver: { getRangeAt: () => null },
    });
    const scene: SheetCanvasScene = {
      panes: [
        {
          id: "body",
          cells: [
            {
              address: { row: 0, column: 0 },
              hasNote: true,
              rect: { x: 0, y: 0, width: 40, height: 20 },
              contentRect: { x: 0, y: 0, width: 80, height: 40 },
              content: { text: "", style: undefined },
              style: undefined,
            },
          ],
        },
      ],
    };
    const context = createContext();

    paintSheetScene(context, scene, layout, {
      palette: {
        background: "#fff",
        text: "#000",
        gridLine: "#ddd",
        mutedText: "#666",
      },
      showGridLines: false,
      images: { retain: vi.fn() } as never,
      imagePlaceholder: () => "",
    });

    expect(context.moveTo).toHaveBeenLastCalledWith(71, 1);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 79, 1);
    expect(context.lineTo).toHaveBeenNthCalledWith(2, 79, 9);
  });
});
