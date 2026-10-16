import { afterEach, expect, test, vi } from "vitest";
import { createSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import type { PictureObjectAppearance } from "@sheetcraft/core/picture-object";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  createFloatingImageCanvasCache,
  paintFloatingImages,
} from "../../../modules/sheet-images/floating-image-painter";
import { createSheetRenderScheduler } from "../../../modules/sheet-grid/rendering/render-scheduler";
import * as compositor from "../../../shared/images/picture-detailed-compositor";
import { clearPictureDetailedPaintCache } from "../../../shared/images/picture-detailed-render";

class FakeImage {
  static instances: FakeImage[] = [];
  complete = false;
  naturalWidth = 0;
  naturalHeight = 0;
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.instances.push(this);
  }
  async finish(success: boolean) {
    await Promise.resolve();
    this.complete = true;
    this.naturalWidth = success ? 200 : 0;
    this.naturalHeight = success ? 160 : 0;
    (success ? this.onload : this.onerror)?.();
  }
}
afterEach(() => {
  clearPictureDetailedPaintCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeImage.instances = [];
});
function textureTransform(two = false): PictureObjectAppearance {
  const paint = {
    kind: "picture" as const,
    assetId: "texture",
    opacity: 1,
    rotateWithShape: true,
    layout: {
      kind: "stretch" as const,
      offsetXRatio: 0,
      offsetYRatio: 0,
      widthRatio: 1,
      heightRatio: 1,
    },
  };
  return {
    appearance: {
      detailedStyle: {
        fill: { kind: "value", value: paint },
        ...(two
          ? {
              line: {
                kind: "value" as const,
                value: {
                  paint: { ...paint, assetId: "line" },
                  widthPt: 1,
                  compound: "single" as const,
                  dash: "solid" as const,
                  cap: "butt" as const,
                  join: "round" as const,
                  miterLimit: 4,
                },
              },
            }
          : {}),
      },
    },
  };
}
function fixture(kind: "legacy" | "framed" = "legacy", transform?: PictureObjectAppearance) {
  vi.stubGlobal("Image", FakeImage);
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 1, columns: 1 },
    viewportSize: { width: 400, height: 300 },
  });
  const frameContext = {
    layout,
    metrics: createPictureViewMetrics(createSheet("Synthetic", "sheet"), geometry, rows),
  };
  const picture: FloatingImage =
    kind === "legacy"
      ? {
          id: "picture",
          assetId: "source",
          altText: "Synthetic",
          anchor: { row: 0, column: 0 },
          offsetX: 40,
          offsetY: 10,
          width: 100,
          height: 50,
          transform,
        }
      : {
          id: "picture",
          assetId: "source",
          altText: "Synthetic",
          frame: {
            kind: "object-frame-v1",
            anchor: { mode: "fixed", x: 40, y: 10, size: { width: 100, height: 50 } },
            source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
            angleDeg: 0,
          },
          transform,
        };
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
    globalAlpha: 1,
  };
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  const urls = new Map<string, string>(),
    loading = new Set<string>();
  const cache = createFloatingImageCanvasCache(() => scheduler.invalidate());
  const paint = vi.fn(() =>
    paintFloatingImages(context as unknown as CanvasRenderingContext2D, {
      state: { images: [picture], revision: 1 },
      layout,
      frameContext,
      assetUrls: urls,
      loadingAssetIds: loading,
      cache,
      palette: {
        placeholderBackground: "#eee",
        placeholderStripe: "#ddd",
        placeholderBorder: "#ccc",
        placeholderText: "#666",
      },
      loadingLabel: "Loading",
      unavailableLabel: "Unavailable",
    }),
  );
  const scheduler = createSheetRenderScheduler(
    paint,
    (callback) => {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    (id) => {
      frames.delete(id);
    },
  );
  const flush = () => {
    expect(frames.size).toBe(1);
    const [id, callback] = frames.entries().next().value!;
    frames.delete(id);
    context.fillText.mockClear();
    context.drawImage.mockClear();
    callback(0);
  };
  const redraw = () => {
    scheduler.invalidate();
    flush();
  };
  const source = (id: string) => {
    const found = FakeImage.instances.find((image) => image.src === `blob:${id}`);
    if (!found) throw Error(`Missing source ${id}`);
    return found;
  };
  return {
    picture,
    context,
    urls,
    loading,
    cache,
    scheduler,
    frames,
    paint,
    flush,
    redraw,
    source,
  };
}
function label(f: ReturnType<typeof fixture>, value: string) {
  expect(f.context.fillText.mock.calls.length).toBeGreaterThan(0);
  expect(f.context.fillText.mock.calls.every((call) => call[0] === value)).toBe(true);
  expect(f.context.drawImage).not.toHaveBeenCalled();
}
function interceptRaster() {
  return vi.spyOn(compositor, "createDetailedPictureRaster").mockImplementation((options) => ({
    ...compositor.planDetailedPictureRaster(options),
    kind: "ready",
    canvas: { width: 100, height: 50 } as HTMLCanvasElement,
  }));
}

test.each(["legacy", "framed"] as const)(
  "%s source uses both read/decode stages and load invalidates the real scheduler",
  async (kind) => {
    const f = fixture(kind);
    f.loading.add("source");
    f.redraw();
    label(f, "Loading");
    expect(FakeImage.instances).toHaveLength(0);
    f.urls.set("source", "blob:source");
    f.loading.clear();
    f.redraw();
    label(f, "Loading");
    expect(FakeImage.instances).toHaveLength(1);
    await f.source("source").finish(true);
    // No manual invalidation: the cache load callback schedules the next paint.
    f.flush();
    expect(f.context.fillText).not.toHaveBeenCalled();
    expect(f.context.drawImage).toHaveBeenCalled();
    expect(FakeImage.instances).toHaveLength(1);
    f.scheduler.dispose();
    f.cache.dispose();
  },
);

test.each(["legacy", "framed"] as const)(
  "%s source error repaints unavailable and never loops or hides behind stale loading",
  async (kind) => {
    const f = fixture(kind);
    f.urls.set("source", "blob:source");
    f.redraw();
    label(f, "Loading");
    await f.source("source").finish(false);
    f.loading.add("source");
    f.flush();
    label(f, "Unavailable");
    f.redraw();
    label(f, "Unavailable");
    expect(FakeImage.instances).toHaveLength(1);
    expect(f.frames.size).toBe(0);
    f.scheduler.dispose();
    f.cache.dispose();
  },
);

test.each([true, false])(
  "texture decode outcome %s invalidates and paints ready or terminal unavailable",
  async (success) => {
    const raster = interceptRaster(),
      f = fixture("framed", textureTransform());
    f.urls.set("source", "blob:source");
    f.loading.add("texture");
    f.redraw();
    await f.source("source").finish(true);
    f.flush();
    label(f, "Loading");
    expect(raster).not.toHaveBeenCalled();
    f.urls.set("texture", "blob:texture");
    f.loading.clear();
    f.redraw();
    label(f, "Loading");
    await f.source("texture").finish(success);
    f.flush();
    if (success) {
      expect(f.context.fillText).not.toHaveBeenCalled();
      expect(f.context.drawImage).toHaveBeenCalled();
      expect(raster).toHaveBeenCalled();
    } else {
      label(f, "Unavailable");
      expect(raster).not.toHaveBeenCalled();
      f.redraw();
      label(f, "Unavailable");
    }
    expect(FakeImage.instances).toHaveLength(2);
    f.scheduler.dispose();
    f.cache.dispose();
  },
);

test("a failed texture wins over another pending texture", async () => {
  const raster = interceptRaster(),
    f = fixture("legacy", textureTransform(true));
  for (const id of ["source", "texture", "line"]) f.urls.set(id, `blob:${id}`);
  f.redraw();
  await f.source("source").finish(true);
  f.flush();
  label(f, "Loading");
  await f.source("texture").finish(false);
  f.flush();
  label(f, "Unavailable");
  expect(f.cache.state?.("blob:line")).toBe("loading");
  await f.source("line").finish(true);
  expect(f.frames.size).toBe(1);
  f.flush();
  label(f, "Unavailable");
  expect(raster).not.toHaveBeenCalled();
  f.scheduler.dispose();
  f.cache.dispose();
});

test("first completion events from two pending textures coalesce into one ready repaint", async () => {
  const raster = interceptRaster(),
    f = fixture("framed", textureTransform(true));
  for (const id of ["source", "texture", "line"]) f.urls.set(id, `blob:${id}`);
  f.redraw();
  await f.source("source").finish(true);
  f.flush();
  label(f, "Loading");
  expect(f.cache.state?.("blob:texture")).toBe("loading");
  expect(f.cache.state?.("blob:line")).toBe("loading");
  const paintsBefore = f.paint.mock.calls.length;
  await f.source("texture").finish(true);
  await f.source("line").finish(true);
  expect(f.frames.size).toBe(1);
  expect(f.paint).toHaveBeenCalledTimes(paintsBefore);
  f.flush();
  expect(f.paint).toHaveBeenCalledTimes(paintsBefore + 1);
  expect(f.context.fillText).not.toHaveBeenCalled();
  expect(f.context.drawImage).toHaveBeenCalled();
  expect(raster).toHaveBeenCalled();
  expect(f.frames.size).toBe(0);
  f.scheduler.dispose();
  f.cache.dispose();
});

test("missing source or texture is unavailable, while all missing textures still being read are loading", async () => {
  const f = fixture("legacy", textureTransform(true));
  interceptRaster();
  f.redraw();
  label(f, "Unavailable");
  f.urls.set("source", "blob:source");
  f.redraw();
  await f.source("source").finish(true);
  f.flush();
  label(f, "Unavailable");
  f.loading.add("texture");
  f.redraw();
  label(f, "Unavailable");
  f.loading.add("line");
  f.redraw();
  label(f, "Loading");
  f.loading.clear();
  f.redraw();
  label(f, "Unavailable");
  f.scheduler.dispose();
  f.cache.dispose();
});
