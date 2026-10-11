import { afterEach, expect, test, vi } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { paintFramedPictureContent } from "../../../modules/sheet-images/framed-picture-painter";
import { paintImagePresentation } from "../../../shared/images/imageAppearance";
import * as renderer from "../../../shared/images/picture-detailed-render";
import { planDetailedPictureRaster } from "../../../shared/images/picture-detailed-compositor";

const source = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
function context() {
  return {
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
    globalAlpha: 1,
  };
}
function picture(): FramedFloatingImage {
  return {
    id: "picture",
    assetId: "source",
    altText: "Synthetic",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 20, y: 30, size: { width: 200, height: 100 } },
      source: { widthRatio: 2, heightRatio: 2, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 37,
    },
    transform: {
      appearance: {
        opacity: 0.5,
        brightness: 1.2,
        shadow: "hard",
        border: { color: "#ff0000", width: 2 },
        detailedStyle: { fill: { kind: "none" } },
      },
    },
  };
}
afterEach(() => vi.restoreAllMocks());
function intercept() {
  const sourceContext = context(),
    canvas = { width: 220, height: 120 } as HTMLCanvasElement;
  const prepare = vi
    .spyOn(renderer, "preparePictureDetailedPaint")
    .mockImplementation((options) => {
      options.sourcePainter(sourceContext as unknown as CanvasRenderingContext2D);
      return {
        ...planDetailedPictureRaster({
          widthPx: options.width,
          heightPx: options.height,
          pixelDensity: options.density,
          style: { fill: { kind: "none" } },
        }),
        kind: "ready",
        canvas,
        logicalBounds: {
          left: -10,
          top: -10,
          right: options.width + 10,
          bottom: options.height + 10,
        },
      };
    });
  return { sourceContext, canvas, prepare };
}
test("framed typed appearance consumes the real crop/filter and applies whole-picture opacity once", () => {
  const f = picture(),
    output = context(),
    { sourceContext, canvas, prepare } = intercept();
  const before = structuredClone(f);
  paintFramedPictureContent(
    output as unknown as CanvasRenderingContext2D,
    source,
    f,
    resolvePictureFrame(f.frame, createPictureSheetMetrics(createSheet("Synthetic", "sheet"))),
    DEFAULT_WORKBOOK_THEME.effects,
  );
  expect(prepare).toHaveBeenCalledOnce();
  expect(sourceContext.drawImage).toHaveBeenCalledExactlyOnceWith(
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
  expect(sourceContext.globalAlpha).toBe(1);
  expect(sourceContext).toHaveProperty("filter", "brightness(1.2)");
  expect(sourceContext.strokeRect).not.toHaveBeenCalled();
  expect(sourceContext).not.toHaveProperty("shadowBlur");
  expect(output.globalAlpha).toBe(0.5);
  expect(output.drawImage).toHaveBeenCalledExactlyOnceWith(canvas, -10, -10, 220, 120);
  expect(output.rotate).toHaveBeenCalledExactlyOnceWith((37 * Math.PI) / 180);
  expect(f).toEqual(before);
});
test("legacy typed appearance preserves quarter rotation and filter but composes decorations separately", () => {
  const output = context(),
    { sourceContext, prepare } = intercept();
  paintImagePresentation(
    output as unknown as CanvasRenderingContext2D,
    source,
    { x: 10, y: 20, width: 120, height: 80 },
    { rotation: 90, appearance: picture().transform!.appearance },
  );
  expect(prepare).toHaveBeenCalledOnce();
  expect(sourceContext.rotate).toHaveBeenCalledWith(Math.PI / 2);
  expect(sourceContext.strokeRect).not.toHaveBeenCalled();
  expect(sourceContext.globalAlpha).toBe(1);
  expect(output.globalAlpha).toBe(0.5);
  expect(output.drawImage).toHaveBeenCalledOnce();
});
test("explicit typed none reflection overrides legacy own flag without layout shrink", () => {
  const { prepare } = intercept();
  const f = picture();
  f.transform!.appearance!.reflection = true;
  f.transform!.appearance!.detailedStyle!.reflection = { kind: "none" };
  paintFramedPictureContent(
    context() as unknown as CanvasRenderingContext2D,
    source,
    f,
    resolvePictureFrame(f.frame, createPictureSheetMetrics(createSheet("Synthetic", "sheet"))),
  );
  expect(prepare.mock.calls[0]![0].height).toBe(100);
  prepare.mockClear();
  paintImagePresentation(
    context() as unknown as CanvasRenderingContext2D,
    source,
    { x: 0, y: 0, width: 200, height: 100 },
    f.transform,
  );
  expect(prepare.mock.calls[0]![0].height).toBe(100);
});
test("missing auxiliary paint never falls back to an unformatted framed source", () => {
  const f = picture(),
    output = context();
  vi.spyOn(renderer, "preparePictureDetailedPaint").mockImplementation((options) => ({
    ...planDetailedPictureRaster({
      widthPx: options.width,
      heightPx: options.height,
      pixelDensity: options.density,
      style: { fill: { kind: "none" } },
    }),
    kind: "unavailable",
    reason: "asset-unavailable",
    missingAssetIds: ["texture"],
  }));
  expect(() =>
    paintFramedPictureContent(
      output as unknown as CanvasRenderingContext2D,
      source,
      f,
      resolvePictureFrame(f.frame, createPictureSheetMetrics(createSheet("Synthetic", "sheet"))),
    ),
  ).toThrow(renderer.PicturePaintUnavailableError);
  expect(output.save).not.toHaveBeenCalled();
  expect(output.drawImage).not.toHaveBeenCalled();
});
