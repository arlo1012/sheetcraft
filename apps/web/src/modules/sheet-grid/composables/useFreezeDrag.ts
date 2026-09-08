import { ref } from "vue";
import type { FreezePanes, SheetDimensionAxis } from "@idea10/core/workbook";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import {
  getViewportAxisBoundary,
  getViewportAxisBoundaryOffset,
} from "@idea10/sheet-engine/axis-interactions";

export type FreezeAxis = "row" | "column";

export type FreezeDragState = {
  axis: FreezeAxis;
  pointerId: number;
  captureTarget: HTMLElement | null;
  startClientPosition: number;
  count: number;
  previewPosition: number;
};

type HeaderSize = { width: number; height: number };

const DRAG_THRESHOLD = 3;

/**
 * Manages the pointer lifecycle for the grid's freeze handles. It deliberately
 * reads axis items from the viewport layout so filtered rows and frozen panes
 * use exactly the same geometry as the cells and headers.
 */
export function useFreezeDrag(options: {
  getRoot: () => HTMLElement | null;
  getLayout: () => SheetViewportLayout;
  getHeaderSize: () => HeaderSize;
  onDragChange: (active: boolean) => void;
  onCommit: (freezePanes: FreezePanes) => void;
}) {
  const freezeDrag = ref<FreezeDragState>();
  let isStopping = false;

  function getRootScale(): { x: number; y: number } {
    const root = options.getRoot();
    if (!root) return { x: 1, y: 1 };
    const bounds = root.getBoundingClientRect();
    return {
      x: root.offsetWidth > 0 ? bounds.width / root.offsetWidth : 1,
      y: root.offsetHeight > 0 ? bounds.height / root.offsetHeight : 1,
    };
  }

  function getPreview(
    axis: FreezeAxis,
    clientPosition: number,
  ): { count: number; position: number } {
    const root = options.getRoot();
    const layout = options.getLayout();
    const headerSize = options.getHeaderSize();
    if (!root) return { count: 0, position: 0 };
    const bounds = root.getBoundingClientRect();
    const scale = getRootScale();
    const local =
      axis === "row"
        ? (clientPosition - bounds.top) / scale.y - headerSize.height
        : (clientPosition - bounds.left) / scale.x - headerSize.width;
    if (local <= 0) return { count: 0, position: 0 };

    const boundary = getViewportAxisBoundary(layout, axis as SheetDimensionAxis, local);
    if (!boundary) return { count: 0, position: 0 };
    return {
      count: boundary.index,
      position:
        getViewportAxisBoundaryOffset(layout, axis as SheetDimensionAxis, boundary.index) ??
        boundary.offset,
    };
  }

  function stop(): void {
    if (isStopping) return;
    const drag = freezeDrag.value;
    if (!drag) return;
    isStopping = true;
    const target = drag?.captureTarget;
    target?.removeEventListener("lostpointercapture", onLostPointerCapture);
    freezeDrag.value = undefined;
    if (drag && target?.hasPointerCapture?.(drag.pointerId))
      target.releasePointerCapture(drag.pointerId);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("blur", stop);
    options.onDragChange(false);
    isStopping = false;
  }

  function start(axis: FreezeAxis, event: PointerEvent): void {
    if (event.button !== 0) return;
    stop();
    const target = event.currentTarget as HTMLElement | null;
    const position = axis === "row" ? event.clientY : event.clientX;
    const preview = getPreview(axis, position);
    freezeDrag.value = {
      axis,
      pointerId: event.pointerId,
      captureTarget: target,
      startClientPosition: position,
      count: preview.count,
      previewPosition: preview.position,
    };
    target?.setPointerCapture?.(event.pointerId);
    target?.addEventListener("lostpointercapture", onLostPointerCapture);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("blur", stop);
    options.onDragChange(true);
  }

  function onPointerMove(event: PointerEvent): void {
    const drag = freezeDrag.value;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const preview = getPreview(drag.axis, drag.axis === "row" ? event.clientY : event.clientX);
    drag.count = preview.count;
    drag.previewPosition = preview.position;
  }

  function onPointerUp(event: PointerEvent): void {
    const drag = freezeDrag.value;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const scale = getRootScale();
    const distance = Math.abs(
      (drag.axis === "row"
        ? event.clientY - drag.startClientPosition
        : event.clientX - drag.startClientPosition) / (drag.axis === "row" ? scale.y : scale.x),
    );
    const preview = getPreview(drag.axis, drag.axis === "row" ? event.clientY : event.clientX);
    const next = { ...options.getLayout().freeze };
    if (distance >= DRAG_THRESHOLD) {
      if (drag.axis === "row") next.rows = preview.count;
      else next.columns = preview.count;
    }
    stop();
    if (distance >= DRAG_THRESHOLD) options.onCommit(next);
  }

  function onPointerCancel(event: PointerEvent): void {
    if (event.pointerId === freezeDrag.value?.pointerId) stop();
  }

  function onLostPointerCapture(event: PointerEvent): void {
    if (event.pointerId === freezeDrag.value?.pointerId) stop();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    stop();
  }

  return { freezeDrag, start, stop };
}
