import { afterEach, describe, expect, test, vi } from "vitest";
import { paintCellImage } from "../../../../../modules/sheet-grid/canvas/image-painter";
import { captureCellPictureSourcePresentation } from "../../../../../modules/sheet-images/cell-picture-presentation";
import { planPictureSourcePresentation } from "../../../../../modules/sheet-images/picture-source-presentation";
import { framedCellPicture } from "../../../sheet-images/cell-picture-fixture";
import * as renderer from "../../../../../shared/images/picture-detailed-render";
import * as compositor from "../../../../../shared/images/picture-detailed-compositor";
import { paintPictureShapeFillMask } from "../../../../../shared/images/picture-shape-mask";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";

function context() {
  let density = 1;
  const stack: number[] = [];
  return {
    save: vi.fn(() => {
      stack.push(density);
    }),
    restore: vi.fn(() => {
      density = stack.pop() ?? 1;
    }),
    translate: vi.fn(),
    scale: vi.fn((x: number, y: number) => {
      density *= Math.max(Math.abs(x), Math.abs(y));
    }),
    getTransform: vi.fn(() => ({ a: density, b: 0, c: 0, d: density, e: 0, f: 0 })),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillText: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    globalAlpha: 1,
  };
}
const decoded = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
afterEach(() => {
  renderer.clearPictureDetailedPaintCache();
  vi.restoreAllMocks();
});

describe("source-bearing cell pictures", () => {
  test("paints arbitrary rotation, actual source padding, flips and annotations without a presentation canvas", () => {
    const image = framedCellPicture(),
      before = structuredClone(image),
      ctx = context();
    const allocate = vi.spyOn(document, "createElement");
    paintCellImage(
      ctx as unknown as CanvasRenderingContext2D,
      decoded,
      { x: 10, y: 20, width: 205, height: 155 },
      undefined,
      undefined,
      image,
    );
    expect(ctx.drawImage).toHaveBeenCalledExactlyOnceWith(decoded, 0, 0, 400, 200, 0, 0, 100, 50);
    expect(ctx.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
    expect(ctx.translate).toHaveBeenCalledWith(190, 35);
    expect(ctx.fillText).toHaveBeenCalledWith("Mark", 200, 100);
    expect(ctx.globalAlpha).toBe(0.6);
    expect(ctx.save.mock.calls.length).toBe(ctx.restore.mock.calls.length);
    expect(allocate).not.toHaveBeenCalled();
    expect(image).toEqual(before);
  });

  test("contains rotated, masked glow bounds and paints the genuine source through the shared compositor", () => {
    const image = framedCellPicture(),
      output = context(),
      sourceContext = context(),
      mask = context();
    image.frame.cropShape = { preset: "ellipse" };
    image.transform!.appearance!.detailedStyle = {
      glow: {
        kind: "value",
        value: { color: { kind: "rgb", rgb: "#123456" }, opacity: 0.7, sizePt: 9 },
      },
    };
    const raster = { width: 240, height: 140 } as HTMLCanvasElement;
    const prepare = vi
      .spyOn(renderer, "preparePictureDetailedPaint")
      .mockImplementation((options) => {
        const plan = renderer.planPictureDetailedPaint(options)!;
        options.sourcePainter(sourceContext as unknown as CanvasRenderingContext2D);
        paintPictureShapeFillMask(mask as unknown as CanvasRenderingContext2D, plan.shape!);
        return { ...plan, kind: "ready", canvas: raster };
      });
    const resources = {
      theme: {
        ...DEFAULT_WORKBOOK_THEME,
        effects: { ...DEFAULT_WORKBOOK_THEME.effects, shadow: "none" as const, reflection: false },
      },
    };
    const rect = { x: 7, y: 9, width: 145, height: 105 };
    const before = structuredClone(image);
    paintCellImage(
      output as unknown as CanvasRenderingContext2D,
      decoded,
      rect,
      undefined,
      resources,
      image,
    );
    const plan = planPictureSourcePresentation(
      captureCellPictureSourcePresentation(image),
      resources.theme,
      resources,
      4096,
      prepare.mock.calls[0]![0].density,
    );
    const [scale] = output.scale.mock.calls[0]!,
      [x, y] = output.translate.mock.calls[0]!;
    expect(plan.bounds.width).toBeGreaterThan(200 * Math.cos((37 * Math.PI) / 180));
    expect(x + plan.bounds.x * scale!).toBeGreaterThanOrEqual(rect.x + 5 - 1e-6);
    expect(y + plan.bounds.y * scale!).toBeGreaterThanOrEqual(rect.y + 5 - 1e-6);
    expect(x + (plan.bounds.x + plan.bounds.width) * scale!).toBeLessThanOrEqual(
      rect.x + rect.width - 5 + 1e-6,
    );
    expect(y + (plan.bounds.y + plan.bounds.height) * scale!).toBeLessThanOrEqual(
      rect.y + rect.height - 5 + 1e-6,
    );
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0]![0].resources).toBe(resources);
    expect(prepare.mock.calls[0]![0].shapeGeometry).toHaveProperty("paths");
    expect(mask.ellipse).toHaveBeenCalled();
    expect(mask.fill).toHaveBeenCalledWith("nonzero");
    expect(sourceContext.drawImage).toHaveBeenCalledWith(decoded, 0, 0, 400, 200);
    expect(sourceContext.fillText).toHaveBeenCalledWith("Mark", 200, 100);
    expect(output.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
    expect(output.drawImage.mock.calls[0]![0]).toBe(raster);
    expect(image).toEqual(before);
  });

  test("missing auxiliary paint propagates unavailability with no original-source fallback or canvas allocation", () => {
    const image = framedCellPicture(),
      ctx = context();
    image.frame.cropShape = { preset: "ellipse" };
    image.transform!.appearance!.detailedStyle = {
      fill: {
        kind: "value",
        value: {
          kind: "picture",
          assetId: "missing-texture",
          opacity: 1,
          rotateWithShape: true,
          layout: {
            kind: "stretch",
            widthRatio: 1,
            heightRatio: 1,
            offsetXRatio: 0,
            offsetYRatio: 0,
          },
        },
      },
    };
    const resources = { getAssetSize: vi.fn(), getAssetImage: vi.fn() },
      allocate = vi.spyOn(document, "createElement");
    expect(() =>
      paintCellImage(
        ctx as unknown as CanvasRenderingContext2D,
        decoded,
        { x: 0, y: 0, width: 105, height: 85 },
        undefined,
        resources,
        image,
      ),
    ).toThrow(renderer.PicturePaintUnavailableError);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(allocate).not.toHaveBeenCalled();
    expect(resources.getAssetImage).toHaveBeenCalledWith("missing-texture");
    expect(ctx.save.mock.calls.length).toBe(ctx.restore.mock.calls.length);
  });

  test("native inherited shadow reserves physical padding at viewport density", () => {
    const image = framedCellPicture(),
      ctx = context();
    const resources = {
      theme: {
        ...DEFAULT_WORKBOOK_THEME,
        effects: { ...DEFAULT_WORKBOOK_THEME.effects, shadow: "soft" as const, reflection: false },
      },
    };
    const rect = { x: 0, y: 0, width: 150, height: 110 };
    const plan = planPictureSourcePresentation(
      captureCellPictureSourcePresentation(image),
      resources.theme,
      resources,
    );
    paintCellImage(
      ctx as unknown as CanvasRenderingContext2D,
      decoded,
      rect,
      undefined,
      resources,
      image,
    );
    const [scale] = ctx.scale.mock.calls[0]!,
      [x, y] = ctx.translate.mock.calls[0]!;
    expect(x + plan.bounds.x * scale! - 28).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(y + plan.bounds.y * scale! - 28).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(x + (plan.bounds.x + plan.bounds.width) * scale! + 28).toBeLessThanOrEqual(145 + 1e-6);
    expect(y + (plan.bounds.y + plan.bounds.height) * scale! + 28).toBeLessThanOrEqual(105 + 1e-6);
    expect(ctx).toHaveProperty("shadowBlur", 8);
  });

  test("repeat frame paints reuse the existing detailed raster cache rather than allocating presentation canvases", () => {
    const image = framedCellPicture(),
      ctx = context(),
      sourceContext = context();
    image.frame.cropShape = { preset: "ellipse" };
    const raster = { width: 200, height: 100 } as HTMLCanvasElement;
    const composite = vi
      .spyOn(compositor, "createDetailedPictureRaster")
      .mockImplementation((options) => {
        options.sourcePainter(sourceContext as unknown as CanvasRenderingContext2D);
        return { ...compositor.planDetailedPictureRaster(options), kind: "ready", canvas: raster };
      });
    const allocate = vi.spyOn(document, "createElement");
    const paint = () =>
      paintCellImage(
        ctx as unknown as CanvasRenderingContext2D,
        decoded,
        { x: 0, y: 0, width: 145, height: 105 },
        undefined,
        undefined,
        image,
      );
    paint();
    paint();
    expect(composite).toHaveBeenCalledOnce();
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(ctx.drawImage.mock.calls.every((call) => call[0] === raster)).toBe(true);
    expect(sourceContext.drawImage).toHaveBeenCalledOnce();
    expect(allocate).not.toHaveBeenCalled();
  });

  test("tiny cells and maximal local frames keep containment finite without new surfaces", () => {
    const image = framedCellPicture(),
      ctx = context();
    image.frame.size = { width: 10000, height: 10000 };
    const allocate = vi.spyOn(document, "createElement");
    paintCellImage(
      ctx as unknown as CanvasRenderingContext2D,
      decoded,
      { x: 0, y: 0, width: 10, height: 10 },
      undefined,
      undefined,
      image,
    );
    expect(ctx.drawImage).not.toHaveBeenCalled();
    paintCellImage(
      ctx as unknown as CanvasRenderingContext2D,
      decoded,
      { x: 0, y: 0, width: 11, height: 11 },
      undefined,
      undefined,
      image,
    );
    const [scale] = ctx.scale.mock.calls[0]!;
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(1 / 10000);
    expect(ctx.translate.mock.calls.flat().every(Number.isFinite)).toBe(true);
    expect(allocate).not.toHaveBeenCalled();
  });
});
