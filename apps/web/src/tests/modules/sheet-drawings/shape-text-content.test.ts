import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ShapeTextContent from "../../../modules/sheet-drawings/components/ShapeTextContent.vue";
import StandardShapeContent from "../../../modules/sheet-drawings/components/StandardShapeContent.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createAppI18n } from "../../../shared/i18n";

// Mock only native font/Canvas boundary. Real component watch, owner/request
// scheduling, preview presentation ownership and disposal stay in production.
const native = vi.hoisted(() => ({
  ensure: vi.fn(),
  layout: vi.fn(),
  paint: vi.fn(),
  project: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("../../../modules/sheet-drawings/shape-text-runtime", async (original) => ({
  ...(await original<typeof import("../../../modules/sheet-drawings/shape-text-runtime")>()),
  ensureDrawingShapeTextFont: native.ensure,
  layoutDrawingShapeText: native.layout,
}));
vi.mock("../../../modules/sheet-drawings/shape-text-paint", async (original) => ({
  ...(await original<typeof import("../../../modules/sheet-drawings/shape-text-paint")>()),
  prepareShapeTextPaint: native.paint,
}));
vi.mock("../../../modules/sheet-drawings/shape-text-projection", async (original) => ({
  ...(await original<typeof import("../../../modules/sheet-drawings/shape-text-projection")>()),
  projectShapeTextSurface: native.project,
}));
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  native.ensure.mockReset().mockResolvedValue(undefined);
  native.layout.mockReset().mockReturnValue({});
  native.dispose.mockReset();
  native.paint
    .mockReset()
    .mockReturnValue({ kind: "ready", actualDensity: 1, dispose: native.dispose });
  native.project.mockReset().mockReturnValue({
    left: 0,
    top: 0,
    surface: { width: 2, height: 2, data: new Uint8ClampedArray(16) },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        createImageData: (w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        }),
        putImageData: () => {},
      }) as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  vi.restoreAllMocks();
});
test.each(["ready", "missing"] as const)(
  "text texture URL preparation stays loading until %s settles",
  async (outcome) => {
    native.paint.mockReturnValue({
      kind: "unavailable",
      reason: "asset-unavailable",
      missingAssetIds: ["texture"],
    });
    const drawing = {
      ...createGraphicDrawing("text-texture", "shape", "", { row: 0, column: 0 }),
      text: "texture",
    };
    const w = mount(ShapeTextContent, {
      props: { drawing, loadingAssetIds: new Set(["texture"]) },
      global: { plugins: [createAppI18n("en-US")] },
    });
    wrappers.push(w);
    await flushPromises();
    expect(w.get('[role="status"]').text()).toBe("Preparing text…");
    if (outcome === "ready") {
      native.paint.mockReturnValue({ kind: "ready", actualDensity: 1, dispose: native.dispose });
      await w.setProps({ assetUrls: new Map([["texture", "blob:text-texture"]]) });
    } else {
      await w.setProps({ missingAssetIds: new Set(["texture"]) });
    }
    await flushPromises();
    if (outcome === "ready") {
      expect(w.find('[role="status"]').exists()).toBe(false);
      expect(w.emitted("paint")?.at(-1)?.[0]).toBeDefined();
    } else {
      expect(w.get('[role="status"]').text()).toBe(
        "Text cannot be displayed with the current font, resources or effects. The content is preserved.",
      );
      expect(w.emitted("paint")?.at(-1)?.[0]).toBeUndefined();
    }
  },
);

test("deep reactive editor text/font/width/3D changes repaint; every owned raster is disposed", async () => {
  const drawing = reactive({
    ...createGraphicDrawing("d", "shape", "", { row: 0, column: 0 }),
    text: "one",
  });
  const w = mount(ShapeTextContent, {
    props: { drawing },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(w);
  await flushPromises();
  expect(native.paint).toHaveBeenCalledTimes(1);
  for (const edit of [
    () => (drawing.text = "two"),
    () => (drawing.fontSize = 28),
    () => (drawing.width = 300),
    () => (drawing.shapeText!.layout.keepFlat = true),
  ]) {
    const count = native.paint.mock.calls.length;
    edit();
    await nextTick();
    await flushPromises();
    expect(native.paint).toHaveBeenCalledTimes(count + 1);
  }
  expect(native.dispose).toHaveBeenCalledTimes(native.paint.mock.calls.length);
  expect(w.find('[role="status"]').exists()).toBe(false);
});
test("font promise from old owner cannot paint the new preview; disposal closes pending requests", async () => {
  let resolve!: (value: undefined) => void;
  native.ensure.mockImplementationOnce(() => new Promise((ok) => (resolve = ok)));
  const old = { ...createGraphicDrawing("d", "shape", "", { row: 0, column: 0 }), text: "old" };
  const w = mount(ShapeTextContent, {
    props: { drawing: old },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(w);
  const next = { ...old, text: "new" };
  await w.setProps({ drawing: next });
  await flushPromises();
  expect(native.paint).toHaveBeenCalledTimes(1);
  expect(native.paint.mock.calls[0]![0].drawing).toEqual(next);
  resolve(undefined);
  await flushPromises();
  expect(native.paint).toHaveBeenCalledTimes(1);
});
test.each(["line", "free"])("empty %s does not mount a glyph-error overlay", (kind) => {
  const d = createGraphicDrawing("d", "shape", "", { row: 0, column: 0 });
  if (kind === "line") d.shapeGeometry = { preset: "line" };
  else {
    delete d.shapeGeometry;
    d.shapePath = {
      tool: "freeform",
      viewBox: { width: 100, height: 100 },
      commands: [
        ["M", 0, 0],
        ["L", 100, 100],
      ],
    };
  }
  const w = mount(StandardShapeContent, {
    props: { drawing: d },
    global: { plugins: [createAppI18n("en-US")], stubs: { ShapeDetailedContent: true } },
  });
  wrappers.push(w);
  expect(w.findComponent(ShapeTextContent).exists()).toBe(false);
  expect(native.ensure).not.toHaveBeenCalled();
});
test("selected text box's concrete format trigger reaches the real pane event", async () => {
  const drawing = { ...createGraphicDrawing("t", "textBox", "", { row: 1, column: 1 }), text: "" };
  const w = mount(SheetDrawingLayer, {
    props: {
      drawings: [drawing],
      revision: 0,
      selectedDrawingId: "t",
      scale: 1,
      readOnly: false,
      layout: createSheetViewportLayout({
        geometry: createSheetGeometry({
          rowCount: 20,
          columnCount: 10,
          rowHeight: 24,
          columnWidth: 80,
        }),
        rows: createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 }),
        viewportSize: { width: 600, height: 400 },
      }),
    },
    global: { plugins: [createAppI18n("en-US")], stubs: { DrawingContent: true } },
  });
  wrappers.push(w);
  await w.get("[data-shape-format-trigger]").trigger("click");
  expect(w.emitted("format")?.[0]).toEqual([drawing]);
});
