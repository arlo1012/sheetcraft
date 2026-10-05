import { afterEach, describe, expect, test, vi } from "vitest";
import {
  imageAppearanceFilter,
  paintImagePresentation,
} from "../../../shared/images/imageAppearance";

afterEach(() => {
  vi.restoreAllMocks();
});

function decodedImage(width = 200, height = 100) {
  const image = document.createElement("img");
  Object.defineProperties(image, {
    naturalWidth: { value: width },
    naturalHeight: { value: height },
  });
  return image;
}

function canvasContext() {
  const state = {
    globalAlpha: 0.8,
    filter: "contrast(0.9)",
    shadowColor: "initial",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineWidth: 1,
    strokeStyle: "#000000",
  };
  const stack: Array<typeof state> = [];
  const drawingStates: Array<typeof state> = [];
  const context = {
    ...state,
    save: vi.fn(() => {
      stack.push(readState());
    }),
    restore: vi.fn(() => {
      Object.assign(context, stack.pop());
    }),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn((..._args: unknown[]) => {
      drawingStates.push(readState());
    }),
    strokeRect: vi.fn(),
  };
  function readState(): typeof state {
    return {
      globalAlpha: context.globalAlpha,
      filter: context.filter,
      shadowColor: context.shadowColor,
      shadowBlur: context.shadowBlur,
      shadowOffsetX: context.shadowOffsetX,
      shadowOffsetY: context.shadowOffsetY,
      lineWidth: context.lineWidth,
      strokeStyle: context.strokeStyle,
    };
  }
  return { context, drawingStates, initial: state, readState };
}

describe("image appearance rendering", () => {
  test("composes CSS filters and omits their default values", () => {
    expect(imageAppearanceFilter()).toBe("none");
    expect(
      imageAppearanceFilter({
        brightness: 1,
        contrast: 1,
        saturation: 1,
        grayscale: 0,
        sepia: 0,
        opacity: 0.5,
      }),
    ).toBe("none");
    expect(
      imageAppearanceFilter({
        brightness: 1.2,
        contrast: 0.8,
        saturation: 0,
        grayscale: 0.5,
        sepia: 1,
      }),
    ).toBe("brightness(1.2) contrast(0.8) saturate(0) grayscale(0.5) sepia(1)");
  });

  test("applies opacity, crop, rotation, border and shadow within saved canvas state", () => {
    const image = decodedImage();
    const f = canvasContext();
    paintImagePresentation(
      f.context as unknown as CanvasRenderingContext2D,
      image,
      { x: 10, y: 20, width: 120, height: 60 },
      {
        crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.6 },
        rotation: 90,
        appearance: {
          opacity: 0.5,
          brightness: 1.2,
          border: { color: "#ABCDEF", width: 4 },
          shadow: "soft",
        },
      },
    );
    expect(f.context.drawImage).toHaveBeenCalledExactlyOnceWith(
      image,
      50,
      10,
      100,
      60,
      0,
      0,
      100,
      60,
    );
    expect(f.context.translate).toHaveBeenNthCalledWith(1, 10, 20);
    expect(f.context.translate).toHaveBeenNthCalledWith(2, 60, 0);
    expect(f.context.scale).toHaveBeenNthCalledWith(1, 2, 0.6);
    expect(f.context.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(f.drawingStates[0]).toMatchObject({
      globalAlpha: 0.4,
      filter: "brightness(1.2)",
      shadowColor: "rgb(0 0 0 / 35%)",
      shadowBlur: 8,
      shadowOffsetX: 3,
      shadowOffsetY: 3,
    });
    expect(f.context.strokeRect).toHaveBeenCalledExactlyOnceWith(12, 22, 116, 56);
    expect(f.context.save).toHaveBeenCalledTimes(2);
    expect(f.context.restore).toHaveBeenCalledTimes(2);
    expect(f.readState()).toEqual(f.initial);
  });

  test("draws an unstyled original image and preserves caller state", () => {
    const image = decodedImage();
    const f = canvasContext();
    paintImagePresentation(f.context as unknown as CanvasRenderingContext2D, image, {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
    expect(f.context.drawImage).toHaveBeenCalledExactlyOnceWith(
      image,
      0,
      0,
      200,
      100,
      0,
      0,
      200,
      100,
    );
    expect(f.drawingStates[0]).toMatchObject({ globalAlpha: 0.8, filter: "none" });
    expect(f.context.strokeRect).not.toHaveBeenCalled();
    expect(f.readState()).toEqual(f.initial);
  });

  test("makes only matching pixels transparent and reuses the processed source", () => {
    const image = decodedImage(3, 1);
    const pixels = {
      data: new Uint8ClampedArray([255, 255, 255, 255, 250, 252, 251, 128, 240, 255, 255, 200]),
    };
    const processing = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => pixels),
      putImageData: vi.fn(),
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(processing as unknown as CanvasRenderingContext2D);
    const f = canvasContext();
    const transform = { appearance: { transparentColor: "#FFFFFF", transparentTolerance: 5 } };
    paintImagePresentation(
      f.context as unknown as CanvasRenderingContext2D,
      image,
      { x: 0, y: 0, width: 3, height: 1 },
      transform,
    );
    expect(Array.from(pixels.data)).toEqual([
      255, 255, 255, 0, 250, 252, 251, 0, 240, 255, 255, 200,
    ]);
    expect(processing.putImageData).toHaveBeenCalledExactlyOnceWith(pixels, 0, 0);
    const source = f.context.drawImage.mock.calls[0]?.[0];
    expect(source).toBeInstanceOf(HTMLCanvasElement);
    paintImagePresentation(
      f.context as unknown as CanvasRenderingContext2D,
      image,
      { x: 0, y: 0, width: 3, height: 1 },
      transform,
    );
    expect(f.context.drawImage.mock.calls[1]?.[0]).toBe(source);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(processing.getImageData).toHaveBeenCalledExactlyOnceWith(0, 0, 3, 1);
  });
});
