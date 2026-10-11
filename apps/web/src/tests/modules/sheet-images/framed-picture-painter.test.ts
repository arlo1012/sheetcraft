import { describe, expect, test, vi } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { paintFramedPictureContent } from "../../../modules/sheet-images/framed-picture-painter";

function fixture() {
  const picture: FramedFloatingImage = {
    id: "synthetic",
    assetId: "asset",
    altText: "Synthetic",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 20, y: 30, size: { width: 200, height: 100 } },
      source: { widthRatio: 2, heightRatio: 2, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 37,
    },
  };
  const source = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    strokeRect: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillText: vi.fn(),
    globalAlpha: 1,
  };
  const metrics = createPictureSheetMetrics(createSheet("Synthetic", "sheet"));
  const draw = () =>
    paintFramedPictureContent(
      context as unknown as CanvasRenderingContext2D,
      source,
      picture,
      resolvePictureFrame(picture.frame, metrics),
    );
  return { picture, source, context, metrics, draw };
}

describe("prepared framed picture content painter", () => {
  test("draws a local crop once through the arbitrary-angle frame matrix", () => {
    const { draw, context, source } = fixture();
    draw();
    expect(context.translate.mock.calls.slice(0, 2)).toEqual([
      [120, 80],
      [-100, -50],
    ]);
    expect(context.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(
      source,
      100,
      50,
      200,
      100,
      0,
      0,
      200,
      100,
    );
    expect(context.save).toHaveBeenCalledTimes(2);
    expect(context.restore).toHaveBeenCalledTimes(2);
  });
  test.each([false, true].flatMap((flipX) => [false, true].map((flipY) => ({ flipX, flipY }))))(
    "shares asymmetric source clipping and flips $flipX/$flipY with annotations",
    ({ flipX, flipY }) => {
      const { picture, draw, context, source } = fixture();
      picture.frame.source.offsetXRatio = 0.5;
      picture.frame.source.offsetYRatio = 0.25;
      picture.frame.flipHorizontal = flipX;
      picture.frame.flipVertical = flipY;
      picture.transform = {
        annotations: [
          {
            kind: "text",
            points: [{ x: 0.5, y: 0.5 }],
            color: "#FF0000",
            width: 0.01,
            text: "Mark",
            fontSize: 0.05,
          },
        ],
      };
      draw();
      expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(
        source,
        flipX ? 200 : 0,
        flipY ? 75 : 25,
        200,
        100,
        0,
        0,
        200,
        100,
      );
      expect(context.scale).toHaveBeenCalledWith(flipX ? -1 : 1, flipY ? -1 : 1);
      expect(context.clip).toHaveBeenCalledOnce();
      expect(context.rect).toHaveBeenCalledWith(0, 0, 200, 100);
      expect(context.fillText).toHaveBeenCalledWith("Mark", 200, 100);
    },
  );
  test("keeps source padding transparent instead of stretching it over the whole frame", () => {
    const { picture, draw, context, source } = fixture();
    picture.frame.source = {
      widthRatio: 0.5,
      heightRatio: 0.5,
      offsetXRatio: 0.25,
      offsetYRatio: 0.25,
    };
    draw();
    expect(context.translate).toHaveBeenCalledWith(100, 50);
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(
      source,
      0,
      0,
      400,
      200,
      0,
      0,
      100,
      50,
    );
  });
  test("a source fully outside the crop leaves no painted source or allocated bitmap", () => {
    const { picture, draw, context } = fixture();
    picture.frame.source.offsetXRatio = 10;
    draw();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalledOnce();
  });
  test("applies supported appearance to content and an inset local frame border", () => {
    const { picture, draw, context } = fixture();
    picture.transform = {
      appearance: {
        opacity: 0.5,
        brightness: 0.5,
        grayscale: 1,
        shadow: "soft",
        border: { color: "#123456", width: 4 },
      },
    };
    draw();
    expect(context.globalAlpha).toBe(0.5);
    expect(context.strokeRect).toHaveBeenCalledWith(2, 2, 196, 96);
    expect(context).toMatchObject({ filter: "none", shadowColor: "transparent", shadowBlur: 8 });
  });
  test("unsupported reflection rejects before touching the canvas", () => {
    const { picture, draw, context } = fixture();
    picture.transform = { appearance: { reflection: true } };
    expect(draw).toThrow("reflection");
    expect(context.save).not.toHaveBeenCalled();
  });
  test("hidden and visibility-collapsed frames do not decode or draw", () => {
    const { picture, draw, context, metrics, source } = fixture();
    picture.hidden = true;
    draw();
    picture.hidden = false;
    const resolved = resolvePictureFrame(picture.frame, metrics);
    paintFramedPictureContent(context as unknown as CanvasRenderingContext2D, source, picture, {
      ...resolved,
      collapsed: true,
      sourceRect: null,
    });
    expect(context.save).not.toHaveBeenCalled();
  });
  test("restores both levels when drawImage rejects", () => {
    const { draw, context } = fixture();
    context.drawImage.mockImplementation(() => {
      throw new Error("decode lost");
    });
    expect(draw).toThrow("decode lost");
    expect(context.restore).toHaveBeenCalledTimes(2);
  });
  test("rejects unavailable decoded dimensions before touching the canvas", () => {
    const { draw, context, source } = fixture();
    Object.assign(source, { naturalWidth: 0 });
    expect(draw).toThrow("positive and finite");
    expect(context.save).not.toHaveBeenCalled();
  });
});
