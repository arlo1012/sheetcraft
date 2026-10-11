import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheetGeometry, type Rect } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { CellAddress } from "@sheetcraft/core/workbook";
import type { PageViewPaintState } from "../../../../../modules/page-layout/page-view-types";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import surfaceSource from "../../../../../modules/sheet-grid/components/SheetSurface.vue?raw";
import * as cellScene from "../../../../../modules/sheet-grid/canvas/cell-scene";
import * as scenePainter from "../../../../../modules/sheet-grid/canvas/scene-painter";
import * as borderPainter from "../../../../../modules/sheet-grid/canvas/border-painter";
import type { SheetDisplaySnapshot } from "../../../../../modules/sheet-grid/canvas/sheet-display-snapshot";
import * as decorationPainter from "../../../../../modules/page-decorations/page-decoration-painter";
import * as pagePainter from "../../../../../modules/page-layout/rendering/page-view-painter";
import * as guidePainter from "../../../../../modules/page-layout/rendering/page-break-guides";
import * as headerPainter from "../../../../../modules/sheet-grid/rendering/header-painter";
import * as overlayPainter from "../../../../../modules/sheet-grid/rendering/overlay-painter";
import { createSheetRenderFrame } from "../../../../../modules/sheet-grid/rendering/sheet-render-frame";
import type { SheetRenderEnvironment } from "../../../../../modules/sheet-grid/rendering/useSheetRenderEnvironment";
import { createAppI18n } from "../../../../../shared/i18n";
import { layoutCellText } from "../../../../../shared/cell-text/text-presentation";

type Draw = {
  kind: "fillRect" | "fillText" | "clearRect" | "drawImage" | "fill";
  args: unknown[];
  alpha: number;
  composite: string;
  transform: { a: number; d: number; e: number; f: number };
};
type RecordedContext = CanvasRenderingContext2D & { draws: Draw[] };

function recordContext(canvas: HTMLCanvasElement): RecordedContext {
  let transform = { a: 1, d: 1, e: 0, f: 0 };
  const stack: Array<{
    transform: typeof transform;
    alpha: number;
    composite: GlobalCompositeOperation;
    fillStyle: string | CanvasGradient | CanvasPattern;
    font: string;
  }> = [];
  const draws: Draw[] = [];
  const record = (kind: Draw["kind"], args: unknown[]) =>
    draws.push({
      kind,
      args,
      alpha: context.globalAlpha,
      composite: context.globalCompositeOperation,
      transform: { ...transform },
    });
  const context = {
    canvas,
    draws,
    globalAlpha: 1,
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    fillStyle: "#000",
    font: "10px sans-serif",
    setTransform: vi.fn((a: number, _b: number, _c: number, d: number, e: number, f: number) => {
      transform = { a, d, e, f };
    }),
    getTransform: vi.fn(() => ({ ...transform })),
    save: vi.fn(() => {
      stack.push({
        transform: { ...transform },
        alpha: context.globalAlpha,
        composite: context.globalCompositeOperation,
        fillStyle: context.fillStyle,
        font: context.font,
      });
    }),
    restore: vi.fn(() => {
      const state = stack.pop();
      if (!state) throw new Error("Unbalanced canvas restore");
      transform = state.transform;
      context.globalAlpha = state.alpha;
      context.globalCompositeOperation = state.composite;
      context.fillStyle = state.fillStyle;
      context.font = state.font;
    }),
    translate: vi.fn((x: number, y: number) => {
      transform.e += x * transform.a;
      transform.f += y * transform.d;
    }),
    rotate: vi.fn(),
    clearRect: vi.fn((...args: number[]) => record("clearRect", args)),
    fillRect: vi.fn((...args: number[]) => record("fillRect", args)),
    fillText: vi.fn((...args: unknown[]) => record("fillText", args)),
    drawImage: vi.fn((...args: unknown[]) => record("drawImage", args)),
    measureText: vi.fn((text: string) => ({
      width: text.length * 6,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
    })),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => record("fill", [])),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
  } as unknown as RecordedContext;
  return context;
}

function installPaintHost(options: { unavailableForeground?: boolean } = {}) {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(nextId, callback);
    return nextId++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const contexts = new Map<HTMLCanvasElement, RecordedContext>();
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(function (this: HTMLCanvasElement) {
      if (options.unavailableForeground && this.hasAttribute("data-sheet-foreground-canvas"))
        return null;
      if (!contexts.has(this)) contexts.set(this, recordContext(this));
      return contexts.get(this)!;
    });
  const paints: Array<{ kind: string; context: CanvasRenderingContext2D }> = [];
  const record = (kind: string, context: CanvasRenderingContext2D) =>
    paints.push({ kind, context });
  const scene = scenePainter.paintSheetScene;
  vi.spyOn(scenePainter, "paintSheetScene").mockImplementation((...args) => {
    record("scene", args[0]);
    scene(...args);
  });
  const indicators = scenePainter.paintSheetCellIndicators;
  vi.spyOn(scenePainter, "paintSheetCellIndicators").mockImplementation((...args) => {
    record("indicators", args[0]);
    indicators(...args);
  });
  vi.spyOn(borderPainter, "createBorderPaintPlan").mockReturnValue({ panes: [] });
  vi.spyOn(borderPainter, "paintSheetBorders").mockImplementation((context) =>
    record("borders", context),
  );
  vi.spyOn(guidePainter, "paintPageBreakGuides").mockImplementation((context) =>
    record("guides", context),
  );
  vi.spyOn(headerPainter, "paintSheetHeaders").mockImplementation((context) =>
    record("headers", context),
  );
  vi.spyOn(overlayPainter, "paintSheetChrome").mockImplementation((context) =>
    record("chrome", context),
  );
  const watermark = decorationPainter.paintSheetWatermark;
  vi.spyOn(decorationPainter, "paintSheetWatermark").mockImplementation((...args) => {
    record("watermark", args[0]);
    watermark(...args);
  });
  const underlay = overlayPainter.paintSheetUnderlay;
  vi.spyOn(overlayPainter, "paintSheetUnderlay").mockImplementation((...args) => {
    record("underlay", args[0]);
    underlay(...args);
  });
  const foreground = overlayPainter.paintSheetForeground;
  vi.spyOn(overlayPainter, "paintSheetForeground").mockImplementation((...args) => {
    record("foreground", args[0]);
    foreground(...args);
  });
  return {
    paints,
    getContext,
    context(canvas: HTMLCanvasElement) {
      return contexts.get(canvas)!;
    },
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    },
    get queued() {
      return frames.size;
    },
    reset() {
      paints.length = 0;
      for (const context of contexts.values()) context.draws.length = 0;
      vi.mocked(scenePainter.paintSheetScene).mockClear();
    },
    paintImages: vi.fn((context: CanvasRenderingContext2D) => {
      record("images", context);
      context.save();
      context.globalAlpha = 1;
      context.drawImage({ id: "opaque-object" } as unknown as HTMLImageElement, 0, 0, 40, 20);
      context.globalAlpha = 0.25;
      context.drawImage({ id: "translucent-object" } as unknown as HTMLImageElement, 40, 0, 40, 20);
      context.restore();
    }),
  };
}

const environment: SheetRenderEnvironment = {
  density: 1.25,
  fontFamily: "Base",
  cells: { background: "#fff", text: "#111", mutedText: "#777", gridLine: "#ddd" },
  headers: headerPainter.DEFAULT_SHEET_HEADER_PALETTE,
  overlays: {
    actionPrimary: "#00f",
    mutedText: "#777",
    panel: "#fff",
    inverseText: "#fff",
    iconHover: "#eee",
    formulaReferenceColors: ["#f00"],
  },
};

function fixtureFrame(
  options: { freeze?: { rows: number; columns: number }; scale?: number } = {},
) {
  const geometry = createSheetGeometry({
    rowCount: 8,
    columnCount: 8,
    rowHeight: 20,
    columnWidth: 40,
  });
  const rows = createRowVisibilityIndex({ rowCount: 8, defaultRowHeight: 20 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: options.freeze,
    viewportSize: { width: 120, height: 80 },
    mergeResolver: { getRangeAt: () => null },
  });
  const frame = createSheetRenderFrame(layout, { width: 36, height: 24 }, options.scale ?? 1);
  return { geometry, rows, frame };
}

function cell(
  options: { bidi?: boolean; address?: CellAddress; rect?: Rect } = {},
): cellScene.CanvasCell {
  const text = options.bidi === false ? "plain" : "AאבB";
  const rect = options.rect ?? { x: 0, y: 0, width: 40, height: 20 };
  const style = { fontFamily: "Base", fontSize: 10 };
  const fontRuns =
    options.bidi === false ? undefined : [{ start: 1, end: 3, fontFamily: "Alternate" }];
  return {
    address: options.address ?? { row: 0, column: 0 },
    hasNote: false,
    rect,
    contentRect: rect,
    style,
    content: {
      text,
      style,
      fontRuns,
      textLayout: layoutCellText({
        text,
        style,
        fontRuns,
        width: rect.width - 1,
        height: rect.height - 1,
        measurer: { measure: (value) => value.length * 5 },
      }),
    },
  };
}

const mounted: VueWrapper[] = [];
function mountSurface(
  host: ReturnType<typeof installPaintHost>,
  options: {
    scene?: cellScene.SheetCanvasScene;
    freeze?: { rows: number; columns: number };
    scale?: number;
    pageView?: PageViewPaintState;
  } = {},
) {
  const scene = options.scene ?? {
    panes: [
      {
        id: "body" as const,
        cells: [
          cell(),
          cell({
            bidi: false,
            address: { row: 0, column: 1 },
            rect: { x: 40, y: 0, width: 40, height: 20 },
          }),
        ],
      },
    ],
  };
  vi.spyOn(cellScene, "createSheetCanvasScene").mockReturnValue(scene);
  const parts = fixtureFrame(options);
  const wrapper = mount(SheetSurface, {
    global: { plugins: [createAppI18n("en-US")] },
    slots: { "active-cell": "<div data-test-editor></div>" },
    props: {
      ...parts,
      display: { sheet: {}, getCellStyle: () => undefined } as unknown as SheetDisplaySnapshot,
      environment,
      headers: {
        selection: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0, mode: "cells" },
        quickTools: { enabled: false, gutter: 0 },
      },
      overlays: { rangeRects: [{ paneId: "body", rect: { x: 0, y: 0, width: 80, height: 20 } }] },
      activeCell: { row: 0, column: 0 },
      editing: false,
      label: "Sheet",
      showGridLines: false,
      pageView: options.pageView,
      pageBreakGuides: { rowBreaks: [], columnBreaks: [] },
      pageDecoration: {
        watermark: { text: "watermark", color: "#888", fontSize: 10, opacity: 0.3, angle: 0 },
      },
      paintImages: host.paintImages,
    },
  });
  mounted.push(wrapper);
  return { wrapper, ...parts };
}

async function settle(host: ReturnType<typeof installPaintHost>) {
  await nextTick();
  host.flush();
  await nextTick();
  host.flush();
}

function canvas(wrapper: VueWrapper, foreground = false) {
  return wrapper.get<HTMLCanvasElement>(
    foreground ? "[data-sheet-foreground-canvas]" : "[data-sheet-canvas]",
  ).element;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SheetSurface attributed text paint layers", () => {
  test("puts native text between cell Canvas and every foreground painter, including opaque objects", async () => {
    const host = installPaintHost();
    const { wrapper } = mountSurface(host);
    await settle(host);
    const base = host.context(canvas(wrapper));
    const foreground = host.context(canvas(wrapper, true));
    const dom = wrapper.get('[data-attributed-pane="body"]').element;
    const children = [...wrapper.element.children];
    expect(children.indexOf(canvas(wrapper))).toBeLessThan(children.indexOf(dom));
    expect(children.indexOf(dom)).toBeLessThan(children.indexOf(canvas(wrapper, true)));
    expect(children.indexOf(canvas(wrapper, true))).toBeLessThan(
      children.indexOf(wrapper.get("[data-editor-pane]").element),
    );
    expect(host.paints.map((paint) => paint.kind)).toEqual([
      "scene",
      "indicators",
      "watermark",
      "underlay",
      "borders",
      "guides",
      "foreground",
      "images",
      "headers",
      "chrome",
    ]);
    expect(host.paints[0]?.context).toBe(base);
    expect(host.paints.slice(1).every((paint) => paint.context === foreground)).toBe(true);
    expect(
      base.draws.filter((draw) => draw.kind === "fillText").map((draw) => draw.args[0]),
    ).toEqual(["plain"]);
    expect(wrapper.get(".cell-text__bidi-paragraph").text()).toBe("AאבB");
    expect(foreground.draws.some((draw) => draw.kind === "drawImage" && draw.alpha === 1)).toBe(
      true,
    );
    expect(host.getContext.mock.calls.some((args) => args[1]?.alpha === true)).toBe(true);
  });

  test("keeps translucent watermark, selection tint and image alpha above DOM without opaque masking", async () => {
    const host = installPaintHost();
    const { wrapper } = mountSurface(host);
    await settle(host);
    const foreground = host.context(canvas(wrapper, true));
    expect(foreground.draws.filter((draw) => draw.kind === "fillText")).toEqual(
      expect.arrayContaining([expect.objectContaining({ alpha: 0.3, args: ["watermark", 0, 0] })]),
    );
    expect(foreground.draws.filter((draw) => draw.kind === "fillRect")).toEqual([
      expect.objectContaining({ alpha: 0.08, args: [0, 0, 80, 20] }),
    ]);
    expect(
      foreground.draws.filter((draw) => draw.kind === "drawImage").map((draw) => draw.alpha),
    ).toEqual([1, 0.25]);
    expect(foreground.draws.every((draw) => draw.composite === "source-over")).toBe(true);
  });

  test("clears the complete transparent backing store before each repaint at the shared zoom and density", async () => {
    const host = installPaintHost();
    const { wrapper } = mountSurface(host, { scale: 1.3 });
    await settle(host);
    const foregroundCanvas = canvas(wrapper, true);
    const foreground = host.context(foregroundCanvas);
    expect(foregroundCanvas.width).toBe(canvas(wrapper).width);
    expect(foregroundCanvas.height).toBe(canvas(wrapper).height);
    host.reset();
    await wrapper.setProps({ overlays: {} });
    expect(host.queued).toBe(1);
    host.flush();
    expect(foreground.draws[0]).toEqual({
      kind: "clearRect",
      args: [0, 0, foregroundCanvas.width, foregroundCanvas.height],
      alpha: 1,
      composite: "source-over",
      transform: { a: 1, d: 1, e: 0, f: 0 },
    });
    const image = foreground.draws.find((draw) => draw.kind === "drawImage")!;
    expect(image.transform).toEqual({ a: 1.625, d: 1.625, e: 58.5, f: 39 });
    expect(foreground.draws.some((draw) => draw.kind === "fillRect")).toBe(false);
    expect(vi.mocked(scenePainter.paintSheetScene)).toHaveBeenCalledOnce();
  });

  test("keeps the ordinary Canvas path single-surface and never duplicates its painters or glyphs", async () => {
    const host = installPaintHost();
    const { wrapper } = mountSurface(host, {
      scene: { panes: [{ id: "body", cells: [cell({ bidi: false })] }] },
    });
    await settle(host);
    expect(wrapper.findAll("canvas")).toHaveLength(1);
    expect(wrapper.findAll("[data-attributed-pane]")).toHaveLength(0);
    const base = host.context(canvas(wrapper));
    expect(host.paints.every((paint) => paint.context === base)).toBe(true);
    expect(host.paints.filter((paint) => paint.kind === "scene")).toHaveLength(1);
    expect(
      base.draws.filter((draw) => draw.kind === "fillText" && draw.args[0] === "plain"),
    ).toHaveLength(1);
    expect(vi.mocked(scenePainter.paintSheetScene).mock.calls[0]?.[3].attributedBidiMode).toBe(
      "plain",
    );
  });

  test("falls back to complete Canvas text if the transparent layer has no context", async () => {
    const host = installPaintHost({ unavailableForeground: true });
    const { wrapper } = mountSurface(host);
    await settle(host);
    expect(wrapper.findAll("[data-attributed-pane]")).toHaveLength(0);
    const base = host.context(canvas(wrapper));
    expect(
      base.draws.filter((draw) => draw.kind === "fillText" && draw.args[0] === "AאבB"),
    ).toHaveLength(1);
    expect(host.paints.every((paint) => paint.context === base)).toBe(true);
    expect(vi.mocked(scenePainter.paintSheetScene).mock.calls[0]?.[3].attributedBidiMode).toBe(
      "plain",
    );
  });

  test("removes the fallback while editing and restores one transparent surface after editing ends", async () => {
    const host = installPaintHost();
    const { wrapper } = mountSurface(host);
    await settle(host);
    const oldForeground = canvas(wrapper, true);
    host.reset();
    await wrapper.setProps({ editing: true, overlays: { editing: true } });
    host.flush();
    expect(wrapper.findAll("[data-attributed-pane], [data-sheet-foreground-canvas]")).toHaveLength(
      0,
    );
    expect(wrapper.findAll("canvas")).toHaveLength(1);
    expect(wrapper.find("[data-test-editor]").exists()).toBe(true);
    expect(
      host
        .context(canvas(wrapper))
        .draws.some((draw) => draw.kind === "fillText" && draw.args[0] === "AאבB"),
    ).toBe(false);
    expect(host.paints.every((paint) => paint.context === host.context(canvas(wrapper)))).toBe(
      true,
    );
    host.reset();
    await wrapper.setProps({ editing: false, overlays: {} });
    await settle(host);
    expect(wrapper.findAll("[data-attributed-pane]")).toHaveLength(1);
    expect(wrapper.findAll("[data-sheet-foreground-canvas]")).toHaveLength(1);
    expect(canvas(wrapper, true)).not.toBe(oldForeground);
    expect(host.context(canvas(wrapper, true)).draws[0]?.kind).toBe("clearRect");
    expect(host.paints.filter((paint) => paint.kind === "scene")).toHaveLength(1);
  });

  test("preserves frozen-pane and page-content clips on both canvas layers and the native editor", async () => {
    const host = installPaintHost();
    const clipPageContents = vi.spyOn(pagePainter, "clipPageContents");
    const merged = cell({ rect: { x: 0, y: 0, width: 80, height: 40 } });
    const pageView: PageViewPaintState = {
      mode: "page-layout",
      pages: [
        {
          paperRect: { x: 0, y: 0, width: 100, height: 70 },
          contentRect: { x: 10, y: 5, width: 60, height: 30 },
          sheetRect: { x: 0, y: 0, width: 80, height: 40 },
        },
      ],
      printRect: { x: 0, y: 0, width: 80, height: 40 },
      rowBreaks: [],
      columnBreaks: [],
      pageLabel: String,
      millimetresPerUnit: 1,
    };
    const { wrapper, frame } = mountSurface(host, {
      freeze: { rows: 1, columns: 1 },
      scene: {
        panes: [
          { id: "topLeft", cells: [merged] },
          { id: "body", cells: [merged] },
        ],
      },
      pageView,
    });
    await settle(host);
    const clips = wrapper.findAll<HTMLElement>("[data-attributed-pane]");
    expect(clips.map((clip) => clip.attributes("data-attributed-pane"))).toEqual([
      "topLeft",
      "body",
    ]);
    expect(
      clips.map((clip) => [
        clip.element.style.left,
        clip.element.style.top,
        clip.element.style.width,
        clip.element.style.height,
      ]),
    ).toEqual([
      ["46px", "29px", "30px", "15px"],
      ["76px", "44px", "30px", "15px"],
    ]);
    expect(clipPageContents.mock.calls.map((args) => args[0])).toEqual([
      host.context(canvas(wrapper)),
      host.context(canvas(wrapper, true)),
      host.context(canvas(wrapper, true)),
      host.context(canvas(wrapper, true)),
    ]);
    expect(clipPageContents.mock.calls[0]?.slice(1)).toEqual([
      pageView,
      frame.layout.bodyScrollPosition,
    ]);
    const firstClip = clipPageContents.mock.calls[0]!;
    expect(
      clipPageContents.mock.calls.every(
        (args) => args[1] === firstClip[1] && args[2] === firstClip[2],
      ),
    ).toBe(true);
    await wrapper.setProps({ editing: true, activeCell: { row: 1, column: 1 } });
    const editor = wrapper.get<HTMLElement>('[data-editor-pane="body"]').element;
    expect(editor.style.left).toBe("76px");
    expect(editor.style.top).toBe("44px");
    expect(editor.style.clipPath).toBe("inset(-1px 0px 0px -1px)");
    expect(wrapper.get<HTMLElement>("[data-cell-editor-anchor]").element.style.left).toBe("0px");
  });

  test("keeps printed and outside-page passes disjoint when page-break preview uses the native text layer", async () => {
    const host = installPaintHost();
    const printClip = vi.spyOn(pagePainter, "clipPageBreakPreviewPrintArea");
    const outsideClip = vi.spyOn(pagePainter, "clipPageBreakPreviewOutside");
    const preview = vi.spyOn(pagePainter, "paintPageBreakPreview");
    const pageView: PageViewPaintState = {
      mode: "page-break-preview",
      pages: [],
      printRect: { x: 0, y: 0, width: 60, height: 40 },
      rowBreaks: [],
      columnBreaks: [],
      pageLabel: String,
      millimetresPerUnit: 1,
    };
    const { wrapper } = mountSurface(host, { pageView });
    await settle(host);
    const base = host.context(canvas(wrapper));
    const foreground = host.context(canvas(wrapper, true));
    expect(printClip.mock.calls.map((args) => args[0])).toEqual([base, foreground]);
    expect(outsideClip.mock.calls.map((args) => args[0])).toEqual([base, foreground]);
    expect(vi.mocked(base.clip).mock.calls).toContainEqual(["evenodd"]);
    expect(vi.mocked(foreground.clip).mock.calls).toContainEqual(["evenodd"]);
    expect(
      printClip.mock.calls.every(
        (args) => JSON.stringify(args[1]) === JSON.stringify(pageView.printRect),
      ),
    ).toBe(true);
    expect(host.paints.filter((paint) => paint.kind === "scene")).toHaveLength(2);
    expect(host.paints.filter((paint) => paint.kind === "indicators")).toHaveLength(2);
    expect(
      vi
        .mocked(scenePainter.paintSheetScene)
        .mock.calls.map((args) => [
          args[3].showGridLines,
          args[3].attributedBidiMode,
          args[3].skipCellIndicators,
        ]),
    ).toEqual([
      [false, "dom", true],
      [false, "dom", true],
    ]);
    expect(preview).toHaveBeenCalledOnce();
    expect(preview.mock.calls[0]?.[0]).toBe(foreground);
  });

  test("keeps error and note triangles above native text without repainting cell content or retaining images twice", async () => {
    const host = installPaintHost();
    const annotated = cell();
    annotated.hasNote = true;
    const { wrapper } = mountSurface(host, {
      scene: { panes: [{ id: "body", cells: [annotated] }] },
    });
    await wrapper.setProps({
      errorCells: new Set(["0:0"]),
      errorIndicatorColor: "#0f0",
      overlays: {},
    });
    await settle(host);
    const base = host.context(canvas(wrapper));
    const foreground = host.context(canvas(wrapper, true));
    expect(vi.mocked(base.moveTo).mock.calls).toEqual([]);
    expect(vi.mocked(foreground.moveTo).mock.calls).toEqual([
      [1, 1],
      [31, 1],
    ]);
    expect(foreground.draws.filter((draw) => draw.kind === "fill")).toHaveLength(2);
    expect(vi.mocked(scenePainter.paintSheetCellIndicators).mock.calls[0]?.[3]).toEqual({
      errorCells: new Set(["0:0"]),
      errorIndicator: "#0f0",
      editingCell: undefined,
    });
    const imageCache = vi.mocked(scenePainter.paintSheetScene).mock.calls[0]![3].images;
    const retain = vi.spyOn(imageCache, "retain");
    host.reset();
    await wrapper.setProps({ overlays: {} });
    host.flush();
    expect(retain).toHaveBeenCalledOnce();
    expect(vi.mocked(scenePainter.paintSheetScene)).toHaveBeenCalledOnce();
    expect(vi.mocked(scenePainter.paintSheetScene).mock.calls[0]?.[3].skipCellIndicators).toBe(
      true,
    );
    expect(host.paints.filter((paint) => paint.kind === "indicators")).toHaveLength(1);
    expect(host.paints.findIndex((paint) => paint.kind === "indicators")).toBeLessThan(
      host.paints.findIndex((paint) => paint.kind === "watermark"),
    );
  });

  test("leaves focus and all pointer events on the original canvas and cancels its shared frame on unmount", async () => {
    const host = installPaintHost();
    const { wrapper } = mountSurface(host);
    await settle(host);
    const foreground = wrapper.get("[data-sheet-foreground-canvas]");
    expect(foreground.attributes("aria-hidden")).toBe("true");
    expect(foreground.attributes("tabindex")).toBeUndefined();
    expect(foreground.attributes("data-sheet-surface")).toBeUndefined();
    expect(surfaceSource).toMatch(
      /&__canvas--foreground\s*\{[^}]*z-index:\s*2;[^}]*pointer-events:\s*none;/,
    );
    expect(surfaceSource).toMatch(/&__attributed-clip\s*\{[^}]*z-index:\s*1;/);
    expect(surfaceSource).toMatch(/&__editor-pane\s*\{[^}]*z-index:\s*5;/);
    await foreground.trigger("pointerdown");
    expect(wrapper.emitted("pointerdown")).toBeUndefined();
    await wrapper.get("[data-sheet-canvas]").trigger("pointerdown");
    expect(wrapper.emitted("pointerdown")).toHaveLength(1);
    await wrapper.setProps({ overlays: {} });
    expect(host.queued).toBe(1);
    wrapper.unmount();
    mounted.splice(mounted.indexOf(wrapper), 1);
    expect(host.queued).toBe(0);
  });
});
