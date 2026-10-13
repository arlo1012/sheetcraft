import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import {
  resolveShapeConnectorRoute,
  type ReadyShapeConnectorRoute,
} from "@sheetcraft/core/shape-connector-route";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import StandardShapeContent from "../../../modules/sheet-drawings/components/StandardShapeContent.vue";
import ShapeDetailedContent from "../../../modules/sheet-drawings/components/ShapeDetailedContent.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { getStandardShapeSvgPaths } from "../../../modules/sheet-drawings/shape-geometry";
import { getShapeEndPaint } from "../../../modules/sheet-drawings/shape-line-paint";
import {
  planShapeDetailedPaint,
  type ShapeDetailedPaintOptions,
  type ShapeDetailedPaintRaster,
} from "../../../modules/sheet-drawings/shape-detailed-paint";
import {
  combineShapePresentations,
  detailedShapeLocalBounds,
  type ShapeDetailedPresentation,
} from "../../../modules/sheet-drawings/shape-detailed-presentation";
import {
  createPictureFormat3d,
  createPictureRotation3d,
} from "../../../modules/sheet-images/picture-effect-edit";
import { createAppI18n } from "../../../shared/i18n";

const boundary = vi.hoisted(() => ({
  prepare: vi.fn(),
  plan: vi.fn(),
  createImages: vi.fn(),
  tickDelay: undefined as Promise<void> | undefined,
  releaseTick: undefined as (() => void) | undefined,
}));
vi.mock("../../../modules/sheet-drawings/shape-detailed-paint", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../modules/sheet-drawings/shape-detailed-paint")>();
  boundary.plan.mockImplementation(actual.planShapeDetailedPaint);
  return {
    ...actual,
    prepareShapeDetailedPaint: boundary.prepare,
    planShapeDetailedPaint: boundary.plan,
  };
});
vi.mock("../../../modules/sheet-grid/canvas/image-painter", () => ({
  createCanvasImageCache: boundary.createImages,
}));
vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();
  return {
    ...actual,
    // Keep the actual Vue flush and optionally hold the component's await boundary.
    nextTick: async (callback?: () => void) => {
      if (callback) await actual.nextTick(callback);
      else await actual.nextTick();
      await boundary.tickDelay;
    },
  };
});

const carrier = resolvePictureLayout({ x: 0, y: 0, width: 100, height: 60 }, 0);
const wrappers = new Set<VueWrapper>();
type ImageHarness = {
  notify: () => void;
  get: ReturnType<typeof vi.fn>;
  retain: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};
let images: ImageHarness[] = [];
function ready(reverse = false, span = 12): ReadyShapeConnectorRoute {
  const route = resolveShapeConnectorRoute(
    { preset: "line" },
    carrier,
    { x: reverse ? span : 0, y: 0 },
    { x: reverse ? 0 : span, y: 0 },
  );
  if (route.status !== "ready") throw new Error("Expected a ready Core route.");
  return route;
}
function drawing(route: ReadyShapeConnectorRoute, detailed = false): SheetGraphicDrawing {
  return {
    ...createGraphicDrawing("connector", "shape", "connector", { row: 0, column: 0 }),
    shapeGeometry: { preset: "line" },
    shapeLineEnds: { begin: { kind: "triangle" }, end: { kind: "triangle" } },
    width: route.geometry.width,
    height: route.geometry.height,
    rotation: route.paintLayout.angleDeg,
    ...(detailed
      ? { shapeStyle: { softEdges: { kind: "value", value: { sizePt: 1 } } } as ShapeDetailedStyle }
      : {}),
  };
}
function render(
  source: SheetGraphicDrawing,
  connectorRoute?: ReadyShapeConnectorRoute,
  detailed = false,
) {
  const wrapper = mount(detailed ? ShapeDetailedContent : DrawingContent, {
    props: { drawing: source, connectorRoute },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.add(wrapper);
  return wrapper;
}
async function settle() {
  await nextTick();
  await nextTick();
  await nextTick();
}
function latestPaint(wrapper: VueWrapper, event = "paint") {
  return wrapper.emitted(event)?.at(-1)?.[0] as ShapeDetailedPresentation | undefined;
}
function raster(options: ShapeDetailedPaintOptions): ShapeDetailedPaintRaster {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(options.drawing.width));
  canvas.height = Math.max(1, Math.ceil(options.drawing.height));
  return {
    kind: "ready",
    canvas,
    actualDensity: 1,
    logicalBounds: {
      left: 0,
      top: 0,
      right: options.drawing.width,
      bottom: options.drawing.height,
    },
  } as ShapeDetailedPaintRaster;
}
beforeEach(() => {
  images = [];
  boundary.tickDelay = undefined;
  boundary.releaseTick = undefined;
  boundary.prepare.mockReset().mockImplementation(raster);
  boundary.plan.mockClear();
  boundary.createImages.mockReset().mockImplementation((notify: () => void) => {
    const image = {
      notify,
      get: vi.fn(),
      retain: vi.fn(),
      dispose: vi.fn(),
      peek: vi.fn(),
      state: vi.fn(),
      load: vi.fn(async () => {}),
    };
    images.push(image);
    return image;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      }) as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  boundary.tickDelay = undefined;
  boundary.releaseTick?.();
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.clear();
  vi.restoreAllMocks();
});

describe("ready connector component transport", () => {
  test("owner forwards exact route body and markers even below the legacy marker cutoff", () => {
    const route = ready(false, 2 ** -32),
      source = drawing(route),
      before = structuredClone(source);
    const wrapper = render(source, route);
    expect(wrapper.getComponent(StandardShapeContent).props("connectorRoute")).toBe(route);
    expect(wrapper.get("svg").attributes("viewBox")).toBe("0 0 1 1");
    expect(wrapper.get("[data-standard-shape-path]").attributes("d")).toBe(
      getStandardShapeSvgPaths(route.geometry)[0]!.d,
    );
    expect(wrapper.get("svg g").attributes("transform")).toBeUndefined();
    expect(wrapper.findAll("[data-shape-line-end]").map((path) => path.attributes("d"))).toEqual(
      getShapeEndPaint(source, route.geometry, route).map((paint) => paint.d),
    );
    expect(wrapper.findAll("[data-shape-line-end]")).toHaveLength(2);
    expect(source).toEqual(before);
  });

  test("route-only replacement updates SVG and ordered markers with the same drawing", async () => {
    const first = ready(),
      second = ready(true),
      source = drawing(first);
    const wrapper = render(source, first);
    const previous = wrapper.get("[data-standard-shape-path]").attributes("d");
    await wrapper.setProps({ connectorRoute: second });
    expect(wrapper.get("[data-standard-shape-path]").attributes("d")).not.toBe(previous);
    expect(wrapper.get("[data-standard-shape-path]").attributes("d")).toBe("M12 0.5L0 0.5");
    expect(wrapper.findAll("[data-shape-line-end]").map((path) => path.attributes("d"))).toEqual(
      getShapeEndPaint(source, second.geometry, second).map((paint) => paint.d),
    );
  });

  test("owner, standard and detailed content forward exact route raster options and presentation identity", async () => {
    const first = ready(),
      second = ready(true),
      source = drawing(first, true);
    const wrapper = render(source, first);
    expect(wrapper.getComponent(ShapeDetailedContent).props("connectorRoute")).toBe(first);
    await settle();
    const options = boundary.prepare.mock.calls[0]![0] as ShapeDetailedPaintOptions;
    expect(options.geometry).toBe(first.geometry);
    expect(options.connectorRoute).toBe(first);
    expect(latestPaint(wrapper, "detailedPaint")!.connectorRoute).toBe(first);
    await wrapper.setProps({ connectorRoute: second });
    await settle();
    const nextOptions = boundary.prepare.mock.calls.at(-1)![0] as ShapeDetailedPaintOptions;
    expect(nextOptions.drawing).toBe(options.drawing);
    expect(nextOptions.geometry).toBe(second.geometry);
    expect(nextOptions.connectorRoute).toBe(second);
    expect(latestPaint(wrapper, "detailedPaint")!.connectorRoute).toBe(second);
  });

  test("a route replaced while nextTick is suspended never prepares or emits the stale bundle", async () => {
    const first = ready(),
      second = ready(true),
      source = drawing(first, true);
    boundary.tickDelay = new Promise<void>((resolve) => {
      boundary.releaseTick = resolve;
    });
    const wrapper = render(source, first, true);
    void wrapper.setProps({ connectorRoute: second });
    await Promise.resolve();
    await Promise.resolve();
    expect(wrapper.props("connectorRoute")).toBe(second);
    expect(boundary.prepare).not.toHaveBeenCalled();
    boundary.tickDelay = undefined;
    boundary.releaseTick!();
    await settle();
    expect(boundary.prepare).toHaveBeenCalledOnce();
    expect((boundary.prepare.mock.calls[0]![0] as ShapeDetailedPaintOptions).connectorRoute).toBe(
      second,
    );
    expect(
      wrapper
        .emitted("paint")!
        .every(
          (event) => !event[0] || (event[0] as ShapeDetailedPresentation).connectorRoute === second,
        ),
    ).toBe(true);
  });

  test("route identity filters stale body layers while ordinary presentation combining stays unchanged", () => {
    const first = ready(),
      second = ready(true),
      source = drawing(first);
    const layer = {
      drawing: source,
      canvas: document.createElement("canvas"),
      density: 1,
      bounds: { left: 0, top: 0, width: 12, height: 1 },
    };
    expect(combineShapePresentations(source, [layer])).toBe(layer);
    const routed = { ...layer, connectorRoute: first };
    expect(combineShapePresentations(source, [routed], first)).toBe(routed);
    expect(combineShapePresentations(source, [routed], second)).toBeUndefined();
    expect(combineShapePresentations(source, [routed])).toBeUndefined();
  });

  test("detailed local bounds use the route plan without reevaluating the padded carrier preset", () => {
    const route = ready(),
      source = drawing(route, true);
    const plan = planShapeDetailedPaint({
      drawing: source,
      geometry: route.geometry,
      connectorRoute: route,
      density: 1,
    });
    const bounds = plan.logicalBounds;
    expect(detailedShapeLocalBounds(source, route)).toEqual({
      left: bounds.left,
      top: bounds.top,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top,
    });
    const options = boundary.plan.mock.calls.at(-1)![0] as ShapeDetailedPaintOptions;
    expect(options.geometry).toBe(route.geometry);
    expect(options.connectorRoute).toBe(route);
  });

  test("omitting runtime route retains the ordinary static SVG path", () => {
    const source = drawing(ready());
    const wrapper = render(source);
    expect(wrapper.get("[data-standard-shape-path]").attributes("d")).toBe("M0 0L12 1");
    expect(wrapper.findAll("[data-shape-line-end]")).toHaveLength(2);
  });
});

describe("connector content refuses unsafe factory bypass", () => {
  test.each([
    { text: "label" },
    { text: " " },
    { shapeStyle: { rotation3d: { kind: "value", value: createPictureRotation3d("parallel") } } },
    { shapeStyle: { format3d: { kind: "value", value: createPictureFormat3d() } } },
    { shapeFlipX: true },
    { rotation: 37 },
    { height: 2 },
    { shapeGeometry: { preset: "rect" } },
  ] as const)(
    "unsupported runtime source reports unavailable before paint/assets/text: %j",
    async (overrides) => {
      const route = ready(),
        source = { ...drawing(route, true), ...overrides } as SheetGraphicDrawing;
      const wrapper = render(source, route);
      expect(wrapper.find("svg").exists()).toBe(false);
      expect(wrapper.findComponent(ShapeDetailedContent).exists()).toBe(false);
      expect(wrapper.get('[role="status"]').text()).toContain("cannot be displayed");
      expect(wrapper.find("[data-standard-shape-text]").exists()).toBe(false);
      const detailed = render(source, route, true);
      await settle();
      expect(detailed.get('[role="status"]').text()).toContain("unavailable");
      expect(boundary.prepare).not.toHaveBeenCalled();
      expect(images.every((image) => image.get.mock.calls.length === 0)).toBe(true);
      expect(detailedShapeLocalBounds(source, route)).toBeUndefined();
    },
  );

  test("an unprojected live source without route never falls back to carrier or legacy SVG", async () => {
    const route = ready(),
      source: SheetGraphicDrawing = {
        ...drawing(route),
        shapeConnector: {
          kind: "shape-connector-v1",
          begin: { kind: "free", xRatio: 0, yRatio: 0 },
          end: { kind: "free", xRatio: 1, yRatio: 1 },
        },
      };
    const wrapper = render(source);
    expect(wrapper.find("svg").exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toContain("cannot be displayed");
    const detailed = render(source, undefined, true);
    await settle();
    expect(boundary.prepare).not.toHaveBeenCalled();
    expect(latestPaint(detailed)).toBeUndefined();
  });
});
