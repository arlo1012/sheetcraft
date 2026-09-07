import { ref } from "vue";
import {
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  type SheetDimensionAxis,
} from "@idea10/core/workbook";

export type DimensionResizeState = {
  axis: SheetDimensionAxis;
  index: number;
  pointerId: number;
  captureTarget: HTMLElement | null;
  startClientPosition: number;
  startSize: number;
  previewSize: number;
};

type DimensionResizeStart = {
  index: number;
  event: PointerEvent;
  startSize: number;
};

export function useDimensionResize(options: {
  getScale?: () => number;
  onBeforeStart: () => void;
  onCommit: (payload: { axis: SheetDimensionAxis; index: number; size: number }) => void;
}) {
  const dimensionResize = ref<DimensionResizeState>();

  function clampSize(axis: SheetDimensionAxis, size: number): number {
    const minimum = axis === "row" ? MIN_ROW_HEIGHT : MIN_COLUMN_WIDTH;
    const maximum = axis === "row" ? MAX_ROW_HEIGHT : MAX_COLUMN_WIDTH;
    return Math.min(Math.max(Math.round(size), minimum), maximum);
  }

  function stop(): void {
    const resize = dimensionResize.value;
    const target = resize?.captureTarget;
    target?.removeEventListener("lostpointercapture", onLostPointerCapture);
    if (resize && target?.hasPointerCapture?.(resize.pointerId)) {
      target.releasePointerCapture(resize.pointerId);
    }
    dimensionResize.value = undefined;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("blur", stop);
  }

  function start(axis: SheetDimensionAxis, payload: DimensionResizeStart): void {
    options.onBeforeStart();
    stop();
    const target = payload.event.currentTarget as HTMLElement | null;
    dimensionResize.value = {
      axis,
      index: payload.index,
      pointerId: payload.event.pointerId,
      captureTarget: target,
      startClientPosition: axis === "row" ? payload.event.clientY : payload.event.clientX,
      startSize: payload.startSize,
      previewSize: payload.startSize,
    };

    target?.setPointerCapture?.(payload.event.pointerId);
    target?.addEventListener("lostpointercapture", onLostPointerCapture);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", stop);
  }

  function request(axis: SheetDimensionAxis, payload: { index: number; size: number }): void {
    options.onCommit({ axis, ...payload });
  }

  function onPointerMove(event: PointerEvent): void {
    const resize = dimensionResize.value;
    if (!resize || event.pointerId !== resize.pointerId) {
      return;
    }
    event.preventDefault();
    const clientPosition = resize.axis === "row" ? event.clientY : event.clientX;
    resize.previewSize = clampSize(
      resize.axis,
      resize.startSize +
        (clientPosition - resize.startClientPosition) / (options.getScale?.() ?? 1),
    );
  }

  function onPointerUp(event: PointerEvent): void {
    const resize = dimensionResize.value;
    if (!resize || event.pointerId !== resize.pointerId) {
      return;
    }
    const payload = {
      axis: resize.axis,
      index: resize.index,
      size: resize.previewSize,
    };
    const changed = resize.previewSize !== resize.startSize;
    stop();
    if (changed) {
      options.onCommit(payload);
    }
  }

  function onPointerCancel(event: PointerEvent): void {
    if (event.pointerId === dimensionResize.value?.pointerId) {
      stop();
    }
  }

  function onLostPointerCapture(event: PointerEvent): void {
    if (event.pointerId === dimensionResize.value?.pointerId) {
      stop();
    }
  }

  return {
    dimensionResize,
    request,
    start,
    stop,
  };
}
