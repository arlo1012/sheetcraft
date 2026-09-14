import type { CellAddress, CellRange } from "@idea10/core/workbook";
import {
  getFillRange,
  getSelectionAutoScrollDelta,
  type FillBounds,
  type FillRange,
} from "@idea10/sheet-engine";
import type { Point, Size } from "@idea10/sheet-engine/geometry";
import { onScopeDispose, shallowRef } from "vue";
import {
  startPointerSession,
  type GestureEvent,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import { clientVectorToSurface } from "../../../shared/sheet-input/surface-coordinates";

type FillDragState = {
  source: CellRange;
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
  moved: boolean;
  copy: boolean;
};

/** Owns the fill-handle drag only; grid rendering and commands stay with its caller. */
export function useFillDrag(options: {
  getBounds: () => FillBounds;
  getCaptureTarget: () => HTMLElement | null;
  getCellAtClientPoint: (clientX: number, clientY: number) => CellAddress | null;
  getSourceRange: () => CellRange | null;
  getScroller: () => HTMLDivElement | null;
  getViewportSize: () => Size;
  getScale?: () => number;
  /** Called only after the drag crosses its threshold, so a handle double-click keeps old UI alive. */
  onDragStart?: () => void;
  onCommit: (fill: FillRange, options: { copy: boolean }) => void;
  onEnsureGridExtentContains: (address: CellAddress) => void;
  onEnsureGridExtentCoversViewport: () => void;
  onPreviewChange?: (fill: FillRange | null, options: { copy: boolean }) => void;
  onScrollPositionChange: (position: Point) => void;
}) {
  const preview = shallowRef<FillRange>();
  let drag: FillDragState | undefined;
  let autoScrollFrame: number | undefined;
  let session: PointerSession | undefined;
  let modifiersAttached = false;

  function cancelAutoScroll(): void {
    if (autoScrollFrame === undefined) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(autoScrollFrame);
    else window.clearTimeout(autoScrollFrame);
    autoScrollFrame = undefined;
  }

  function setPreview(next: FillRange | undefined): void {
    preview.value = next;
    options.onPreviewChange?.(next ?? null, { copy: drag?.copy ?? false });
  }

  function clear(): void {
    cancelAutoScroll();
    drag = undefined;
    setPreview(undefined);
  }

  function updateCopyMode(copy: boolean): void {
    if (!drag || drag.copy === copy) return;
    drag.copy = copy;
    if (drag.moved) setPreview(preview.value);
  }

  function onModifierChange(event: KeyboardEvent): void {
    if (event.key === "Control") updateCopyMode(event.type === "keydown");
  }

  function detachModifiers(): void {
    if (!modifiersAttached) return;
    window.removeEventListener("keydown", onModifierChange, true);
    window.removeEventListener("keyup", onModifierChange, true);
    modifiersAttached = false;
  }

  function stop(): void {
    session?.cancel();
    session = undefined;
    detachModifiers();
    clear();
  }

  function updatePreview(): void {
    if (!drag) return;
    const address = options.getCellAtClientPoint(drag.pointerX, drag.pointerY);
    if (!address) {
      setPreview(undefined);
      return;
    }
    options.onEnsureGridExtentContains(address);
    const next = getFillRange(drag.source, address, {
      bounds: options.getBounds(),
    });
    setPreview(next ?? undefined);
  }

  function requestFrame(callback: FrameRequestCallback): number {
    return typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(callback)
      : window.setTimeout(() => callback(performance.now()), 16);
  }

  function runAutoScroll(): void {
    autoScrollFrame = undefined;
    const scroller = options.getScroller();
    if (!drag?.moved || !scroller) return;
    const bounds = scroller.getBoundingClientRect();
    const viewport = options.getViewportSize();
    const scale = options.getScale?.() ?? 1;
    const clientDelta = getSelectionAutoScrollDelta(
      { x: drag.pointerX, y: drag.pointerY },
      {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right || bounds.left + viewport.width * scale,
        bottom: bounds.bottom || bounds.top + viewport.height * scale,
      },
    );
    if (clientDelta.x === 0 && clientDelta.y === 0) return;
    const delta = clientVectorToSurface(clientDelta, { x: scale, y: scale });
    scroller.scrollLeft = Math.max(0, scroller.scrollLeft + delta.x);
    scroller.scrollTop = Math.max(0, scroller.scrollTop + delta.y);
    options.onScrollPositionChange({
      x: scroller.scrollLeft,
      y: scroller.scrollTop,
    });
    options.onEnsureGridExtentCoversViewport();
    updatePreview();
    autoScrollFrame = requestFrame(runAutoScroll);
  }

  function scheduleAutoScroll(): void {
    cancelAutoScroll();
    if (drag?.moved) autoScrollFrame = requestFrame(runAutoScroll);
  }

  function updateDrag(event: GestureEvent): void {
    if (!drag) return;
    drag.pointerX = event.clientX;
    drag.pointerY = event.clientY;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 3) {
      drag.moved = true;
      options.onDragStart?.();
    }
    if (!drag.moved) return;
    updateCopyMode(event.ctrlKey);
    updatePreview();
    scheduleAutoScroll();
  }

  function onMove(event: GestureEvent): void {
    if ((event.buttons & 1) === 0) {
      stop();
      return;
    }
    updateDrag(event);
  }

  function onEnd(event: GestureEvent): void {
    updateDrag(event);
    const result = preview.value;
    const copy = drag?.copy ?? event.ctrlKey;
    session = undefined;
    detachModifiers();
    clear();
    if (result) options.onCommit(result, { copy });
  }

  function start(event: GestureEvent): void {
    if (event.buttons !== 1) return;
    const source = options.getSourceRange();
    if (!source) return;
    // Do not clear a prior fill option here: a first click in a double-click
    // should leave it present until the new gesture actually moves.
    session?.cancel();
    session = undefined;
    // Keep an un-moved handle as the capture target so the browser can still
    // dispatch its second click/dblclick. The handle stays mounted until this
    // gesture crosses its threshold; use the root only as a fallback.
    const target = (event.currentTarget as HTMLElement | null) ?? options.getCaptureTarget();
    if (!target) return;
    drag = {
      source,
      startX: event.clientX,
      startY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      moved: false,
      copy: event.ctrlKey,
    };
    window.addEventListener("keydown", onModifierChange, true);
    window.addEventListener("keyup", onModifierChange, true);
    modifiersAttached = true;
    session = startPointerSession({
      event,
      captureTarget: target,
      onMove,
      onEnd,
      onCancel: () => {
        session = undefined;
        detachModifiers();
        clear();
      },
    });
  }

  onScopeDispose(stop);
  return { preview, start, stop };
}
