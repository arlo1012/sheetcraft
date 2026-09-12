import { afterEach, describe, expect, test, vi } from "vitest";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";

function dispatchPointer(type: "pointermove" | "pointerup", options: MouseEventInit): void {
  const event = new MouseEvent(type, options) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: 1 });
  window.dispatchEvent(event);
}

function rangeRects(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]) {
  return wrapper.getComponent(SheetSurface).props("overlays").rangeRects ?? [];
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

    dispatchPointer("pointermove", { buttons: 1, clientX: 10, clientY: 10 });
    dispatchPointer("pointerup", { button: 0, clientX: 10, clientY: 10 });
    await wrapper.vm.$nextTick();

    expect(activeCell(wrapper)).toBe("D4");
    expect(rangeRects(wrapper)[0]!.rect).toMatchObject({ width: 384, height: 96 });
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
    dispatchPointer("pointermove", { buttons: 1, clientX: 410, clientY: 210 });
    scheduledFrame?.(0);
    dispatchPointer("pointerup", { button: 0, clientX: 410, clientY: 210 });
    await wrapper.vm.$nextTick();

    expect((scroller.element as HTMLDivElement).scrollLeft).toBeGreaterThan(0);
    expect((scroller.element as HTMLDivElement).scrollTop).toBeGreaterThan(0);
    expect(rangeRects(wrapper)[0]!.rect.width).not.toBe(96);
  });

  test("keeps displayed cell values cached while a drag only extends the selection", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 2, column: 1 }, "mousedown", {
      button: 0,
      buttons: 1,
      clientX: 110,
      clientY: 58,
    });
    const surface = wrapper.findComponent(SheetSurface);
    const evaluate = vi.spyOn(surface.props("display").evaluator, "getComputedValue");
    dispatchPointer("pointermove", { buttons: 1, clientX: 420, clientY: 180 });
    await wrapper.vm.$nextTick();
    expect(activeCell(wrapper)).toBe("B3");
    expect(rangeRects(wrapper)[0]!.rect.width).toBe(384);
    expect(evaluate).not.toHaveBeenCalled();
    dispatchPointer("pointerup", { button: 0 });
    evaluate.mockRestore();
    wrapper.unmount();
  });
});
