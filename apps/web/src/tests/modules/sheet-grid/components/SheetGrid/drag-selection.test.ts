import { afterEach, describe, expect, test, vi } from "vitest";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";
import SheetCanvasLayer from "../../../../../modules/sheet-grid/components/SheetCanvasLayer.vue";

function dispatchMouse(type: string, options: MouseEventInit): void {
  window.dispatchEvent(new MouseEvent(type, options));
}

describe("SheetGrid drag selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("selects a reverse rectangle without writing history", async () => {
    const { session, wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 3, column: 3 }, "mousedown", {
      button: 0,
      buttons: 1,
      clientX: 346,
      clientY: 94,
    });

    dispatchMouse("mousemove", { buttons: 1, clientX: 10, clientY: 10 });
    dispatchMouse("mouseup", { button: 0, clientX: 10, clientY: 10 });
    await wrapper.vm.$nextTick();

    expect(activeCell(wrapper)).toBe("D4");
    expect(wrapper.get("[data-selection-range]").attributes("style")).toContain("width: 384px");
    expect(wrapper.get("[data-selection-range]").attributes("style")).toContain("height: 96px");
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("scrolls while dragging in the viewport edge band", async () => {
    let scheduledFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller");
    vi.spyOn(scroller.element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 200,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    });

    await triggerCell(wrapper, { row: 0, column: 0 }, "mousedown", {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
    });
    dispatchMouse("mousemove", { buttons: 1, clientX: 410, clientY: 210 });
    scheduledFrame?.(0);
    dispatchMouse("mouseup", { button: 0, clientX: 410, clientY: 210 });
    await wrapper.vm.$nextTick();

    expect((scroller.element as HTMLDivElement).scrollLeft).toBeGreaterThan(0);
    expect((scroller.element as HTMLDivElement).scrollTop).toBeGreaterThan(0);
    expect(wrapper.get("[data-selection-range]").attributes("style")).not.toContain("width: 96px");
  });

  test("keeps displayed cell values cached while a drag only extends the selection", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 2, column: 1 }, "mousedown", {
      button: 0,
      buttons: 1,
      clientX: 110,
      clientY: 58,
    });
    const layer = wrapper.findComponent(SheetCanvasLayer);
    const evaluate = vi.spyOn(layer.props("evaluator"), "getComputedValue");
    dispatchMouse("mousemove", { buttons: 1, clientX: 420, clientY: 180 });
    await wrapper.vm.$nextTick();
    expect(activeCell(wrapper)).toBe("B3");
    expect(wrapper.get("[data-selection-range]").attributes("style")).toContain("width: 384px");
    expect(evaluate).not.toHaveBeenCalled();
    dispatchMouse("mouseup", { button: 0 });
    evaluate.mockRestore();
    wrapper.unmount();
  });
});
