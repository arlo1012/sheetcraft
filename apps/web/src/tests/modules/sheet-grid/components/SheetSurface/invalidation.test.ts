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

function mountCanvasGrid() {
  const result = mountSheetGrid();
  mountedWrappers.push(result.wrapper);
  return result;
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SheetSurface invalidation", () => {
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
