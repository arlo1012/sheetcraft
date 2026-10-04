import { describe, expect, test, vi } from "vitest";
import type { SheetWatermark } from "@idea10/core/page-decoration";
import {
  paintSheetWatermark,
  paintWatermarkInRect,
} from "../../../modules/page-decorations/page-decoration-painter";

function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn(() => ({
      width: 42,
      actualBoundingBoxAscent: 18,
      actualBoundingBoxDescent: 6,
    })),
    globalAlpha: 1,
    fillStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  };
}

const textWatermark = {
  text: "机密",
  fontSize: 24,
  fontFamily: "Microsoft YaHei UI",
  color: "#c0c0c0",
  opacity: 0.5,
  angle: -45,
} as SheetWatermark;

describe("page decoration painter", () => {
  test("tiles a small diagonal text watermark across the page", () => {
    const raw = context();
    paintWatermarkInRect(raw as unknown as CanvasRenderingContext2D, textWatermark, {
      x: 0,
      y: 0,
      width: 330,
      height: 220,
    });

    expect(raw.font).toBe('24px "Microsoft YaHei UI"');
    expect(raw.fillText).toHaveBeenCalledTimes(20);
    expect(raw.rotate).toHaveBeenCalledWith((-45 * Math.PI) / 180);
  });

  test("uses the image's intrinsic dimensions for an explicit percentage scale", () => {
    const raw = context();
    const image = { naturalWidth: 300, naturalHeight: 100 } as HTMLImageElement;
    const watermark = {
      ...textWatermark,
      text: "",
      image: { assetId: "seal", scale: 50, washout: false, angle: 0 },
    } as SheetWatermark;
    paintWatermarkInRect(
      raw as unknown as CanvasRenderingContext2D,
      watermark,
      { x: 0, y: 0, width: 120, height: 120 },
      { image },
    );

    expect(raw.drawImage).toHaveBeenCalledWith(image, -75, -25, 150, 50);
  });

  test("only visits watermark tiles visible in the canvas viewport", () => {
    const raw = context();
    paintWatermarkInRect(
      raw as unknown as CanvasRenderingContext2D,
      textWatermark,
      { x: 0, y: 0, width: 10_000, height: 10_000 },
      { viewport: { x: 4_000, y: 4_000, width: 100, height: 100 } },
    );

    expect(raw.fillText.mock.calls.length).toBeLessThan(20);
  });

  test("uses the whole layout paper instead of the printable content rectangle", () => {
    const raw = context();
    paintSheetWatermark(
      raw as unknown as CanvasRenderingContext2D,
      { watermark: textWatermark },
      {
        layout: {
          bodyScrollPosition: { x: 5, y: 7 },
          viewportSize: { width: 500, height: 500 },
        },
      } as never,
      {
        mode: "page-layout",
        pages: [
          {
            paperRect: { x: 10, y: 20, width: 330, height: 220 },
            contentRect: { x: 40, y: 50, width: 100, height: 80 },
            sheetRect: { x: 0, y: 0, width: 0, height: 0 },
          },
        ],
      } as never,
    );

    expect(raw.rect).toHaveBeenCalledWith(5, 13, 330, 220);
  });
});
