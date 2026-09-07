import { extendCellSelection, type CellSelection } from "@idea10/sheet-engine/selection";
import type { CellAddress } from "@idea10/core/workbook";
import type { Point, Size } from "@idea10/sheet-engine/geometry";
import { getSelectionAutoScrollDelta } from "@idea10/sheet-engine/selection";

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
  onEnsureGridExtentContains: (address: CellAddress) => void;
  onEnsureGridExtentCoversViewport: () => void;
  onScrollPositionChange: (position: Point) => void;
  onSelectionChange: (selection: CellSelection, visibleAddress: CellAddress) => void;
}) {
  let dragSelection: DragSelectionState | undefined;
  let autoScrollFrame: number | undefined;

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

  function stop(): void {
    cancelAutoScroll();
    dragSelection = undefined;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
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
    scroller.scrollLeft = Math.max(0, scroller.scrollLeft + delta.x / scale);
    scroller.scrollTop = Math.max(0, scroller.scrollTop + delta.y / scale);
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

  function onMouseMove(event: MouseEvent): void {
    if (!dragSelection) {
      return;
    }
    dragSelection.pointerX = event.clientX;
    dragSelection.pointerY = event.clientY;
    if (
      !dragSelection.moved &&
      Math.hypot(event.clientX - dragSelection.startX, event.clientY - dragSelection.startY) >= 3
    ) {
      dragSelection.moved = true;
    }
    if (!dragSelection.moved) {
      return;
    }
    updateSelectionAddress();
    scheduleAutoScroll();
  }

  function onMouseUp(): void {
    const completed = Boolean(dragSelection);
    stop();
    if (completed) {
      options.onComplete();
    }
  }

  function start(baseSelection: CellSelection, event: MouseEvent): void {
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
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return {
    start,
    stop,
  };
}
