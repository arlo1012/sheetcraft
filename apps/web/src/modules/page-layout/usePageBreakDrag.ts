import { onBeforeUnmount, ref } from "vue";
import { cloneSheetPageSetup, type SheetPageSetup } from "@idea10/core/page-setup";
import type { Point, SheetGeometry } from "@idea10/sheet-engine/geometry";
import type { RowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import type { SheetRenderFrame } from "../sheet-grid/rendering/sheet-render-frame";
import type { PageViewPaintState } from "./page-view-types";

type BreakHit = { axis: "row" | "column"; index: number; kind: "automatic" | "manual" };

export function usePageBreakDrag(options: {
  getState: () => PageViewPaintState | undefined;
  getFrame: () => SheetRenderFrame;
  getSetup: () => SheetPageSetup;
  getGeometry: () => SheetGeometry;
  getRows: () => RowVisibilityIndex;
  getSurfacePoint: (event: MouseEvent) => Point;
  isDisabled: () => boolean;
  onBeforeStart: () => void;
  onChange: (setup: SheetPageSetup) => void;
}) {
  const cursor = ref<string>();
  let drag: (BreakHit & { pointerId: number; start: Point; moved: boolean }) | undefined;

  function point(event: MouseEvent): Point {
    const point = options.getSurfacePoint(event);
    const frame = options.getFrame();
    return {
      x: point.x - frame.body.x + frame.layout.bodyScrollPosition.x,
      y: point.y - frame.body.y + frame.layout.bodyScrollPosition.y,
    };
  }
  function hit(event: MouseEvent): BreakHit | undefined {
    const state = options.getState();
    if (state?.mode !== "page-break-preview" || options.isDisabled()) return;
    const p = point(event);
    const { printRect } = state;
    const tolerance = 5 / options.getFrame().scale;
    if (
      p.x < printRect.x ||
      p.x > printRect.x + printRect.width ||
      p.y < printRect.y ||
      p.y > printRect.y + printRect.height
    )
      return;
    const row = state.rowBreaks.find((line) => Math.abs(p.y - line.offset) <= tolerance);
    const column = state.columnBreaks.find((line) => Math.abs(p.x - line.offset) <= tolerance);
    if (row && (!column || Math.abs(p.y - row.offset) <= Math.abs(p.x - column.offset)))
      return { axis: "row", index: row.index, kind: row.kind };
    if (column) return { axis: "column", index: column.index, kind: column.kind };
  }
  function hover(event: MouseEvent): void {
    const current = drag ?? hit(event);
    cursor.value =
      current?.axis === "row"
        ? "row-resize"
        : current?.axis === "column"
          ? "col-resize"
          : undefined;
  }
  function clearHover(): void {
    if (!drag) cursor.value = undefined;
  }
  function stop(): void {
    drag = undefined;
    cursor.value = undefined;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", stop);
  }
  function move(event: PointerEvent): void {
    if (!drag || (event.pointerId ?? 0) !== drag.pointerId) return;
    const current = point(event);
    if (Math.hypot(current.x - drag.start.x, current.y - drag.start.y) > 2) drag.moved = true;
    event.preventDefault();
  }
  function finish(event: PointerEvent): void {
    if (!drag || (event.pointerId ?? 0) !== drag.pointerId) return;
    const active = drag;
    const p = point(event);
    const state = options.getState();
    stop();
    if (!active.moved || state?.mode !== "page-break-preview" || options.isDisabled()) return;
    const range = state.printRect;
    const outside =
      p.x < range.x || p.y < range.y || p.x > range.x + range.width || p.y > range.y + range.height;
    let target: number | undefined;
    if (!outside) {
      if (active.axis === "row") {
        const rows = options.getRows();
        const row = rows.getLogicalRowAtOffset(p.y);
        const visible = row === null ? null : rows.getVisibleRow(row);
        if (visible)
          target = visible.logicalRow + (p.y >= visible.offset + visible.height / 2 ? 1 : 0);
      } else {
        const geometry = options.getGeometry();
        const column = geometry.getVisibleRange(
          { x: p.x, y: 0 },
          { width: 1, height: 1 },
          0,
        ).startColumn;
        const left = geometry.getColumnOffset(column);
        target = column + (p.x >= left + geometry.getColumnWidth(column) / 2 ? 1 : 0);
      }
    }
    if (target === active.index || (outside && active.kind !== "manual")) return;
    const setup = cloneSheetPageSetup(options.getSetup());
    const field = active.axis === "row" ? "rowBreaks" : "columnBreaks";
    const breaks = setup[field].filter((index) => index !== active.index);
    if (target !== undefined && target > 0) breaks.push(target);
    setup[field] = [...new Set(breaks)].sort((left, right) => left - right);
    options.onChange(setup);
  }
  function start(event: PointerEvent): boolean {
    if (event.button !== 0) return false;
    const current = hit(event);
    if (!current) return false;
    options.onBeforeStart();
    event.preventDefault();
    drag = { ...current, pointerId: event.pointerId ?? 0, start: point(event), moved: false };
    hover(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", stop);
    return true;
  }
  onBeforeUnmount(stop);
  return { cursor, start, hover, clearHover, stop };
}
