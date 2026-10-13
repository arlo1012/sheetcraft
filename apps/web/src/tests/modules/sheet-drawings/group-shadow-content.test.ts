import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick, reactive, shallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { isShapeGroupDrawing, type ShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import ShapeGroupDetailedContent from "../../../modules/sheet-drawings/components/ShapeGroupDetailedContent.vue";
import {
  planShapeGroupPaint,
  type ShapeGroupPaintOptions,
  type ShapeGroupPaintResult,
} from "../../../modules/sheet-drawings/shape-group-paint";
import { getShapeGroupPaintFragments } from "../../../modules/sheet-drawings/shape-group-fragments";
import * as groupPaint from "../../../modules/sheet-drawings/shape-group-paint";
import { getShapePresentationAllocatedBytes } from "../../../modules/sheet-drawings/shape-detailed-presentation";
import type { CanvasImageCache } from "../../../modules/sheet-grid/canvas/image-painter";
import { createAppI18n } from "../../../shared/i18n";
import { framedShape } from "./framed-shape-fixture";
import { shapePageFixture } from "./shape-page-fixture";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";

const boundary = vi.hoisted(() => ({ prepare: vi.fn(), images: vi.fn(), font: vi.fn() }));
vi.mock("../../../modules/sheet-drawings/shape-group-paint", async (original) => ({
  ...(await original<typeof import("../../../modules/sheet-drawings/shape-group-paint")>()),
  prepareShapeGroupPaint: boundary.prepare,
}));
vi.mock("../../../modules/sheet-grid/canvas/image-painter", () => ({
  createCanvasImageCache: boundary.images,
}));
vi.mock("../../../modules/sheet-drawings/shape-text-runtime", async (original) => ({
  ...(await original<typeof import("../../../modules/sheet-drawings/shape-text-runtime")>()),
  ensureDrawingShapeTextFont: boundary.font,
}));

type Ready = Extract<ShapeGroupPaintResult, { kind: "ready" }>;
type PixelSurface = { width: number; height: number; data: Uint8ClampedArray };
let pixels = new WeakMap<HTMLCanvasElement, PixelSurface>();
function surface(canvas: HTMLCanvasElement): PixelSurface {
  let value = pixels.get(canvas);
  if (!value || value.width !== canvas.width || value.height !== canvas.height) {
    value = {
      width: canvas.width,
      height: canvas.height,
      data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
    };
    pixels.set(canvas, value);
  }
  return value;
}
const rasters: Ready[] = [];
const wrappers = new Set<VueWrapper>();
const caches: (CanvasImageCache & { notify: () => void })[] = [];
function prepared(options: ShapeGroupPaintOptions, alpha = 173): Ready {
  const plan = planShapeGroupPaint(options);
  if (plan.kind !== "ready") throw new Error("The test requires a complete group plan.");
  const canvas = document.createElement("canvas");
  canvas.width = plan.widthRaster;
  canvas.height = plan.heightRaster;
  for (let index = 3; index < surface(canvas).data.length; index += 4)
    surface(canvas).data[index] = alpha;
  let disposed = false;
  const result: Ready = {
    ...plan,
    canvas,
    dispose: vi.fn(() => {
      if (disposed) return;
      disposed = true;
      canvas.width = canvas.height = 0;
    }),
  };
  rasters.push(result);
  return result;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function root(id = "g", x = 80, y = 40, width = 160, height = 100): ShapeGroupDrawing {
  const a = framedShape(),
    b = framedShape();
  a.id = `${id}-a`;
  b.id = `${id}-b`;
  a.text = b.text = "";
  a.rotation = b.rotation = 0;
  a.shapeFrame.anchor = { mode: "fixed", x, y, size: { width: width / 2, height } };
  b.shapeFrame.anchor = { mode: "fixed", x: x + width / 2, y, size: { width: width / 2, height } };
  const grouped = groupShapeRoots([a, b], [a.id, b.id], { id, name: id }, metrics())[0];
  if (!isShapeGroupDrawing(grouped)) throw new Error("Expected owned group.");
  grouped.groupEffects = {
    shadow: {
      kind: "value",
      value: {
        kind: "outer",
        color: { kind: "rgb", rgb: "#000000" },
        opacity: 1,
        blurPt: 0,
        distancePt: 3,
        angleDeg: 0,
        scale: 1,
        anchor: "center",
      },
    },
  };
  return grouped;
}
function metrics() {
  return createPictureSheetMetrics(createSheet("Groups", "s"));
}
function layout(frozen = false, scroll = { x: 0, y: 0 }): SheetViewportLayout {
  return createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 30,
      columnCount: 12,
      rowHeight: 24,
      columnWidth: 80,
    }),
    rows: createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 }),
    viewportSize: { width: 700, height: 500 },
    ...(frozen ? { freeze: { columns: 2, rows: 3 }, bodyScrollPosition: scroll } : {}),
  });
}
function render(source = root(), extra: Record<string, unknown> = {}) {
  const wrapper = mount(ShapeGroupDetailedContent, {
    props: {
      root: source,
      metrics: metrics(),
      layout: layout(),
      density: 1,
      stackIndex: 2,
      ...extra,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.add(wrapper);
  return wrapper;
}
function unmount(wrapper: VueWrapper) {
  wrapper.unmount();
  wrappers.delete(wrapper);
}
function latest(wrapper: VueWrapper) {
  return wrapper.emitted("paint")?.at(-1)?.[0] as Ready | undefined;
}
async function settle() {
  await nextTick();
  await nextTick();
  await nextTick();
  await nextTick();
}
let allocatedBefore = 0;
beforeEach(() => {
  allocatedBefore = getShapePresentationAllocatedBytes();
  pixels = new WeakMap();
  caches.length = rasters.length = 0;
  boundary.prepare.mockReset().mockImplementation(prepared);
  boundary.font.mockReset().mockResolvedValue(undefined);
  boundary.images.mockReset().mockImplementation((notify: () => void) => {
    const image = { naturalWidth: 8, naturalHeight: 8 } as HTMLImageElement;
    const cache = {
      notify,
      get: vi.fn(() => image),
      peek: vi.fn(() => image),
      state: vi.fn(() => "ready" as const),
      load: vi.fn(async () => {}),
      retain: vi.fn(),
      dispose: vi.fn(),
    };
    caches.push(cache);
    return cache;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return {
        clearRect: vi.fn(() => surface(this).data.fill(0)),
        drawImage: vi.fn((source: HTMLCanvasElement) => {
          if (!source.width || !source.height) throw new Error("Disposed group source.");
          surface(this).data.set(surface(source).data);
        }),
        getImageData: vi.fn(() => ({ data: surface(this).data.slice() })),
      } as unknown as CanvasRenderingContext2D;
    },
  );
});
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.clear();
  for (const raster of rasters) expect([raster.canvas.width, raster.canvas.height]).toEqual([0, 0]);
  expect(getShapePresentationAllocatedBytes()).toBe(allocatedBefore);
  vi.restoreAllMocks();
});

describe("owned group Shadow component presentation", () => {
  test("watches the whole-sheet pass by identity without reading unrelated camera extras", async () => {
    let reads = 0;
    const extra = Object.defineProperty({}, "probe", {
      enumerable: true,
      get: () => ++reads,
    });
    const camera = {
      ...createGraphicDrawing("camera", "wordArt", "Camera", { row: 0, column: 0 }),
      kind: "camera" as const,
      camera: {
        range: { start: { row: 0, column: 0, extra }, end: { row: 0, column: 0 } },
        gridLines: false,
      },
    };
    const source = reactive(root()),
      m = reactive(metrics()),
      drawings = [source, camera];
    const pass = resolveShapeForestForRender({ drawings, metrics: m, revision: 0 });
    const currentPass = shallowRef(pass),
      viewport = layout();
    // Pass via a real parent render: test-utils' mount props inspection would
    // itself read optional accessors before Vue starts the child watchers.
    const host = mount(
      defineComponent({
        setup: () => () =>
          h(ShapeGroupDetailedContent, {
            root: source,
            metrics: m,
            layout: viewport,
            density: 1,
            stackIndex: 2,
            renderPass: currentPass.value,
          }),
      }),
      { global: { plugins: [createAppI18n("en-US")] } },
    );
    wrappers.add(host);
    const wrapper = host.findComponent(ShapeGroupDetailedContent);
    await settle();
    expect(reads).toBe(0);
    expect(boundary.prepare).toHaveBeenCalledOnce();
    expect(latest(wrapper)?.renderPass).toBe(pass);
    const next = resolveShapeForestForRender({ drawings, metrics: m, revision: 1 });
    currentPass.value = next;
    await settle();
    expect(boundary.prepare).toHaveBeenCalledTimes(2);
    expect(latest(wrapper)?.renderPass).toBe(next);
    expect(reads).toBe(0);
    expect(Object.isFrozen(extra)).toBe(false);
  });
  test("pane copies share the remaining raster budget and retry the complete owner at lower density", async () => {
    vi.spyOn(groupPaint, "getShapeGroupPaintAvailableBytes")
      .mockReturnValueOnce(0)
      .mockReturnValue(64 * 1024 * 1024);
    const source = reactive(root()),
      before = JSON.stringify(source.shapeFrame),
      wrapper = render(source, { layout: layout(true) });
    await settle();
    expect(boundary.prepare).toHaveBeenCalledTimes(2);
    expect(boundary.prepare.mock.calls[1]![0].density).toBeLessThan(1);
    expect(rasters[0]!.dispose).toHaveBeenCalled();
    expect(latest(wrapper)).toBe(rasters[1]);
    expect(JSON.stringify(source.shapeFrame)).toBe(before);
    expect(
      wrapper
        .findAll("canvas")
        .every((node) => (node.element as HTMLCanvasElement).width === rasters[1]!.canvas.width),
    ).toBe(true);
  });
  test("an exhausted shared pane budget releases every bounded retry without publishing partial pixels", async () => {
    vi.spyOn(groupPaint, "getShapeGroupPaintAvailableBytes").mockReturnValue(0);
    const wrapper = render();
    await settle();
    expect(boundary.prepare).toHaveBeenCalledTimes(6);
    for (const result of rasters) expect(result.dispose).toHaveBeenCalled();
    expect(latest(wrapper)).toBeUndefined();
    expect(wrapper.get('[role="status"]').text()).toContain("raster budget");
  });
  test("copies the complete source to every frozen pane with exact ownership, ink bounds and stack markers", async () => {
    const source = reactive(root()),
      m = reactive(metrics()),
      viewport = layout(true, { x: 13, y: 7 });
    const wrapper = render(source, { metrics: m, layout: viewport });
    expect(boundary.prepare).not.toHaveBeenCalled();
    await settle();
    const result = latest(wrapper)!;
    expect(result.sourceRoot).toBe(source);
    expect(result.metrics).toBe(m);
    expect(boundary.prepare).toHaveBeenCalledOnce();
    expect(boundary.prepare.mock.calls[0]![0]).toMatchObject({
      root: source,
      metrics: m,
      interactive: true,
    });
    const fragments = getShapeGroupPaintFragments(result.layout, result.logicalBounds, viewport, m);
    expect(fragments.map((fragment) => fragment.paneId)).toEqual([
      "topLeft",
      "top",
      "left",
      "body",
    ]);
    const owners = wrapper.findAll('[data-shape-group-paint="g"]');
    expect(owners).toHaveLength(4);
    owners.forEach((owner, index) => {
      const fragment = fragments[index]!,
        canvas = owner.get("canvas").element as HTMLCanvasElement;
      expect(owner.attributes("data-sheet-drawing-id")).toBe("g");
      expect(owner.attributes("tabindex")).toBe("0");
      expect((owner.element as HTMLElement).style.zIndex).toBe("6");
      expect((owner.element as HTMLElement).style.left).toBe(`${fragment.clippedRect.x}px`);
      expect((owner.element as HTMLElement).style.width).toBe(`${fragment.clippedRect.width}px`);
      expect(canvas).not.toBe(result.canvas);
      expect([canvas.width, canvas.height]).toEqual([result.canvas.width, result.canvas.height]);
      expect(surface(canvas).data).toEqual(surface(result.canvas).data);
      expect(canvas.style.left).toBe(`${result.logicalBounds.left}px`);
      expect(canvas.style.width).toBe(`${result.canvas.width / result.actualDensity}px`);
    });
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(new Set(owners.map((owner) => owner.get("canvas").element)).size).toBe(4);
  });

  test("page-band copies retain their complete source through clipping and release retired page canvases", async () => {
    const f = shapePageFixture(),
      page = f.projection.getPage(0, 0)!;
    const source = root("paged", page.sheetRect.width - 100, page.sheetRect.height - 60, 200, 120);
    const wrapper = render(source, {
      metrics: f.metrics,
      layout: f.viewport,
      pageProjection: f.projection,
    });
    await settle();
    const result = latest(wrapper)!,
      fragments = getShapeGroupPaintFragments(
        result.layout,
        result.logicalBounds,
        f.viewport,
        f.metrics,
        f.projection,
      );
    expect(fragments.length).toBeGreaterThan(1);
    expect(new Set(fragments.map((fragment) => fragment.pageKey)).size).toBe(fragments.length);
    expect(wrapper.findAll("canvas")).toHaveLength(fragments.length);
    const previous = wrapper.findAll("canvas").map((canvas) => canvas.element as HTMLCanvasElement);
    await wrapper.setProps({ layout: f.layout({ x: 0, y: 2000 }, { width: 500, height: 500 }) });
    await settle();
    expect(result.dispose).toHaveBeenCalled();
    expect(previous.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(wrapper.findAll("canvas")).toHaveLength(0);
  });

  test("waits for all real-leaf fonts and assets; replacing owner cancels stale asynchronous resource completion", async () => {
    const source = root("old");
    const leaf = source.members[0]!;
    if (leaf.kind === "shapeGroup") throw new Error("Expected leaf.");
    leaf.text = "old text";
    leaf.shapeStyle = {
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
    const font = deferred(),
      image = deferred();
    boundary.font.mockImplementationOnce(() => font.promise);
    boundary.images.mockImplementationOnce((notify: () => void) => {
      const loaded = { naturalWidth: 8, naturalHeight: 8 } as HTMLImageElement;
      const cache = {
        notify,
        get: vi.fn(() => loaded),
        peek: vi.fn(() => loaded),
        load: vi.fn(() => image.promise),
        retain: vi.fn(),
        dispose: vi.fn(),
      };
      caches.push(cache);
      return cache;
    });
    const wrapper = render(source, { assetUrls: new Map([["texture", "blob:old-texture"]]) });
    expect(caches[0]!.retain).toHaveBeenCalledWith(new Set(["blob:old-texture"]));
    expect(caches[0]!.load).toHaveBeenCalledWith("blob:old-texture");
    expect(boundary.font).toHaveBeenCalledOnce();
    font.resolve();
    await settle();
    expect(boundary.prepare).not.toHaveBeenCalled();
    const replacement = reactive(root("new"));
    await wrapper.setProps({ root: replacement, assetUrls: new Map() });
    await settle();
    const current = latest(wrapper)!;
    expect(current.sourceRoot).toBe(replacement);
    expect(caches[0]!.retain).toHaveBeenLastCalledWith(new Set());
    image.resolve();
    await settle();
    expect(boundary.prepare).toHaveBeenCalledOnce();
    expect(latest(wrapper)).toBe(current);
    expect(current.dispose).not.toHaveBeenCalled();
    expect(wrapper.find('[data-shape-group-paint="old"]').exists()).toBe(false);
  });

  test("a reactive leaf edit invalidates old complete paint before republishing the same exact owner", async () => {
    const source = reactive(root()),
      wrapper = render(source);
    await settle();
    const first = latest(wrapper)!,
      events = wrapper.emitted("paint")!.length;
    source.members[0]!.rotation = 23;
    await settle();
    const current = latest(wrapper)!;
    expect(first.dispose).toHaveBeenCalled();
    expect(current).not.toBe(first);
    expect(current.sourceRoot).toBe(source);
    expect(current.snapshotRoot.members[0]!.rotation).toBe(23);
    expect(
      wrapper
        .emitted("paint")!
        .slice(events)
        .map((event) => event[0]),
    ).toEqual([undefined, current]);
  });

  test("partial raster unavailability clears all stale copies and never publishes an incomplete owner", async () => {
    const source = reactive(root()),
      wrapper = render(source);
    await settle();
    const first = latest(wrapper)!,
      canvases = wrapper.findAll("canvas").map((node) => node.element as HTMLCanvasElement);
    boundary.prepare.mockReturnValue({
      kind: "unavailable",
      reason: "asset-pixels-unavailable",
      missingAssetIds: ["late-leaf"],
    });
    source.members[1]!.rotation = 15;
    await settle();
    expect(first.dispose).toHaveBeenCalled();
    expect(latest(wrapper)).toBeUndefined();
    expect(wrapper.get('[role="status"]').text()).toContain("This group cannot be fully displayed");
    expect(
      canvases.every(
        (canvas) => canvas.width === 0 && canvas.height === 0 && canvas.style.display === "none",
      ),
    ).toBe(true);
  });

  test("a missing group asset fails before raster allocation and keeps an accessible owner surface", async () => {
    const source = root(),
      leaf = source.members[0]!;
    if (leaf.kind === "shapeGroup") throw new Error("Expected leaf.");
    leaf.shapeStyle = {
      fill: {
        kind: "value",
        value: {
          kind: "picture",
          assetId: "missing",
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
    const wrapper = render(source);
    await settle();
    expect(boundary.prepare).not.toHaveBeenCalled();
    expect(caches[0]!.load).not.toHaveBeenCalled();
    expect(latest(wrapper)).toBeUndefined();
    expect(wrapper.get('[data-sheet-drawing-id="g"] [role="status"]').text()).toContain(
      "This group cannot be fully displayed",
    );
  });

  test("unmount after publication releases source, pane memory and image cache; queued refresh cannot republish", async () => {
    const wrapper = render();
    await settle();
    const result = latest(wrapper)!,
      canvases = wrapper.findAll("canvas").map((node) => node.element as HTMLCanvasElement);
    const pending = deferred();
    caches[0]!.load = vi.fn(() => pending.promise);
    caches[0]!.notify();
    unmount(wrapper);
    await settle();
    pending.resolve();
    await settle();
    expect(result.dispose).toHaveBeenCalled();
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(caches[0]!.dispose).toHaveBeenCalledOnce();
    expect(boundary.prepare).toHaveBeenCalledOnce();
    expect(latest(wrapper)).toBeUndefined();
  });

  test("unmount while a font is pending never creates a group raster or publishes stale ownership", async () => {
    const source = root(),
      leaf = source.members[0]!;
    if (leaf.kind === "shapeGroup") throw new Error("Expected leaf.");
    leaf.text = "pending";
    const pending = deferred();
    boundary.font.mockReturnValue(pending.promise);
    const wrapper = render(source),
      canvases = wrapper.findAll("canvas").map((node) => node.element as HTMLCanvasElement);
    unmount(wrapper);
    pending.resolve();
    await settle();
    expect(boundary.prepare).not.toHaveBeenCalled();
    expect(caches[0]!.dispose).toHaveBeenCalledOnce();
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(wrapper.emitted("paint")!.every((event) => event[0] === undefined)).toBe(true);
  });
});
