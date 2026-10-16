import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import ShapeDetailedContent from "../../../modules/sheet-drawings/components/ShapeDetailedContent.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import type {
  ShapeDetailedPaintOptions,
  ShapeDetailedPaintRaster,
} from "../../../modules/sheet-drawings/shape-detailed-paint";
import {
  detailedShapeContainsWorldPoint,
  releaseShapePresentationCanvas,
  resizeShapePresentationCanvas,
  type ShapeDetailedPresentation,
} from "../../../modules/sheet-drawings/shape-detailed-presentation";
import type { CanvasImageCache } from "../../../modules/sheet-grid/canvas/image-painter";
import { createAppI18n } from "../../../shared/i18n";

const boundary = vi.hoisted(() => ({ prepare: vi.fn(), createImages: vi.fn() }));
vi.mock("../../../modules/sheet-drawings/shape-detailed-paint", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../modules/sheet-drawings/shape-detailed-paint")
  >()),
  prepareShapeDetailedPaint: boundary.prepare,
}));
vi.mock("../../../modules/sheet-grid/canvas/image-painter", () => ({
  createCanvasImageCache: boundary.createImages,
}));

type ImageState = "loading" | "ready" | "error";
type ImageHarness = CanvasImageCache & {
  notify: () => void;
  states: Map<string, ImageState>;
};
type PixelSurface = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  context: {
    clearRect: Mock<() => void>;
    drawImage: Mock<(source: HTMLCanvasElement) => void>;
    getImageData: Mock<(x: number, y: number, width: number, height: number) => ImageData>;
  };
};

// Only the Canvas pixel boundary is synthetic: the component's Vue scheduling,
// watcher, copy ownership, presentation budget and teardown remain production code.
function pixelSurface(canvas: HTMLCanvasElement): PixelSurface {
  const existing = pixels.get(canvas);
  if (existing) return existing;
  const surface = {
    width: canvas.width,
    height: canvas.height,
    data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
    context: {
      clearRect: vi.fn(() => {
        syncPixels(canvas).data.fill(0);
      }),
      drawImage: vi.fn((source: HTMLCanvasElement) => {
        if (!source.width || !source.height) throw new Error("Cannot copy an evicted raster.");
        syncPixels(canvas).data.set(syncPixels(source).data);
      }),
      getImageData: vi.fn((x: number, y: number, width: number, height: number) => {
        const source = syncPixels(canvas);
        const data = new Uint8ClampedArray(width * height * 4);
        for (let row = 0; row < height; row++)
          for (let column = 0; column < width; column++) {
            const offset = ((y + row) * canvas.width + x + column) * 4;
            data.set(source.data.subarray(offset, offset + 4), (row * width + column) * 4);
          }
        return { data } as ImageData;
      }),
    },
  };
  pixels.set(canvas, surface);
  return surface;
}
let pixels = new WeakMap<HTMLCanvasElement, PixelSurface>();
function syncPixels(canvas: HTMLCanvasElement): PixelSurface {
  const surface = pixelSurface(canvas);
  if (surface.width !== canvas.width || surface.height !== canvas.height) {
    surface.width = canvas.width;
    surface.height = canvas.height;
    surface.data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  }
  return surface;
}
function alpha(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data[3];
}
function ready(options: ShapeDetailedPaintOptions, opacity = 255): ShapeDetailedPaintRaster {
  const canvas = document.createElement("canvas");
  canvas.width = options.drawing.width * options.density;
  canvas.height = options.drawing.height * options.density;
  const surface = pixelSurface(canvas);
  for (let offset = 3; offset < surface.data.length; offset += 4) surface.data[offset] = opacity;
  return {
    kind: "ready",
    canvas,
    actualDensity: options.density,
    logicalBounds: {
      left: 0,
      top: 0,
      right: options.drawing.width,
      bottom: options.drawing.height,
    },
  } as ShapeDetailedPaintRaster;
}
function unavailable(): ShapeDetailedPaintRaster {
  return {
    kind: "unavailable",
    reason: "asset-unavailable",
    missingAssetIds: ["texture"],
  } as unknown as ShapeDetailedPaintRaster;
}
function drawing(id = "shape"): SheetGraphicDrawing {
  return {
    ...createGraphicDrawing(id, "shape", id, { row: 0, column: 0 }),
    width: 4,
    height: 3,
    offsetX: 0,
    offsetY: 0,
    shapeStyle: { softEdges: { kind: "value", value: { sizePt: 1 } } },
  };
}
function texture(): ShapeDetailedStyle {
  return {
    fill: {
      kind: "value",
      value: {
        kind: "picture",
        assetId: "texture",
        opacity: 1,
        rotateWithShape: true,
        layout: {
          kind: "stretch",
          offsetXRatio: 0,
          offsetYRatio: 0,
          widthRatio: 1,
          heightRatio: 1,
        },
      },
    },
  };
}
const wrappers = new Set<VueWrapper>();
let images: ImageHarness[] = [];
function render(source: SheetGraphicDrawing, assetUrls?: ReadonlyMap<string, string>) {
  const wrapper = mount(ShapeDetailedContent, {
    props: { drawing: source, assetUrls },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.add(wrapper);
  return wrapper;
}
function unmount(wrapper: VueWrapper) {
  wrapper.unmount();
  wrappers.delete(wrapper);
}
function latestPaint(wrapper: VueWrapper) {
  return wrapper.emitted("paint")?.at(-1)?.[0] as ShapeDetailedPresentation | undefined;
}
async function settlePaint() {
  // A watcher schedules render, render awaits its own nextTick, and ready updates
  // schedule the template. Keep every stage real rather than flushing a fake timer.
  await nextTick();
  await nextTick();
  await nextTick();
}
beforeEach(() => {
  pixels = new WeakMap();
  images = [];
  boundary.prepare.mockReset().mockImplementation(ready);
  boundary.createImages.mockReset().mockImplementation((notify: () => void) => {
    const states = new Map<string, ImageState>();
    const image = { naturalWidth: 8, naturalHeight: 8 } as HTMLImageElement;
    const cache: ImageHarness = {
      notify,
      states,
      get: vi.fn((url: string) => {
        if (!states.has(url)) states.set(url, "loading");
        return states.get(url) === "ready" ? image : undefined;
      }),
      peek: vi.fn((url: string) => (states.get(url) === "ready" ? image : undefined)),
      state: vi.fn((url: string) => states.get(url)),
      load: vi.fn(async () => {}),
      retain: vi.fn((urls: ReadonlySet<string>) => {
        for (const url of states.keys()) if (!urls.has(url)) states.delete(url);
      }),
      dispose: vi.fn(() => states.clear()),
    };
    images.push(cache);
    return cache;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return pixelSurface(this).context as unknown as CanvasRenderingContext2D;
    },
  );
});
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.clear();
  vi.restoreAllMocks();
});

describe("detailed shape component raster lifecycle", () => {
  test.each(["ready", "missing", "decode-error"] as const)(
    "texture URL preparation stays loading until %s settles",
    async (outcome) => {
      boundary.prepare.mockImplementation(unavailable);
      const wrapper = render({ ...drawing(), shapeStyle: texture() });
      await wrapper.setProps({ loadingAssetIds: new Set(["texture"]) });
      await settlePaint();
      expect(wrapper.get('[role="status"]').text()).toBe("Preparing image…");
      expect(latestPaint(wrapper)).toBeUndefined();

      if (outcome === "missing") {
        // A failed read may be marked missing before the loader's batch finishes.
        await wrapper.setProps({ missingAssetIds: new Set(["texture"]) });
      } else {
        const url = "blob:prepared-texture";
        images[0]!.states.set(url, outcome === "ready" ? "ready" : "error");
        if (outcome === "ready") boundary.prepare.mockImplementation(ready);
        await wrapper.setProps({
          assetUrls: new Map([["texture", url]]),
          // Loader pending must not hide an already failed browser decode.
          loadingAssetIds: new Set(["texture"]),
        });
      }
      await settlePaint();
      if (outcome === "ready") {
        expect(wrapper.find('[role="status"]').exists()).toBe(false);
        expect(latestPaint(wrapper)).toBeDefined();
      } else {
        expect(wrapper.get('[role="status"]').text()).toBe("The image file is unavailable.");
        expect(latestPaint(wrapper)).toBeUndefined();
      }
    },
  );

  test("batch 33 evicts the first shared raster during nextTick without losing its owned pixels", async () => {
    const shared = new Map<string, ShapeDetailedPaintRaster>();
    let evicted: HTMLCanvasElement | undefined;
    boundary.prepare.mockImplementation((options: ShapeDetailedPaintOptions) => {
      const raster = ready(options, shared.size + 10);
      if (shared.size === 32) {
        const firstKey = shared.keys().next().value!;
        const first = shared.get(firstKey)!;
        if (first.kind !== "ready") throw new Error("Expected ready cache entry.");
        evicted = first.canvas;
        first.canvas.width = first.canvas.height = 0;
        shared.delete(firstKey);
      }
      shared.set(options.drawing.id, raster);
      return raster;
    });
    const batch = Array.from({ length: 33 }, (_, index) => render(drawing(`shape-${index}`)));
    // Preparing before the component's await would expose every queued copy to
    // eviction while all 33 initial renders still share the same nextTick.
    expect(boundary.prepare).not.toHaveBeenCalled();
    await settlePaint();
    expect(boundary.prepare).toHaveBeenCalledTimes(33);
    expect(shared.size).toBe(32);
    expect(evicted).toBeDefined();
    expect([evicted!.width, evicted!.height]).toEqual([0, 0]);
    for (const [index, wrapper] of batch.entries()) {
      const presentation = latestPaint(wrapper)!;
      expect(presentation).toBeDefined();
      expect(presentation.canvas).toBe(wrapper.get("canvas").element);
      expect(presentation.canvas).not.toBe(
        shared.get(`shape-${index}`)?.kind === "ready"
          ? (shared.get(`shape-${index}`) as Extract<ShapeDetailedPaintRaster, { kind: "ready" }>)
              .canvas
          : evicted,
      );
      expect([presentation.canvas.width, presentation.canvas.height]).toEqual([4, 3]);
      expect(alpha(presentation.canvas)).toBe(index + 10);
      expect(wrapper.find('[role="status"]').exists()).toBe(false);
      expect(
        detailedShapeContainsWorldPoint(
          presentation.drawing,
          { x: 0, y: 0, width: 4, height: 3 },
          { x: 1, y: 1 },
          presentation,
        ),
      ).toBe(true);
    }
  });

  test.each([
    ["width", 7],
    ["height", 6],
    ["rotation", 37],
    ["fill", "#112233"],
    ["stroke", "#445566"],
    ["strokeWidth", 3],
    ["shapeStyle", { softEdges: { kind: "value", value: { sizePt: 2 } } }],
  ] as const)(
    "reactive drawing %s changes repaint without replacing the drawing",
    async (field, value) => {
      const source = reactive(drawing());
      const wrapper = render(source);
      await settlePaint();
      const owned = latestPaint(wrapper)!.canvas;
      const eventCount = wrapper.emitted("paint")!.length;
      Object.assign(source, { [field]: value });
      await settlePaint();
      expect(boundary.prepare).toHaveBeenCalledTimes(2);
      const options = boundary.prepare.mock.calls[1]![0] as ShapeDetailedPaintOptions;
      expect(options.drawing).toBe(source);
      expect(options.drawing[field]).toEqual(value);
      expect(options.geometry.width).toBe(source.width);
      expect(options.geometry.height).toBe(source.height);
      expect(
        wrapper
          .emitted("paint")!
          .slice(eventCount)
          .map((event) => event[0]),
      ).toEqual([undefined, latestPaint(wrapper)]);
      expect(latestPaint(wrapper)!.canvas).toBe(owned);
      expect(latestPaint(wrapper)!.bounds).toEqual({
        left: 0,
        top: 0,
        width: source.width,
        height: source.height,
      });
      expect([owned.width, owned.height]).toEqual([source.width, source.height]);
      expect(pixelSurface(owned).context.drawImage).toHaveBeenCalledTimes(2);
    },
  );

  test("unmount before the initial nextTick cancels queued paint and disposes image decoding", async () => {
    const wrapper = render(drawing());
    const owned = wrapper.get("canvas").element as HTMLCanvasElement;
    unmount(wrapper);
    await settlePaint();
    expect(boundary.prepare).not.toHaveBeenCalled();
    expect(images[0]!.dispose).toHaveBeenCalledOnce();
    expect([owned.width, owned.height]).toEqual([0, 0]);
    expect(wrapper.emitted("paint")!.every((event) => event[0] === undefined)).toBe(true);
  });

  test("unmount cancels a queued image repaint and releases the real owned-canvas memory lease", async () => {
    const wrapper = render({ ...drawing(), width: 1000, height: 1000 });
    const reservations = Array.from(
      { length: 4 },
      () => ({ width: 0, height: 0 }) as HTMLCanvasElement,
    );
    try {
      await settlePaint();
      const owned = latestPaint(wrapper)!.canvas;
      for (const canvas of reservations.slice(0, 3))
        resizeShapePresentationCanvas(canvas, 2000, 2000);
      expect(() => resizeShapePresentationCanvas(reservations[3]!, 2000, 2000)).toThrow(/budget/);
      const eventCount = wrapper.emitted("paint")!.length;
      images[0]!.notify();
      expect(latestPaint(wrapper)).toBeUndefined();
      unmount(wrapper);
      await settlePaint();
      expect(boundary.prepare).toHaveBeenCalledOnce();
      expect(pixelSurface(owned).context.drawImage).toHaveBeenCalledOnce();
      expect(images[0]!.dispose).toHaveBeenCalledOnce();
      expect([owned.width, owned.height]).toEqual([0, 0]);
      expect(
        wrapper
          .emitted("paint")!
          .slice(eventCount)
          .every((event) => event[0] === undefined),
      ).toBe(true);
      // This allocation can succeed only if teardown returned the component's
      // four-megabyte lease to the production aggregate budget.
      expect(() => resizeShapePresentationCanvas(reservations[3]!, 2000, 2000)).not.toThrow();
    } finally {
      for (const canvas of reservations) releaseShapePresentationCanvas(canvas);
    }
  });

  test.each([
    ["loading", true, "Preparing image…"],
    ["error", true, "The image file is unavailable."],
    ["loading", false, "The image file is unavailable."],
  ] as const)(
    "missing texture (%s, URL=%s) reports truthful status and clears stale alpha",
    async (state, hasUrl, text) => {
      const source = reactive(drawing());
      const url = "blob:shape-texture";
      const wrapper = render(source, hasUrl ? new Map([["texture", url]]) : undefined);
      await settlePaint();
      const previous = latestPaint(wrapper)!;
      expect(alpha(previous.canvas)).toBe(255);
      const eventCount = wrapper.emitted("paint")!.length;
      boundary.prepare.mockImplementation(unavailable);
      images[0]!.states.set(url, state);
      source.shapeStyle = texture();
      await settlePaint();
      expect(wrapper.get('[role="status"]').text()).toBe(text);
      expect((wrapper.get("canvas").element as HTMLCanvasElement).style.display).toBe("none");
      expect(latestPaint(wrapper)).toBeUndefined();
      expect(
        wrapper
          .emitted("paint")!
          .slice(eventCount)
          .every((event) => event[0] === undefined),
      ).toBe(true);
      expect(pixelSurface(previous.canvas).context.drawImage).toHaveBeenCalledOnce();
      expect(
        detailedShapeContainsWorldPoint(
          source,
          { x: 0, y: 0, width: 4, height: 3 },
          { x: 1, y: 1 },
          latestPaint(wrapper),
        ),
      ).toBe(false);
      if (hasUrl) {
        expect(images[0]!.get).toHaveBeenCalledWith(url);
        expect(images[0]!.retain).toHaveBeenLastCalledWith(new Set([url]));
        images[0]!.states.set(url, "ready");
        boundary.prepare.mockImplementation((options: ShapeDetailedPaintOptions) => {
          expect(options.resources!.getAssetImage!("texture")).toBeDefined();
          return ready(options, 200);
        });
        images[0]!.notify();
        await settlePaint();
        expect(wrapper.find('[role="status"]').exists()).toBe(false);
        expect(latestPaint(wrapper)!.canvas).toBe(previous.canvas);
        expect(alpha(latestPaint(wrapper)!.canvas)).toBe(200);
      }
    },
  );
});
