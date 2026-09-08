import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { useAxisMoveDrag } from "../../../../../modules/sheet-grid/composables/useAxisMoveDrag";

function createPointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  options: MouseEventInit & { pointerId?: number },
): PointerEvent {
  const event = new MouseEvent(type, options) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
  return event;
}

function createLayout() {
  return createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount: 8, columnCount: 8, rowHeight: 20, columnWidth: 80 }),
    rows: createRowVisibilityIndex({ rowCount: 8, defaultRowHeight: 20 }),
    viewportSize: { width: 320, height: 120 },
  });
}

function createRoot(scale = 1): HTMLElement {
  const root = document.createElement("div");
  Object.defineProperties(root, {
    offsetWidth: { value: 400, configurable: true },
    offsetHeight: { value: 200, configurable: true },
  });
  root.getBoundingClientRect = () => new DOMRect(10, 20, 400 * scale, 200 * scale);
  return root;
}

function startDrag(
  drag: ReturnType<typeof useAxisMoveDrag>,
  axis: "row" | "column",
  index: number,
  count: number,
  event: PointerEvent,
): HTMLElement {
  const handle = document.createElement("button");
  handle.addEventListener("pointerdown", (pointerEvent) =>
    drag.start(axis, index, count, pointerEvent as PointerEvent),
  );
  handle.dispatchEvent(event);
  return handle;
}

function createDrag(root = createRoot()) {
  const commits: Array<{ axis: "row" | "column"; index: number; count: number; toIndex: number }> =
    [];
  const drag = useAxisMoveDrag({
    getRoot: () => root,
    getLayout: createLayout,
    getHeaderSize: () => ({ width: 48, height: 28 }),
    getScroller: () => null,
    onScroll: () => undefined,
    onBeforeStart: () => undefined,
    onCommit: (payload) => commits.push(payload),
  });
  return { drag, commits };
}

afterEach(() => {
  window.dispatchEvent(createPointerEvent("pointercancel", { pointerId: 1 }));
  window.dispatchEvent(createPointerEvent("pointercancel", { pointerId: 2 }));
});

describe("useAxisMoveDrag", () => {
  test("does not move before the four-pixel threshold", () => {
    const { drag, commits } = createDrag();

    startDrag(drag, "row", 1, 1, createPointerEvent("pointerdown", { clientY: 68 }));
    window.dispatchEvent(createPointerEvent("pointerup", { clientY: 71 }));

    expect(commits).toEqual([]);
    expect(drag.drag.value).toBeUndefined();
  });

  test("uses the final pointerup position when no pointermove was dispatched", () => {
    const { drag, commits } = createDrag();

    startDrag(drag, "row", 1, 1, createPointerEvent("pointerdown", { clientY: 68 }));
    window.dispatchEvent(createPointerEvent("pointerup", { clientY: 148 }));

    expect(commits).toEqual([{ axis: "row", index: 1, count: 1, toIndex: 4 }]);
  });

  test("converts multi-row insertion boundaries before and after the moved range", () => {
    const { drag, commits } = createDrag();

    startDrag(drag, "row", 2, 2, createPointerEvent("pointerdown", { clientY: 88 }));
    window.dispatchEvent(createPointerEvent("pointerup", { clientY: 48 }));

    startDrag(drag, "row", 2, 2, createPointerEvent("pointerdown", { clientY: 88, pointerId: 2 }));
    window.dispatchEvent(createPointerEvent("pointerup", { clientY: 168, pointerId: 2 }));

    expect(commits).toEqual([
      { axis: "row", index: 2, count: 2, toIndex: 0 },
      { axis: "row", index: 2, count: 2, toIndex: 4 },
    ]);
  });

  test("maps client positions through CSS zoom before finding the target boundary", () => {
    const { drag, commits } = createDrag(createRoot(2));

    startDrag(drag, "row", 1, 1, createPointerEvent("pointerdown", { clientY: 116 }));
    window.dispatchEvent(createPointerEvent("pointerup", { clientY: 276 }));

    expect(commits).toEqual([{ axis: "row", index: 1, count: 1, toIndex: 4 }]);
  });

  test("captures on the stable root after the source handle is removed", () => {
    const root = createRoot();
    const capture = vi.fn();
    Object.defineProperty(root, "setPointerCapture", { value: capture });
    const { drag, commits } = createDrag(root);

    const handle = startDrag(drag, "row", 1, 1, createPointerEvent("pointerdown", { clientY: 68 }));
    handle.remove();
    window.dispatchEvent(createPointerEvent("pointerup", { clientY: 148 }));

    expect(capture).toHaveBeenCalledWith(1);
    expect(commits).toEqual([{ axis: "row", index: 1, count: 1, toIndex: 4 }]);
  });

  test("cancels on Escape or pointercancel and does not commit after returning to its own range", () => {
    const { drag, commits } = createDrag();

    startDrag(drag, "row", 1, 1, createPointerEvent("pointerdown", { clientY: 68 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    startDrag(drag, "row", 1, 1, createPointerEvent("pointerdown", { clientY: 68 }));
    window.dispatchEvent(createPointerEvent("pointercancel", { clientY: 148 }));

    startDrag(drag, "row", 2, 2, createPointerEvent("pointerdown", { clientY: 88 }));
    window.dispatchEvent(createPointerEvent("pointermove", { clientY: 148 }));
    window.dispatchEvent(createPointerEvent("pointerup", { clientY: 88 }));

    expect(commits).toEqual([]);
    expect(drag.drag.value).toBeUndefined();
  });
});
