import { describe, expect, test, vi } from "vitest";
import type { FloatingImage } from "@idea10/core/workbook";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import {
  getFloatingImageViewportFragmentsForPaint,
  paintFloatingImages,
} from "../../../modules/sheet-images/floating-image-painter";

function createLayout() {
  return createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount: 8, columnCount: 8, rowHeight: 20, columnWidth: 80 }),
    rows: createRowVisibilityIndex({ rowCount: 8, defaultRowHeight: 20 }),
    freeze: { rows: 1, columns: 1 },
    viewportSize: { width: 240, height: 120 },
  });
}

const image: FloatingImage = {
  id: "image-1",
  assetId: "asset-1",
  altText: "Diagram",
  anchor: { row: 0, column: 0 },
  offsetX: 40,
  offsetY: 10,
  width: 100,
  height: 50,
};

const palette = {
  placeholderBackground: "#eee",
  placeholderStripe: "#ddd",
  placeholderBorder: "#ccc",
  placeholderText: "#666",
};

describe("floating image canvas painter", () => {
  test("projects a free-floating image into every frozen pane it crosses", () => {
    expect(getFloatingImageViewportFragmentsForPaint([image], createLayout())).toHaveLength(4);
  });

  test("clips each fragment and draws crop, rotation, and flip without DOM image elements", () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
    };
    const decoded = { naturalWidth: 200, naturalHeight: 100 } as HTMLImageElement;
    const cache = {
      get: vi.fn(() => decoded),
      load: vi.fn(async () => {}),
      retain: vi.fn(),
      dispose: vi.fn(),
    };
    paintFloatingImages(context as unknown as CanvasRenderingContext2D, {
      state: {
        images: [
          {
            ...image,
            transform: {
              crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
              rotation: 90,
              flipHorizontal: true,
            },
          },
        ],
        revision: 1,
      },
      layout: createLayout(),
      assetUrls: new Map([["asset-1", "blob:asset-1"]]),
      cache,
      palette,
      loadingLabel: "Loading",
      unavailableLabel: "Unavailable",
    });
    expect(context.drawImage).toHaveBeenCalledWith(decoded, 50, 0, 100, 100, 0, 0, 100, 100);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(context.clip).toHaveBeenCalledTimes(4);
    expect(cache.retain).toHaveBeenCalledWith(new Set(["blob:asset-1"]));
  });

  test("applies supported theme effects while retaining frozen-pane clipping", () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
    };
    const cache = {
      get: vi.fn(() => ({ naturalWidth: 200, naturalHeight: 100 }) as HTMLImageElement),
      load: vi.fn(async () => {}),
      retain: vi.fn(),
      dispose: vi.fn(),
    };
    paintFloatingImages(context as unknown as CanvasRenderingContext2D, {
      state: { images: [image], revision: 1 },
      layout: createLayout(),
      assetUrls: new Map([["asset-1", "blob:asset-1"]]),
      cache,
      palette,
      loadingLabel: "Loading",
      unavailableLabel: "Unavailable",
      effects: {
        shadow: "soft",
        reflection: true,
        bevel: true,
        outlineWidth: 2,
        gradient: false,
      },
    });
    expect(context.drawImage).toHaveBeenCalledTimes(8);
    expect(context.strokeRect).toHaveBeenCalledTimes(4);
    expect(context.stroke).toHaveBeenCalledTimes(8);
    expect(context.clip).toHaveBeenCalledTimes(4);
  });
});
