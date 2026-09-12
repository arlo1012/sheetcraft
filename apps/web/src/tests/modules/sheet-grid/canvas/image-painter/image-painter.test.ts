import { describe, expect, test, vi } from "vitest";
import { paintCellImage } from "../../../../../modules/sheet-grid/canvas/image-painter";

describe("Canvas cell image geometry", () => {
  test("contains the cropped rotated image and applies flips inside the crop", () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    };
    const image = { naturalWidth: 200, naturalHeight: 100 } as HTMLImageElement;
    paintCellImage(
      context as unknown as CanvasRenderingContext2D,
      image,
      { x: 10, y: 20, width: 105, height: 55 },
      { crop: { x: 0.25, y: 0, width: 0.5, height: 1 }, rotation: 90, flipHorizontal: true },
    );
    expect(context.drawImage).toHaveBeenCalledWith(image, 50, 0, 100, 100, 0, 0, 100, 100);
    expect(context.scale).toHaveBeenNthCalledWith(1, 0.5, 0.5);
    expect(context.scale).toHaveBeenNthCalledWith(2, -1, 1);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(context.translate).toHaveBeenNthCalledWith(1, 37, 22);
    expect(context.translate).toHaveBeenNthCalledWith(2, 100, 0);
  });
});
