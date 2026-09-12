import { ref } from "vue";
import type { FreezePanes, SheetDimensionAxis } from "@idea10/core/workbook";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import {
  getViewportAxisBoundary,
  getViewportAxisBoundaryOffset,
} from "@idea10/sheet-engine/axis-interactions";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import {
  clientDistanceToSurface,
  clientPointToElementBody,
  getElementEffectiveScale,
} from "../../../shared/sheet-input/surface-coordinates";

export type FreezeAxis = "row" | "column";

export type FreezeDragState = {
  axis: FreezeAxis;
  pointerId: number;
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
  let session: PointerSession | undefined;

  function getPreview(
    axis: FreezeAxis,
    clientPosition: number,
  ): { count: number; position: number } {
    const root = options.getRoot();
    const layout = options.getLayout();
    if (!root) return { count: 0, position: 0 };
    const bodyPoint = clientPointToElementBody(
      axis === "row" ? { x: 0, y: clientPosition } : { x: clientPosition, y: 0 },
      root,
      options.getHeaderSize(),
    );
    const local = axis === "row" ? bodyPoint.y : bodyPoint.x;
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

  function clear(): void {
    if (isStopping) return;
    const drag = freezeDrag.value;
    if (!drag) return;
    isStopping = true;
    freezeDrag.value = undefined;
    options.onDragChange(false);
    isStopping = false;
  }

  function stop(): void {
    session?.cancel();
    session = undefined;
    clear();
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
      startClientPosition: position,
      count: preview.count,
      previewPosition: preview.position,
    };
    session = startPointerSession({
      event,
      captureTarget: target,
      onMove: (pointerEvent) => onPointerMove(pointerEvent as PointerEvent),
      onEnd: (pointerEvent) => onPointerUp(pointerEvent as PointerEvent),
      onCancel: () => {
        session = undefined;
        clear();
      },
    });
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
    const root = options.getRoot();
    const scale = root ? getElementEffectiveScale(root) : { x: 1, y: 1 };
    const distance = Math.abs(
      clientDistanceToSurface(
        drag.startClientPosition,
        drag.axis === "row" ? event.clientY : event.clientX,
        drag.axis === "row" ? scale.y : scale.x,
      ),
    );
    const preview = getPreview(drag.axis, drag.axis === "row" ? event.clientY : event.clientX);
    const next = { ...options.getLayout().freeze };
    if (distance >= DRAG_THRESHOLD) {
      if (drag.axis === "row") next.rows = preview.count;
      else next.columns = preview.count;
    }
    session = undefined;
    clear();
    if (distance >= DRAG_THRESHOLD) options.onCommit(next);
  }

  return { freezeDrag, start, stop };
}
