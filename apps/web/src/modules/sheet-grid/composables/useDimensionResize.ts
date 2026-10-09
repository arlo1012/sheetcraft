import { onScopeDispose, ref } from "vue";
import {
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  type SheetDimensionAxis,
} from "@sheetcraft/core/workbook";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import { clientDistanceToSurface } from "../../../shared/sheet-input/surface-coordinates";

export type DimensionResizeState = {
  axis: SheetDimensionAxis;
  index: number;
  pointerId: number;
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
  let session: PointerSession | undefined;

  function clampSize(axis: SheetDimensionAxis, size: number): number {
    const minimum = axis === "row" ? MIN_ROW_HEIGHT : MIN_COLUMN_WIDTH;
    const maximum = axis === "row" ? MAX_ROW_HEIGHT : MAX_COLUMN_WIDTH;
    return Math.min(Math.max(Math.round(size), minimum), maximum);
  }

  function stop(): void {
    session?.cancel();
    session = undefined;
    dimensionResize.value = undefined;
  }

  function start(axis: SheetDimensionAxis, payload: DimensionResizeStart): void {
    options.onBeforeStart();
    stop();
    const target = payload.event.currentTarget as HTMLElement | null;
    dimensionResize.value = {
      axis,
      index: payload.index,
      pointerId: payload.event.pointerId,
      startClientPosition: axis === "row" ? payload.event.clientY : payload.event.clientX,
      startSize: payload.startSize,
      previewSize: payload.startSize,
    };

    session = startPointerSession({
      event: payload.event,
      captureTarget: target,
      onMove: onPointerMove,
      onEnd: onPointerUp,
      onCancel: () => {
        session = undefined;
        dimensionResize.value = undefined;
      },
    });
  }

  function request(axis: SheetDimensionAxis, payload: { index: number; size: number }): void {
    options.onCommit({ axis, ...payload });
  }

  function onPointerMove(event: PointerEvent | MouseEvent): void {
    const resize = dimensionResize.value;
    if (!resize || ("pointerId" in event && event.pointerId !== resize.pointerId)) {
      return;
    }
    event.preventDefault();
    const clientPosition = resize.axis === "row" ? event.clientY : event.clientX;
    resize.previewSize = clampSize(
      resize.axis,
      resize.startSize +
        clientDistanceToSurface(
          resize.startClientPosition,
          clientPosition,
          options.getScale?.() ?? 1,
        ),
    );
  }

  function onPointerUp(event: PointerEvent | MouseEvent): void {
    const resize = dimensionResize.value;
    if (!resize || ("pointerId" in event && event.pointerId !== resize.pointerId)) {
      return;
    }
    onPointerMove(event);
    const payload = {
      axis: resize.axis,
      index: resize.index,
      size: resize.previewSize,
    };
    const changed = resize.previewSize !== resize.startSize;
    session = undefined;
    dimensionResize.value = undefined;
    if (changed) {
      options.onCommit(payload);
    }
  }

  onScopeDispose(stop);

  return {
    dimensionResize,
    request,
    start,
    stop,
  };
}
