import { afterEach, describe, expect, test } from "vitest";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { useFreezeDrag } from "../../../../modules/sheet-grid/composables/useFreezeDrag";

function createPointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  options: MouseEventInit & { pointerId?: number },
): PointerEvent {
  const event = new MouseEvent(type, options) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
  return event;
}

function createLayout(freeze = { rows: 0, columns: 0 }) {
  return createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount: 8, columnCount: 8, rowHeight: 20, columnWidth: 80 }),
    rows: createRowVisibilityIndex({ rowCount: 8, defaultRowHeight: 20 }),
    freeze,
    viewportSize: { width: 320, height: 120 },
  });
}

function createRoot(scale = 1): HTMLElement {
  const root = document.createElement("div");
  Object.defineProperties(root, {
    offsetWidth: { value: 400, configurable: true },
    offsetHeight: { value: 200, configurable: true },
  });
  root.getBoundingClientRect = () => new DOMRect(0, 0, 400 * scale, 200 * scale);
  return root;
}

function startDrag(
  freeze: ReturnType<typeof useFreezeDrag>,
  axis: "row" | "column",
  event: PointerEvent,
): void {
  const handle = document.createElement("button");
  handle.addEventListener("pointerdown", (pointerEvent) =>
    freeze.start(axis, pointerEvent as PointerEvent),
  );
  handle.dispatchEvent(event);
}

afterEach(() => {
  window.dispatchEvent(createPointerEvent("pointercancel", { pointerId: 1 }));
});

describe("useFreezeDrag", () => {
  test("does not commit when the pointer did not cross the drag threshold", () => {
    const committed: Array<{ rows: number; columns: number }> = [];
    const freeze = useFreezeDrag({
      getRoot: () => createRoot(),
      getLayout: () => createLayout(),
      getHeaderSize: () => ({ width: 48, height: 28 }),
      onDragChange: () => undefined,
      onCommit: (value) => committed.push(value),
    });

    startDrag(freeze, "row", createPointerEvent("pointerdown", { clientY: 29 }));
    window.dispatchEvent(createPointerEvent("pointerup", { clientY: 29 }));

    expect(committed).toEqual([]);
    expect(freeze.freezeDrag.value).toBeUndefined();
  });

  test("uses pointerup coordinates and root CSS zoom when no move event was dispatched", () => {
    const committed: Array<{ rows: number; columns: number }> = [];
    const root = createRoot(2);
    const freeze = useFreezeDrag({
      getRoot: () => root,
      getLayout: () => createLayout({ rows: 0, columns: 3 }),
      getHeaderSize: () => ({ width: 48, height: 28 }),
      onDragChange: () => undefined,
      onCommit: (value) => committed.push(value),
    });

    startDrag(freeze, "row", createPointerEvent("pointerdown", { clientY: 58 }));
    window.dispatchEvent(createPointerEvent("pointerup", { clientY: 136 }));

    expect(committed).toEqual([{ rows: 2, columns: 3 }]);
  });

  test("cancels on Escape and pointer cancellation without committing", () => {
    const committed: Array<{ rows: number; columns: number }> = [];
    const dragChanges: boolean[] = [];
    const freeze = useFreezeDrag({
      getRoot: () => createRoot(),
      getLayout: () => createLayout(),
      getHeaderSize: () => ({ width: 48, height: 28 }),
      onDragChange: (active) => dragChanges.push(active),
      onCommit: (value) => committed.push(value),
    });

    startDrag(freeze, "column", createPointerEvent("pointerdown", { clientX: 49 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    startDrag(freeze, "column", createPointerEvent("pointerdown", { clientX: 49 }));
    window.dispatchEvent(createPointerEvent("pointercancel", { clientX: 160 }));

    expect(committed).toEqual([]);
    expect(dragChanges).toEqual([true, false, true, false]);
  });
});
