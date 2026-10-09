import { nextTick, onBeforeUnmount, ref } from "vue";
import { cloneSheetPageSetup, type SheetPageSetup } from "@sheetcraft/core/page-setup";
import { adjustSheetPageMargin, type SheetPageMargin } from "@sheetcraft/sheet-engine/page-layout";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { SheetRenderFrame } from "../sheet-grid/rendering/sheet-render-frame";
import type { PageViewPage, PageViewPaintState } from "./page-view-types";

export type PageMarginDragStart = {
  margin: SheetPageMargin;
  page: PageViewPage;
  event: PointerEvent;
};

export function usePageMarginDrag(options: {
  getState: () => PageViewPaintState | undefined;
  getFrame: () => SheetRenderFrame;
  getSetup: () => SheetPageSetup;
  getSurfacePoint: (event: MouseEvent) => Point;
  isDisabled: () => boolean;
  onBeforeStart: () => boolean;
  onPreview: (setup?: SheetPageSetup) => void;
  onChange: (setup: SheetPageSetup) => void;
}) {
  const cursor = ref<string>();
  const activeMargin = ref<SheetPageMargin>();
  const pointerPosition = ref<Point>();
  let disposed = false;
  let drag:
    | {
        margin: SheetPageMargin;
        startEvent: PointerEvent;
        pointerId: number;
        setup: SheetPageSetup;
        result?: SheetPageSetup;
      }
    | undefined;

  function stop(): void {
    if (!drag) return;
    drag = undefined;
    cursor.value = undefined;
    activeMargin.value = undefined;
    pointerPosition.value = undefined;
    options.onPreview();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", stop);
    window.removeEventListener("blur", stop);
    window.removeEventListener("keydown", keydown, true);
  }
  function keydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    stop();
  }
  function update(event: PointerEvent): void {
    if (!drag || (event.pointerId ?? 0) !== drag.pointerId) return;
    if (options.isDisabled() || options.getState()?.mode !== "page-layout") {
      stop();
      return;
    }
    const surface = options.getSurfacePoint(event);
    pointerPosition.value = surface;
    const origin = options.getSurfacePoint(drag.startEvent);
    const horizontal = drag.margin === "left" || drag.margin === "right";
    const delta = horizontal ? surface.x - origin.x : surface.y - origin.y;
    if (Math.abs(delta * options.getFrame().scale) < 0.5) {
      drag.result = undefined;
      options.onPreview();
      return;
    }
    // Pointer displacement stays stable when finishing a header hides its toolbar.
    const direction =
      drag.margin === "right" || drag.margin === "bottom" || drag.margin === "footer" ? -1 : 1;
    const valueMm =
      Math.round(
        (drag.setup.margins[drag.margin] +
          direction * delta * (options.getState()?.millimetresPerUnit ?? 1)) *
          10,
      ) / 10;
    const result = adjustSheetPageMargin({ setup: drag.setup, margin: drag.margin, valueMm });
    drag.result = result ?? undefined;
    options.onPreview(result ?? undefined);
  }
  function move(event: PointerEvent): void {
    update(event);
    if (drag) event.preventDefault();
  }
  function finish(event: PointerEvent): void {
    if (!drag || (event.pointerId ?? 0) !== drag.pointerId) return;
    update(event);
    const result = drag?.result;
    stop();
    if (result) options.onChange(result);
  }
  async function start({ margin, event }: PageMarginDragStart): Promise<void> {
    if (event.button !== 0 || options.isDisabled() || options.getState()?.mode !== "page-layout")
      return;
    if (!options.onBeforeStart()) return;
    stop();
    event.preventDefault();
    event.stopPropagation();
    // Saving a header draft can update the controlled setup and resize its toolbar.
    // Start from the resulting props and geometry after that update has settled.
    await nextTick();
    if (disposed || options.isDisabled() || options.getState()?.mode !== "page-layout") return;
    drag = {
      margin,
      startEvent: event,
      pointerId: event.pointerId ?? 0,
      setup: cloneSheetPageSetup(options.getSetup()),
    };
    activeMargin.value = margin;
    pointerPosition.value = options.getSurfacePoint(event);
    cursor.value = margin === "left" || margin === "right" ? "col-resize" : "row-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    window.addEventListener("keydown", keydown, true);
  }
  onBeforeUnmount(() => {
    disposed = true;
    stop();
  });
  return { start, stop, cursor, activeMargin, pointerPosition };
}
