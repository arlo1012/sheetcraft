import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { reactive } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import ShapeLeafPixelContent from "../../../modules/sheet-drawings/components/ShapeLeafPixelContent.vue";
import StandardShapeContent from "../../../modules/sheet-drawings/components/StandardShapeContent.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createAppI18n } from "../../../shared/i18n";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type { ShapeDetailedPresentation } from "../../../modules/sheet-drawings/shape-detailed-presentation";
import { getShapePresentationAllocatedBytes } from "../../../modules/sheet-drawings/shape-detailed-presentation";
import type {
  ShapeLeafPixelsOptions,
  ShapeLeafPixelsResult,
} from "../../../modules/sheet-drawings/shape-leaf-pixels";

const boundary = vi.hoisted(() => ({ prepare: vi.fn(), ensureFont: vi.fn() }));
vi.mock("../../../modules/sheet-drawings/shape-leaf-pixels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../modules/sheet-drawings/shape-leaf-pixels")>()),
  prepareShapeLeafPixels: boundary.prepare,
}));
vi.mock("../../../modules/sheet-drawings/shape-text-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../modules/sheet-drawings/shape-text-runtime")>()),
  ensureDrawingShapeTextFont: boundary.ensureFont,
}));

const rotation: ShapeDetailedStyle["rotation3d"] = {
  kind: "value",
  value: { projection: "parallel", xDeg: 30, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
};
const format: ShapeDetailedStyle["format3d"] = {
  kind: "value",
  value: {
    depthPt: 24,
    contourPt: 0,
    depthColor: { kind: "rgb", rgb: "#777777" },
    contourColor: { kind: "rgb", rgb: "#000000" },
    material: "plastic",
    lighting: "flat",
    lightingAngleDeg: 0,
  },
};
const wrappers = new Set<VueWrapper>();
const surfaces = new WeakMap<
  HTMLCanvasElement,
  { width: number; height: number; data: Uint8ClampedArray }
>();
const transient: { canvas: HTMLCanvasElement; dispose: ReturnType<typeof vi.fn> }[] = [];
function pixelSurface(canvas: HTMLCanvasElement) {
  let surface = surfaces.get(canvas);
  if (!surface || surface.width !== canvas.width || surface.height !== canvas.height) {
    surface = {
      width: canvas.width,
      height: canvas.height,
      data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
    };
    surfaces.set(canvas, surface);
  }
  return surface;
}
function ready(options: ShapeLeafPixelsOptions): ShapeLeafPixelsResult {
  const canvas = document.createElement("canvas"),
    density = options.density;
  canvas.width = 4 * density;
  canvas.height = 3 * density;
  const marker = options.drawing.text.length + (options.hideText ? 0 : 30);
  for (let i = 3; i < pixelSurface(canvas).data.length; i += 4)
    pixelSurface(canvas).data[i] = marker;
  const dispose = vi.fn(() => {
    canvas.width = 0;
    canvas.height = 0;
  });
  transient.push({ canvas, dispose });
  return {
    kind: "ready",
    canvas,
    actualDensity: density,
    logicalBounds: { left: -2, top: -1, right: 2, bottom: 2 },
    dispose,
  } as unknown as ShapeLeafPixelsResult;
}
beforeEach(() => {
  transient.length = 0;
  boundary.prepare.mockReset().mockImplementation(ready);
  boundary.ensureFont.mockReset().mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return {
        clearRect: () => pixelSurface(this).data.fill(0),
        drawImage: (source: HTMLCanvasElement) =>
          pixelSurface(this).data.set(pixelSurface(source).data),
        getImageData: () => ({
          data: pixelSurface(this).data.slice(),
          width: this.width,
          height: this.height,
        }),
      } as unknown as CanvasRenderingContext2D;
    },
  );
});
function textbox(style?: ShapeDetailedStyle): SheetGraphicDrawing {
  return {
    ...createGraphicDrawing("legacy-box", "textBox", "Legacy box", { row: 0, column: 0 }),
    shapeText: undefined,
    shapeGeometry: undefined,
    shapeStyle: style ? structuredClone(style) : undefined,
    width: 80,
    height: 60,
    text: "Saved text",
    rotation: 37,
    fill: "#eeeeee",
    stroke: "#111111",
    strokeWidth: 3,
    shapeFlipX: true,
    shapeFlipY: true,
    textDirection: "vertical",
  };
}
/** The entry routing and event/prop contracts are real. Child pixel rendering is
 * covered end-to-end by group-scene-release-pixels and shape-leaf-pixels tests. */
function render(drawing: SheetGraphicDrawing, hideText = false, actualLeaf = false) {
  const wrapper = mount(DrawingContent, {
    props: {
      drawing,
      hideText,
      density: 2,
      theme: DEFAULT_WORKBOOK_THEME,
      imageAssetUrls: new Map(),
      legacyHitSurface: true,
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        ...(!actualLeaf ? { ShapeLeafPixelContent: true } : {}),
        StandardShapeContent: true,
      },
    },
  });
  wrappers.add(wrapper);
  return wrapper;
}
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.clear();
  vi.restoreAllMocks();
  expect(getShapePresentationAllocatedBytes()).toBe(0);
  expect(
    transient.every(
      ({ canvas, dispose }) =>
        canvas.width === 0 && canvas.height === 0 && dispose.mock.calls.length === 1,
    ),
  ).toBe(true);
});

describe("DrawingContent projected legacy TextBox entry", () => {
  test.each([
    ["rotation only", { rotation3d: rotation }],
    ["depth only", { format3d: format }],
    ["shared camera materialized on release", { rotation3d: rotation, format3d: format }],
  ] satisfies readonly (readonly [string, ShapeDetailedStyle])[])(
    "%s routes genuine body/glyph pixels to one leaf consumer without migrating source",
    (_case, style) => {
      const drawing = textbox(style),
        before = structuredClone(drawing),
        wrapper = render(drawing),
        leaf = wrapper.findComponent(ShapeLeafPixelContent);
      expect(leaf.exists()).toBe(true);
      expect(wrapper.findComponent(StandardShapeContent).exists()).toBe(false);
      expect(leaf.props("drawing")).toEqual(drawing);
      expect(leaf.props("density")).toBe(2);
      expect(leaf.props("theme")).toEqual(DEFAULT_WORKBOOK_THEME);
      expect(leaf.props("hideText")).toBe(false);
      expect(wrapper.find("svg").exists()).toBe(false);
      const duplicate = wrapper.find(".drawing-content__text");
      expect(
        !duplicate.exists() || (duplicate.element as HTMLElement).style.display === "none",
      ).toBe(true);
      expect((wrapper.get(".drawing-content").element as HTMLElement).style.transform).toBe(
        "rotate(37deg)",
      );
      expect(drawing).toEqual(before);
      expect(drawing.shapeText).toBeUndefined();
    },
  );
  test("projected leaf forwards its whole-leaf hit presentation and suppresses only an active editor's glyph surface", async () => {
    const drawing = textbox({ rotation3d: rotation, format3d: format }),
      wrapper = render(drawing, true),
      leaf = wrapper.getComponent(ShapeLeafPixelContent),
      presentation: ShapeDetailedPresentation = {
        drawing,
        canvas: document.createElement("canvas"),
        density: 2,
        bounds: { left: -3, top: -2, width: 95, height: 70 },
        unflipped: true,
      };
    expect(leaf.props("hideText")).toBe(true);
    leaf.vm.$emit("paint", presentation);
    expect(wrapper.emitted("detailedPaint")?.at(-1)?.[0]).toBe(presentation);
    leaf.vm.$emit("paint", undefined);
    expect(wrapper.emitted("detailedPaint")?.at(-1)?.[0]).toBeUndefined();
    await wrapper.setProps({ hideText: false });
    expect(leaf.props("hideText")).toBe(false);
    expect(drawing.text).toBe("Saved text");
  });
  test.each([
    undefined,
    { rotation3d: { kind: "none" } },
    { format3d: { kind: "none" } },
    { rotation3d: { kind: "none" }, format3d: { kind: "none" } },
  ] satisfies readonly (ShapeDetailedStyle | undefined)[])(
    "no active 3D retains the exact CSS text box branch (%j)",
    (style) => {
      const drawing = textbox(style),
        wrapper = render(drawing),
        text = wrapper.get(".drawing-content__text"),
        css = (text.element as HTMLElement).style;
      expect(wrapper.findComponent(ShapeLeafPixelContent).exists()).toBe(false);
      expect(wrapper.findComponent(StandardShapeContent).exists()).toBe(false);
      expect(text.text()).toBe("Saved text");
      expect(css.display).not.toBe("none");
      expect(css.borderWidth).toBe("3px");
      expect(css.background).toBe(drawing.fill);
      expect(css.writingMode).toBe("vertical-rl");
      expect(css.textOrientation).toBe("mixed");
      expect(css.lineHeight).toBe("normal");
      expect(css.transform).toBe("rotate(180deg)");
      expect(wrapper.find("svg").exists()).toBe(false);
      expect(drawing.shapeText).toBeUndefined();
    },
  );
  test("repeated projected/plain transitions select exactly one body/glyph branch", async () => {
    const ordinary = textbox(),
      projected = textbox({ rotation3d: rotation }),
      wrapper = render(ordinary);
    for (const drawing of [projected, ordinary, projected, ordinary]) {
      await wrapper.setProps({ drawing });
      const active =
        !!drawing.shapeStyle?.rotation3d && drawing.shapeStyle.rotation3d.kind === "value";
      expect(wrapper.findComponent(ShapeLeafPixelContent).exists()).toBe(active);
      const text = wrapper.find(".drawing-content__text");
      expect(text.exists() && (text.element as HTMLElement).style.display !== "none").toBe(!active);
      expect(wrapper.findComponent(StandardShapeContent).exists()).toBe(false);
    }
  });
  test("the actual leaf owns its union presentation, repaints in-place edits, hides editor glyphs, and releases on unmount", async () => {
    const drawing = reactive(textbox({ rotation3d: rotation, format3d: format })),
      wrapper = render(drawing, false, true);
    await flushPromises();
    expect(boundary.prepare).toHaveBeenCalledOnce();
    const presentation = () =>
      wrapper.emitted("detailedPaint")?.at(-1)?.[0] as ShapeDetailedPresentation | undefined;
    const first = presentation()!;
    expect(first.drawing).toBe(drawing);
    expect(first.unflipped).toBe(true);
    expect(first.density).toBe(2);
    expect(first.bounds).toEqual({ left: -2, top: -1, width: 4, height: 3 });
    expect(pixelSurface(first.canvas).data[3]).toBe(drawing.text.length + 30);
    expect(transient[0]!.dispose).toHaveBeenCalledOnce();
    expect(first.canvas.width).toBe(8);
    expect(getShapePresentationAllocatedBytes()).toBe(8 * 6 * 4);
    drawing.text = "Updated text";
    drawing.width = 81;
    if (drawing.shapeStyle!.rotation3d!.kind !== "value") throw new Error("Missing own camera");
    drawing.shapeStyle!.rotation3d!.value.xDeg = 45;
    await flushPromises();
    expect(boundary.prepare).toHaveBeenCalledTimes(2);
    const input = boundary.prepare.mock.calls.at(-1)![0] as ShapeLeafPixelsOptions;
    expect(input.drawing).toBe(drawing);
    expect(input.drawing.width).toBe(81);
    expect(input.drawing.shapeStyle!.rotation3d).toMatchObject({ value: { xDeg: 45 } });
    expect(presentation()!.canvas).toBe(first.canvas);
    expect(pixelSurface(first.canvas).data[3]).toBe("Updated text".length + 30);
    const fontsBefore = boundary.ensureFont.mock.calls.length;
    await wrapper.setProps({ hideText: true });
    await flushPromises();
    expect(boundary.prepare.mock.calls.at(-1)![0]).toMatchObject({ hideText: true });
    expect(boundary.ensureFont).toHaveBeenCalledTimes(fontsBefore);
    expect(pixelSurface(first.canvas).data[3]).toBe("Updated text".length);
    boundary.prepare.mockReturnValueOnce({
      kind: "unavailable",
      reason: "text-unavailable",
      missingAssetIds: [],
      message: "font unavailable",
    } as unknown as ShapeLeafPixelsResult);
    await wrapper.setProps({ hideText: false });
    await flushPromises();
    expect(presentation()).toBeUndefined();
    expect(wrapper.find("[role='status']").exists()).toBe(true);
    expect((wrapper.get("canvas").element as HTMLCanvasElement).style.display).toBe("none");
    wrapper.unmount();
    wrappers.delete(wrapper);
    expect(first.canvas.width).toBe(0);
    expect(first.canvas.height).toBe(0);
    expect(presentation()).toBeUndefined();
    expect(getShapePresentationAllocatedBytes()).toBe(0);
  });
  test("an unmounted font-waiting actual leaf never prepares or publishes stale pixels", async () => {
    let release!: () => void;
    boundary.ensureFont.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const wrapper = render(textbox({ rotation3d: rotation }), false, true);
    await Promise.resolve();
    wrapper.unmount();
    wrappers.delete(wrapper);
    release();
    await flushPromises();
    expect(boundary.prepare).not.toHaveBeenCalled();
    expect(wrapper.emitted("detailedPaint")?.every((event) => event[0] === undefined)).toBe(true);
    expect(getShapePresentationAllocatedBytes()).toBe(0);
  });
});
