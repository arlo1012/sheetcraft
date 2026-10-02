import { afterEach, describe, expect, test, vi } from "vitest";
import { setCellValue } from "@idea10/core/workbook";
import * as borderPainter from "../../../../../modules/sheet-grid/canvas/border-painter";
import * as cellScene from "../../../../../modules/sheet-grid/canvas/cell-scene";
import * as scenePainter from "../../../../../modules/sheet-grid/canvas/scene-painter";
import * as headerPainter from "../../../../../modules/sheet-grid/rendering/header-painter";
import * as overlayPainter from "../../../../../modules/sheet-grid/rendering/overlay-painter";
import { mountSheetGrid, triggerCell } from "../SheetGrid/fixture";

type Frame = { id: number; callback: FrameRequestCallback };

function installCanvasHost() {
  const frames: Frame[] = [];
  let nextFrame = 1;
  const request = vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.push({ id, callback });
    return id;
  });
  const cancel = vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const index = frames.findIndex((frame) => frame.id === id);
    if (index >= 0) frames.splice(index, 1);
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        drawImage: vi.fn(),
      }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(scenePainter, "paintSheetScene").mockImplementation(() => undefined);
  vi.spyOn(borderPainter, "paintSheetBorders").mockImplementation(() => undefined);
  vi.spyOn(headerPainter, "paintSheetHeaders").mockImplementation(() => undefined);
  vi.spyOn(overlayPainter, "paintSheetUnderlay").mockImplementation(() => undefined);
  vi.spyOn(overlayPainter, "paintSheetForeground").mockImplementation(() => undefined);
  vi.spyOn(overlayPainter, "paintSheetChrome").mockImplementation(() => undefined);

  return {
    flush() {
      const pending = frames.splice(0);
      for (const frame of pending) frame.callback(0);
    },
    get queued() {
      return frames.length;
    },
    request,
    cancel,
  };
}

const mountedWrappers: Array<{ unmount(): void }> = [];

function mountCanvasGrid(options?: Parameters<typeof mountSheetGrid>[0]) {
  const result = mountSheetGrid(options);
  mountedWrappers.push(result.wrapper);
  return result;
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SheetSurface invalidation", () => {
  test("increases the backing resolution with zoom while passing screen scale to the painters", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const host = installCanvasHost();
    const paint = vi.spyOn(scenePainter, "paintSheetScene");
    const { wrapper } = mountCanvasGrid();
    host.flush();
    await wrapper.vm.$nextTick();
    host.flush();
    for (const zoom of [125, 200, 400]) {
      await wrapper.setProps({ zoom });
      host.flush();
      const surface = wrapper.findComponent({ name: "SheetSurface" });
      const { frame, environment } = surface.props();
      const canvas = wrapper.get<HTMLCanvasElement>("[data-sheet-canvas]").element;
      expect(environment.density).toBe(2);
      expect(canvas.width).toBe(Math.ceil((frame.size.width * 2 * zoom) / 100));
      expect(canvas.height).toBe(Math.ceil((frame.size.height * 2 * zoom) / 100));
      expect(paint.mock.calls.at(-1)?.[3].screenScale).toBe(zoom / 100);
    }
  });

  test("refreshes the canvas palette when an ancestor display mode changes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const getStyle = vi.fn(() => {
      const eyeComfort = host.classList.contains("is-eye-comfort");
      return {
        fontFamily: "Arial",
        getPropertyValue(name: string) {
          if (name === "--idea-surface-panel") return eyeComfort ? "#f3f0dd" : "#ffffff";
          if (name === "--idea-surface-secondary") return eyeComfort ? "#e8e5cc" : "#f5f6f7";
          if (name === "--idea-border-subtle") return eyeComfort ? "#d8d3ad" : "#e5e7eb";
          return "";
        },
      } as CSSStyleDeclaration;
    });
    vi.stubGlobal("getComputedStyle", getStyle);
    const canvas = installCanvasHost();
    const paint = vi.spyOn(scenePainter, "paintSheetScene");
    const { wrapper } = mountCanvasGrid({ attachTo: host });
    canvas.flush();
    await wrapper.vm.$nextTick();
    canvas.flush();
    paint.mockClear();

    host.classList.add("has-unrelated-layout-state");
    await Promise.resolve();
    await wrapper.vm.$nextTick();
    canvas.flush();
    expect(paint).not.toHaveBeenCalled();

    host.classList.add("is-eye-comfort");
    await Promise.resolve();
    await wrapper.vm.$nextTick();
    canvas.flush();

    expect(getStyle).toHaveBeenCalled();
    expect(paint).toHaveBeenCalledOnce();
    expect(paint.mock.calls[0]?.[3].palette.background).toBe("#f3f0dd");
    host.remove();
  });

  test("repaints one canvas with cached content and borders when the selection changes", async () => {
    const host = installCanvasHost();
    const createScene = vi.spyOn(cellScene, "createSheetCanvasScene");
    const createBorders = vi.spyOn(borderPainter, "createBorderPaintPlan");
    const paint = vi.spyOn(scenePainter, "paintSheetScene");
    const { wrapper } = mountCanvasGrid();
    host.flush();
    await wrapper.vm.$nextTick();
    host.flush();
    createScene.mockClear();
    createBorders.mockClear();
    paint.mockClear();

    await triggerCell(wrapper, { row: 2, column: 3 }, "mousedown", { button: 0 });
    host.flush();

    expect(createScene).not.toHaveBeenCalled();
    expect(createBorders).not.toHaveBeenCalled();
    expect(paint).toHaveBeenCalledOnce();
    expect(wrapper.findAll("canvas")).toHaveLength(1);
  });

  test("repaints error markers without rebuilding document content", async () => {
    const host = installCanvasHost();
    const createScene = vi.spyOn(cellScene, "createSheetCanvasScene");
    const paint = vi.spyOn(scenePainter, "paintSheetScene");
    const { wrapper } = mountCanvasGrid();
    host.flush();
    await wrapper.vm.$nextTick();
    host.flush();
    createScene.mockClear();
    paint.mockClear();
    const errorCells = new Set(["0:0", "1:1"]);
    await wrapper.setProps({ errorCells });
    host.flush();
    expect(createScene).not.toHaveBeenCalled();
    expect(paint).toHaveBeenCalledOnce();
    expect(paint.mock.calls[0]?.[3].errorCells).toEqual(errorCells);
    const automaticColor = paint.mock.calls[0]?.[3].palette.errorIndicator;
    paint.mockClear();
    await wrapper.setProps({ errorIndicatorColor: "#ff0000" });
    host.flush();
    expect(createScene).not.toHaveBeenCalled();
    expect(paint).toHaveBeenCalledOnce();
    expect(paint.mock.calls[0]?.[3].palette.errorIndicator).toBe("#ff0000");
    await wrapper.setProps({ errorIndicatorColor: null });
    host.flush();
    expect(paint.mock.calls.at(-1)?.[3].palette.errorIndicator).toBe(automaticColor);
    await wrapper.setProps({ errorCells: new Set() });
    host.flush();
    expect(paint.mock.calls.at(-1)?.[3].errorCells?.size).toBe(0);
  });

  test("repaints a sub-cell scroll without rebuilding its scene or border plan", async () => {
    const host = installCanvasHost();
    const createScene = vi.spyOn(cellScene, "createSheetCanvasScene");
    const createBorders = vi.spyOn(borderPainter, "createBorderPaintPlan");
    const paint = vi.spyOn(scenePainter, "paintSheetScene");
    const { wrapper } = mountCanvasGrid();
    host.flush();
    await wrapper.vm.$nextTick();
    host.flush();
    createScene.mockClear();
    createBorders.mockClear();
    paint.mockClear();

    const scroller = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
    scroller.element.scrollTop = 1;
    scroller.element.scrollLeft = 1;
    await scroller.trigger("scroll");
    host.flush();
    createScene.mockClear();
    createBorders.mockClear();
    paint.mockClear();
    scroller.element.scrollTop = 2;
    scroller.element.scrollLeft = 2;
    await scroller.trigger("scroll");
    expect(host.queued).toBe(1);
    host.flush();

    expect(createScene).not.toHaveBeenCalled();
    expect(createBorders).not.toHaveBeenCalled();
    expect(paint).toHaveBeenCalledTimes(1);
  });

  test("coalesces repeated scroll updates into one animation-frame paint", async () => {
    const host = installCanvasHost();
    const paint = vi.spyOn(scenePainter, "paintSheetScene");
    const { wrapper } = mountCanvasGrid();
    host.flush();
    await wrapper.vm.$nextTick();
    host.flush();
    paint.mockClear();

    const scroller = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
    for (const position of [1, 2, 3]) {
      scroller.element.scrollTop = position;
      await scroller.trigger("scroll");
    }
    expect(host.queued).toBe(1);
    host.flush();
    expect(paint).toHaveBeenCalledTimes(1);
  });

  test("rebuilds and paints when a workbook revision changes visible content", async () => {
    const host = installCanvasHost();
    const createScene = vi.spyOn(cellScene, "createSheetCanvasScene");
    const createBorders = vi.spyOn(borderPainter, "createBorderPaintPlan");
    const paint = vi.spyOn(scenePainter, "paintSheetScene");
    const { sheet, wrapper } = mountCanvasGrid();
    host.flush();
    await wrapper.vm.$nextTick();
    host.flush();
    createScene.mockClear();
    createBorders.mockClear();
    paint.mockClear();

    setCellValue(sheet, { row: 0, column: 0 }, "changed");
    await wrapper.setProps({ workbookRevision: 1 });
    host.flush();

    expect(createScene).toHaveBeenCalledTimes(1);
    expect(createBorders).toHaveBeenCalledTimes(1);
    expect(paint).toHaveBeenCalledTimes(1);
  });
});
