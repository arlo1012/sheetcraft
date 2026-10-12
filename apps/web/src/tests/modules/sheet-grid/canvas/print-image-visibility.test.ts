import { expect, test, vi } from "vitest";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
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

test("print-only cell image omission avoids asset reads and placeholders but retains fills and note indicators", () => {
  const geometry = createSheetGeometry({
      rowCount: 2,
      columnCount: 2,
      rowHeight: 20,
      columnWidth: 40,
    }),
    rows = createRowVisibilityIndex({ rowCount: 2, defaultRowHeight: 20 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 80, height: 40 },
    mergeResolver: { getRangeAt: () => null },
  });
  const image = { assetId: "nonprint", altText: "", printObject: false };
  const scene: SheetCanvasScene = {
    panes: [
      {
        id: "body",
        cells: [
          {
            address: { row: 0, column: 0 },
            hasNote: true,
            rect: { x: 0, y: 0, width: 40, height: 20 },
            contentRect: { x: 0, y: 0, width: 40, height: 20 },
            style: { fillColor: "#AABBCC" },
            content: { text: "", style: undefined, image },
          },
        ],
      },
    ],
  };
  const images = { get: vi.fn(() => undefined), retain: vi.fn() },
    placeholder = vi.fn(() => "");
  const options = {
    palette: { background: "#fff", text: "#000", gridLine: "#ddd", mutedText: "#666" },
    showGridLines: false,
    imageUrls: new Map([["nonprint", "blob:test"]]),
    images: images as never,
    imagePlaceholder: placeholder,
  };
  const printContext = createContext();
  paintSheetScene(printContext, scene, layout, { ...options, isImageVisible: () => false });
  expect(images.get).not.toHaveBeenCalled();
  expect(placeholder).not.toHaveBeenCalled();
  expect(images.retain).toHaveBeenLastCalledWith(new Set());
  expect(printContext.fillRect).toHaveBeenCalled();
  expect(printContext.moveTo).toHaveBeenLastCalledWith(31, 1);
  const ordinaryContext = Object.assign(createContext(), { fillText: vi.fn() });
  paintSheetScene(ordinaryContext, scene, layout, options);
  expect(images.get).toHaveBeenCalledWith("blob:test");
  expect(placeholder).toHaveBeenCalledWith("nonprint");
});
