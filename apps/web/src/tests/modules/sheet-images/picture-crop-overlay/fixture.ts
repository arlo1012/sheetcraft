import { vi } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";

export function fixture(frozen = false, scroll = { x: 0, y: 0 }) {
  const sheet = createSheet("Crop", "crop-sheet");
  const metrics = createPictureSheetMetrics(sheet);
  const picture: FramedFloatingImage = {
    id: "crop-leaf",
    assetId: "genuine-asset",
    altText: "Synthetic crop",
    lockAspectRatio: true,
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 180, y: 120, size: { width: 160, height: 100 } },
      angleDeg: 37,
      source: { widthRatio: 2, heightRatio: 2.5, offsetXRatio: 0.3, offsetYRatio: -0.2 },
    },
  };
  const geometry = createSheetGeometry({ rowCount: 20, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: frozen ? { rows: 1, columns: 1 } : undefined,
    bodyScrollPosition: scroll,
    viewportSize: { width: 500, height: 400 },
  });
  return {
    picture,
    metrics,
    layout,
    resolved: () => resolvePictureFrame(picture.frame, metrics),
  };
}

export function canvasContext() {
  const states: { globalAlpha: number; filter: string; globalCompositeOperation: string }[] = [];
  const context = {
    save: vi.fn(() => {
      states.push({
        globalAlpha: context.globalAlpha,
        filter: context.filter,
        globalCompositeOperation: context.globalCompositeOperation,
      });
    }),
    restore: vi.fn(() => {
      Object.assign(context, states.pop());
    }),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    strokeRect: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    filter: "none",
  };
  return context;
}
