import { onScopeDispose, shallowRef } from "vue";
import type { SheetDimensionAxis } from "@idea10/core/workbook";
import type { Size } from "@idea10/sheet-engine/geometry";
import { getViewportAxisBoundary } from "@idea10/sheet-engine/axis-interactions";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";

export type AxisMovePayload = {
  axis: SheetDimensionAxis;
  index: number;
  count: number;
  toIndex: number;
};

type AxisMoveDrag = {
  axis: SheetDimensionAxis;
  index: number;
  count: number;
  pointerId: number;
  target: HTMLElement;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  active: boolean;
  boundary: number;
  offset: number;
};

export function useAxisMoveDrag(options: {
  getRoot: () => HTMLElement | null;
  getLayout: () => SheetViewportLayout;
  getHeaderSize: () => Size;
  getScroller: () => HTMLDivElement | null;
  onScroll: (position: { x: number; y: number }) => void;
  onBeforeStart: () => void;
  onCommit: (payload: AxisMovePayload) => void;
}) {
  const drag = shallowRef<AxisMoveDrag>();
  let frame: number | undefined;

  function stop(): void {
    const current = drag.value;
    drag.value = undefined;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    current?.target.removeEventListener("lostpointercapture", onCancel);
    if (current?.target.hasPointerCapture?.(current.pointerId)) {
      current.target.releasePointerCapture(current.pointerId);
    }
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("blur", stop);
  }

  function pointerPosition(current: AxisMoveDrag): number | null {
    const root = options.getRoot();
    if (!root) return null;
    const bounds = root.getBoundingClientRect();
    const headers = options.getHeaderSize();
    const isRow = current.axis === "row";
    const extent = isRow ? root.offsetHeight : root.offsetWidth;
    const pixels = isRow ? bounds.height : bounds.width;
    const scale = extent > 0 && pixels > 0 ? pixels / extent : 1;
    return (
      ((isRow ? current.clientY : current.clientX) - (isRow ? bounds.top : bounds.left)) / scale -
      (isRow ? headers.height : headers.width)
    );
  }

  function updatePreview(current: AxisMoveDrag): void {
    const position = pointerPosition(current);
    if (position === null) return;
    const boundary = getViewportAxisBoundary(options.getLayout(), current.axis, position);
    if (boundary) drag.value = { ...current, boundary: boundary.index, offset: boundary.offset };
  }

  function autoScroll(): void {
    frame = undefined;
    const current = drag.value;
    const scroller = options.getScroller();
    if (!current?.active || !scroller) return;
    const position = pointerPosition(current);
    if (position === null) return;
    const size = options.getLayout().viewportSize;
    const end = current.axis === "row" ? size.height : size.width;
    const delta = position < 24 ? -12 : position > end - 24 ? 12 : 0;
    if (delta !== 0) {
      const property = current.axis === "row" ? "scrollTop" : "scrollLeft";
      const before = scroller[property];
      scroller[property] = Math.max(0, before + delta);
      if (before !== scroller[property]) {
        options.onScroll({ x: scroller.scrollLeft, y: scroller.scrollTop });
        updatePreview(current);
      }
    }
    frame = requestAnimationFrame(autoScroll);
  }

  function onMove(event: PointerEvent): void {
    const current = drag.value;
    if (!current || event.pointerId !== current.pointerId) return;
    const active =
      current.active ||
      Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= 4;
    const next = {
      ...current,
      active,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    drag.value = next;
    if (!active) return;
    event.preventDefault();
    updatePreview(next);
    if (frame === undefined) frame = requestAnimationFrame(autoScroll);
  }

  function onUp(event: PointerEvent): void {
    if (event.pointerId !== drag.value?.pointerId) return;
    onMove(event);
    const current = drag.value;
    stop();
    if (!current?.active) return;
    if (current.boundary >= current.index && current.boundary <= current.index + current.count)
      return;
    const toIndex =
      current.boundary > current.index ? current.boundary - current.count : current.boundary;
    if (toIndex === current.index) return;
    options.onCommit({
      axis: current.axis,
      index: current.index,
      count: current.count,
      toIndex,
    });
  }

  function onCancel(event: PointerEvent): void {
    if (event.pointerId === drag.value?.pointerId) stop();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop();
    }
  }

  function start(
    axis: SheetDimensionAxis,
    index: number,
    count: number,
    event: PointerEvent,
  ): void {
    stop();
    options.onBeforeStart();
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    drag.value = {
      axis,
      index,
      count,
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      active: false,
      boundary: index,
      offset: 0,
    };
    target.setPointerCapture?.(event.pointerId);
    target.addEventListener("lostpointercapture", onCancel);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("blur", stop);
  }

  onScopeDispose(stop);
  return { drag, start, stop };
}
