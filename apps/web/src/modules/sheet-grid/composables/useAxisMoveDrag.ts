import { onScopeDispose, shallowRef } from "vue";
import type { SheetDimensionAxis } from "@sheetcraft/core/workbook";
import type { Size } from "@sheetcraft/sheet-engine/geometry";
import { getViewportAxisBoundary } from "@sheetcraft/sheet-engine/axis-interactions";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import { clientPointToElementBody } from "../../../shared/sheet-input/surface-coordinates";

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
  let session: PointerSession | undefined;

  function clear(): void {
    drag.value = undefined;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  }

  function stop(): void {
    session?.cancel();
    session = undefined;
    clear();
  }

  function pointerPosition(current: AxisMoveDrag): number | null {
    const root = options.getRoot();
    if (!root) return null;
    const headers = options.getHeaderSize();
    const bodyPoint = clientPointToElementBody(
      { x: current.clientX, y: current.clientY },
      root,
      headers,
    );
    return current.axis === "row" ? bodyPoint.y : bodyPoint.x;
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
    session = undefined;
    clear();
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

  function start(
    axis: SheetDimensionAxis,
    index: number,
    count: number,
    event: PointerEvent,
  ): void {
    stop();
    options.onBeforeStart();
    // The hover handle can disappear once dragging starts; capture on the stable grid root.
    const target = options.getRoot() ?? (event.currentTarget as HTMLElement | null);
    if (!target) return;
    drag.value = {
      axis,
      index,
      count,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      active: false,
      boundary: index,
      offset: 0,
    };
    session = startPointerSession({
      event,
      captureTarget: target,
      onMove: (pointerEvent) => onMove(pointerEvent as PointerEvent),
      onEnd: (pointerEvent) => onUp(pointerEvent as PointerEvent),
      onCancel: () => {
        session = undefined;
        clear();
      },
    });
  }

  onScopeDispose(stop);
  return { drag, start, stop };
}
