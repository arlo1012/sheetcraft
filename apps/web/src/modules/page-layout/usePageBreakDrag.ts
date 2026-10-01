import { onBeforeUnmount, ref } from "vue";
import { cloneSheetPageSetup, type SheetPageSetup } from "@idea10/core/page-setup";
import type { CellRange } from "@idea10/core/workbook";
import type { Point, SheetGeometry } from "@idea10/sheet-engine/geometry";
import {
  adjustSheetPageBoundary,
  adjustSheetPrintCorner,
  type SheetPrintCorner,
  type SheetPageBoundary,
  type SheetPagination,
} from "@idea10/sheet-engine/page-layout";
import type { RowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import type { SheetRenderFrame } from "../sheet-grid/rendering/sheet-render-frame";
import type { PageViewPaintState } from "./page-view-types";

type PageBoundaryHit = SheetPageBoundary | { kind: "corner"; corner: SheetPrintCorner };

type PageBoundaryDrag = {
  boundary: PageBoundaryHit;
  pointerId: number;
  start: Point;
  moved: boolean;
  setup: SheetPageSetup;
  pagination: SheetPagination;
  printRect: PageViewPaintState["printRect"];
  targetIndex?: number | null;
  cornerTarget?: { row: number; column: number };
  result?: SheetPageSetup;
  invalid?: boolean;
};

export function usePageBreakDrag(options: {
  getState: () => PageViewPaintState | undefined;
  getFrame: () => SheetRenderFrame;
  getSetup: () => SheetPageSetup;
  getPagination: () => SheetPagination | undefined;
  getGeometry: () => SheetGeometry;
  getRows: () => RowVisibilityIndex;
  getMergedCells: () => readonly CellRange[];
  getSurfacePoint: (event: MouseEvent) => Point;
  isDisabled: () => boolean;
  onBeforeStart: () => void;
  onPreview: (
    setup?: SheetPageSetup,
    boundary?: PageViewPaintState["dragBoundary"],
    corner?: PageViewPaintState["dragCorner"],
  ) => void;
  onChange: (setup: SheetPageSetup) => void;
}) {
  const cursor = ref<string>();
  let drag: PageBoundaryDrag | undefined;

  function point(event: MouseEvent): Point {
    const p = options.getSurfacePoint(event);
    const frame = options.getFrame();
    return {
      x: p.x - frame.body.x + frame.layout.bodyScrollPosition.x,
      y: p.y - frame.body.y + frame.layout.bodyScrollPosition.y,
    };
  }

  function hit(event: MouseEvent): PageBoundaryHit | undefined {
    const state = options.getState();
    const pagination = options.getPagination();
    if (state?.mode !== "page-break-preview" || !pagination || options.isDisabled()) return;
    const frame = options.getFrame();
    const surface = options.getSurfacePoint(event);
    // Header resizing keeps ownership of points above or to the left of the grid body.
    if (surface.x < frame.body.x || surface.y < frame.body.y) return;
    const p = point(event);
    const area = state.printRect;
    const tolerance = 5 / frame.scale;
    for (const [corner, x, y] of [
      ["top-left", area.x, area.y],
      ["top-right", area.x + area.width, area.y],
      ["bottom-left", area.x, area.y + area.height],
      ["bottom-right", area.x + area.width, area.y + area.height],
    ] as const) {
      if (Math.abs(p.x - x) <= tolerance && Math.abs(p.y - y) <= tolerance)
        return { kind: "corner", corner };
    }
    const candidates: { boundary: SheetPageBoundary; distance: number }[] = [];
    const add = (
      axis: "row" | "column",
      index: number,
      kind: SheetPageBoundary["kind"],
      offset: number,
    ) => {
      const distance = Math.abs((axis === "row" ? p.y : p.x) - offset);
      if (distance <= tolerance) candidates.push({ boundary: { axis, index, kind }, distance });
    };
    if (p.y >= area.y - tolerance && p.y <= area.y + area.height + tolerance) {
      add("column", pagination.printRange.start.column, "print-start", area.x);
      add("column", pagination.printRange.end.column + 1, "print-end", area.x + area.width);
      for (const line of state.columnBreaks) add("column", line.index, line.kind, line.offset);
    }
    if (p.x >= area.x - tolerance && p.x <= area.x + area.width + tolerance) {
      add("row", pagination.printRange.start.row, "print-start", area.y);
      add("row", pagination.printRange.end.row + 1, "print-end", area.y + area.height);
      for (const line of state.rowBreaks) add("row", line.index, line.kind, line.offset);
    }
    return candidates.sort((left, right) => left.distance - right.distance)[0]?.boundary;
  }

  function hover(event: MouseEvent): void {
    const current = drag?.boundary ?? hit(event);
    cursor.value = drag?.invalid
      ? "not-allowed"
      : current?.kind === "corner"
        ? current.corner === "top-left" || current.corner === "bottom-right"
          ? "nwse-resize"
          : "nesw-resize"
        : current?.axis === "row"
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
    options.onPreview();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", stop);
    window.removeEventListener("blur", stop);
    window.removeEventListener("keydown", onKeydown, true);
  }
  function onKeydown(event: KeyboardEvent): void {
    if (drag && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop();
    }
  }

  function boundaryAtOffset(axis: "row" | "column", offset: number): number {
    if (offset <= 0) return 0;
    if (axis === "row") {
      const rows = options.getRows();
      if (offset >= rows.getTotalHeight()) return rows.rowCount;
      const row = rows.getLogicalRowAtOffset(offset);
      const visible = row === null ? null : rows.getVisibleRow(row);
      return visible
        ? visible.logicalRow + (offset >= visible.offset + visible.height / 2 ? 1 : 0)
        : 0;
    }
    const geometry = options.getGeometry();
    if (offset >= geometry.getTotalSize().width) return geometry.columnCount;
    const column = geometry.getVisibleRange(
      { x: offset, y: 0 },
      { width: 1, height: 1 },
      0,
    ).startColumn;
    return (
      column +
      (offset >= geometry.getColumnOffset(column) + geometry.getColumnWidth(column) / 2 ? 1 : 0)
    );
  }
  function boundaryOffset(axis: "row" | "column", index: number): number {
    if (axis === "row") return options.getRows().getBoundaryOffset(index) ?? 0;
    const geometry = options.getGeometry();
    return index === geometry.columnCount
      ? geometry.getTotalSize().width
      : geometry.getColumnOffset(index);
  }

  function updateCorner(active: PageBoundaryDrag, p: Point): void {
    if (active.boundary.kind !== "corner") return;
    const target = { row: boundaryAtOffset("row", p.y), column: boundaryAtOffset("column", p.x) };
    if (target.row === active.cornerTarget?.row && target.column === active.cornerTarget?.column)
      return;
    active.cornerTarget = target;
    const result = adjustSheetPrintCorner({
      geometry: options.getGeometry(),
      rows: options.getRows(),
      setup: active.setup,
      pagination: active.pagination,
      corner: active.boundary.corner,
      targetRow: target.row,
      targetColumn: target.column,
    });
    active.result = result ?? undefined;
    const range = result?.printArea ?? active.pagination.printRange;
    const row = active.boundary.corner.startsWith("top") ? range.start.row : range.end.row + 1;
    const column = active.boundary.corner.endsWith("left")
      ? range.start.column
      : range.end.column + 1;
    options.onPreview(result ?? undefined, undefined, {
      x: boundaryOffset("column", column),
      y: boundaryOffset("row", row),
    });
  }

  function update(event: PointerEvent): void {
    if (!drag || (event.pointerId ?? 0) !== drag.pointerId || options.isDisabled()) return;
    const active = drag;
    if (Math.hypot(event.clientX - active.start.x, event.clientY - active.start.y) >= 2)
      active.moved = true;
    if (!active.moved) return;
    const p = point(event);
    if (active.boundary.kind === "corner") {
      updateCorner(active, p);
      return;
    }
    const { axis, kind } = active.boundary;
    const area = active.printRect;
    const internal = kind === "automatic" || kind === "manual";
    const outside =
      axis === "column"
        ? p.x < area.x || p.y < area.y || p.y > area.y + area.height
        : p.y < area.y || p.x < area.x || p.x > area.x + area.width;
    let target = internal && outside ? null : boundaryAtOffset(axis, axis === "row" ? p.y : p.x);
    if (target !== null) {
      const range = active.pagination.printRange;
      const first = axis === "row" ? range.start.row : range.start.column;
      const last = axis === "row" ? range.end.row : range.end.column;
      const count = axis === "row" ? options.getRows().rowCount : options.getGeometry().columnCount;
      target = Math.max(
        kind === "print-start" ? 0 : first + 1,
        Math.min(kind === "print-end" ? count : kind === "print-start" ? last : last + 1, target),
      );
    }
    if (target === active.targetIndex) return;
    active.targetIndex = target;
    const result =
      target === active.boundary.index
        ? null
        : adjustSheetPageBoundary({
            geometry: options.getGeometry(),
            rows: options.getRows(),
            setup: active.setup,
            pagination: active.pagination,
            boundary: active.boundary,
            targetIndex: target,
            mergedCells: options.getMergedCells(),
          });
    active.result = result ?? undefined;
    active.invalid = target !== active.boundary.index && result === null;
    if (active.invalid) {
      options.onPreview();
      cursor.value = "not-allowed";
      return;
    }
    cursor.value = axis === "row" ? "row-resize" : "col-resize";
    const areaRange = result?.printArea;
    const field = axis === "row" ? "rowBreaks" : "columnBreaks";
    const last =
      axis === "row"
        ? active.pagination.printRange.end.row
        : active.pagination.printRange.end.column;
    const internalIndex =
      result && internal && target !== null
        ? (result[field].find((index) => index >= target && index <= last) ?? last + 1)
        : target;
    const previewIndex =
      areaRange && kind === "print-start"
        ? axis === "row"
          ? areaRange.start.row
          : areaRange.start.column
        : areaRange && kind === "print-end"
          ? (axis === "row" ? areaRange.end.row : areaRange.end.column) + 1
          : internalIndex;
    options.onPreview(result ?? undefined, {
      axis,
      offset:
        previewIndex === null ? (axis === "row" ? p.y : p.x) : boundaryOffset(axis, previewIndex),
      removing: target === null,
    });
  }
  function move(event: PointerEvent): void {
    update(event);
    if (drag) event.preventDefault();
  }
  function finish(event: PointerEvent): void {
    if (!drag || (event.pointerId ?? 0) !== drag.pointerId) return;
    update(event);
    const result = drag.result;
    const changed =
      drag.moved && options.getState()?.mode === "page-break-preview" && !options.isDisabled();
    stop();
    if (changed && result) options.onChange(result);
  }
  function start(event: PointerEvent): boolean {
    if (event.button !== 0) return false;
    const boundary = hit(event);
    const pagination = options.getPagination();
    const state = options.getState();
    if (!boundary || !pagination || !state) return false;
    options.onBeforeStart();
    event.preventDefault();
    drag = {
      boundary,
      pointerId: event.pointerId ?? 0,
      start: { x: event.clientX, y: event.clientY },
      moved: false,
      setup: cloneSheetPageSetup(options.getSetup()),
      pagination,
      printRect: state.printRect,
    };
    hover(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    window.addEventListener("keydown", onKeydown, true);
    return true;
  }
  onBeforeUnmount(stop);
  return { cursor, start, hover, clearHover, stop };
}
