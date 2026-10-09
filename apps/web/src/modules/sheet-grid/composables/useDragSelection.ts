import { extendCellSelection, type CellSelection } from "@sheetcraft/sheet-engine/selection";
import { onScopeDispose } from "vue";
import type { CellAddress } from "@sheetcraft/core/workbook";
import type { Point, Size } from "@sheetcraft/sheet-engine/geometry";
import { getSelectionAutoScrollDelta } from "@sheetcraft/sheet-engine/selection";
import {
  startPointerSession,
  type GestureEvent,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import { clientVectorToSurface } from "../../../shared/sheet-input/surface-coordinates";

type DragSelectionState = {
  baseSelection: CellSelection;
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
  moved: boolean;
};

export function useDragSelection(options: {
  getScale?: () => number;
  getCellAtClientPoint: (clientX: number, clientY: number) => CellAddress | null;
  getScroller: () => HTMLDivElement | null;
  getViewportSize: () => Size;
  onComplete: () => void;
  onDraggingChange?: (dragging: boolean) => void;
  onEnsureGridExtentContains: (address: CellAddress) => void;
  onEnsureGridExtentCoversViewport: () => void;
  onScrollPositionChange: (position: Point) => void;
  onSelectionChange: (selection: CellSelection, visibleAddress: CellAddress) => void;
}) {
  let dragSelection: DragSelectionState | undefined;
  let autoScrollFrame: number | undefined;
  let session: PointerSession | undefined;

  function cancelAutoScroll(): void {
    if (autoScrollFrame === undefined) {
      return;
    }
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(autoScrollFrame);
    } else {
      window.clearTimeout(autoScrollFrame);
    }
    autoScrollFrame = undefined;
  }

  function clear(): boolean {
    cancelAutoScroll();
    const moved = dragSelection?.moved;
    dragSelection = undefined;
    if (moved) options.onDraggingChange?.(false);
    return Boolean(moved);
  }

  function stop(): void {
    session?.cancel();
    session = undefined;
    clear();
  }

  function updateSelectionAddress(): void {
    if (!dragSelection) {
      return;
    }
    const address = options.getCellAtClientPoint(dragSelection.pointerX, dragSelection.pointerY);
    if (!address) {
      return;
    }
    options.onEnsureGridExtentContains(address);
    options.onSelectionChange(extendCellSelection(dragSelection.baseSelection, address), address);
  }

  function requestAutoScrollFrame(callback: FrameRequestCallback): number {
    return typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(callback)
      : window.setTimeout(() => callback(performance.now()), 16);
  }

  function runAutoScroll(): void {
    autoScrollFrame = undefined;
    const scroller = options.getScroller();
    if (!dragSelection || !scroller) {
      return;
    }
    const bounds = scroller.getBoundingClientRect();
    const viewportSize = options.getViewportSize();
    const scale = options.getScale?.() ?? 1;
    const delta = getSelectionAutoScrollDelta(
      { x: dragSelection.pointerX, y: dragSelection.pointerY },
      {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right || bounds.left + viewportSize.width * scale,
        bottom: bounds.bottom || bounds.top + viewportSize.height * scale,
      },
    );
    if (delta.x === 0 && delta.y === 0) {
      return;
    }
    const surfaceDelta = clientVectorToSurface(delta, { x: scale, y: scale });
    scroller.scrollLeft = Math.max(0, scroller.scrollLeft + surfaceDelta.x);
    scroller.scrollTop = Math.max(0, scroller.scrollTop + surfaceDelta.y);
    options.onScrollPositionChange({ x: scroller.scrollLeft, y: scroller.scrollTop });
    options.onEnsureGridExtentCoversViewport();
    updateSelectionAddress();
    autoScrollFrame = requestAutoScrollFrame(runAutoScroll);
  }

  function scheduleAutoScroll(): void {
    cancelAutoScroll();
    if (dragSelection) {
      autoScrollFrame = requestAutoScrollFrame(runAutoScroll);
    }
  }

  function onMouseMove(event: GestureEvent): void {
    if (!dragSelection) {
      return;
    }
    if ((event.buttons & 1) === 0) {
      stop();
      return;
    }
    dragSelection.pointerX = event.clientX;
    dragSelection.pointerY = event.clientY;
    if (
      !dragSelection.moved &&
      Math.hypot(event.clientX - dragSelection.startX, event.clientY - dragSelection.startY) >= 3
    ) {
      dragSelection.moved = true;
      options.onDraggingChange?.(true);
    }
    if (!dragSelection.moved) {
      return;
    }
    updateSelectionAddress();
    scheduleAutoScroll();
  }

  function onMouseUp(): void {
    const completed = Boolean(dragSelection);
    session = undefined;
    clear();
    if (completed) {
      options.onComplete();
    }
  }

  function start(baseSelection: CellSelection, event: GestureEvent): void {
    if (event.buttons !== 1) {
      return;
    }
    stop();
    dragSelection = {
      baseSelection,
      startX: event.clientX,
      startY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      moved: false,
    };
    session = startPointerSession({
      event,
      captureTarget: event.currentTarget as HTMLElement | null,
      onMove: onMouseMove,
      onEnd: onMouseUp,
      onCancel: () => {
        session = undefined;
        clear();
      },
    });
  }

  onScopeDispose(stop);

  return {
    start,
    stop,
  };
}
