import {
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  type SheetDimensionAxis,
} from "@idea10/core/workbook";
import type { Point, SheetGeometry } from "@idea10/sheet-engine/geometry";
import type { SheetRenderFrame } from "../rendering/sheet-render-frame";
import { containsPoint } from "../rendering/sheet-render-frame";
import type {
  HeaderFocus,
  HeaderHit,
  HeaderQuickToolsState,
  HeaderSelectionState,
} from "../rendering/header-painter";

const RESIZE_HIT_SIZE = 6;
const CONTROL_HIT_RADIUS = 10;
const KEYBOARD_RESIZE_STEP = 8;

export type HeaderInteractionCallbacks = Readonly<{
  selectAxis: (axis: SheetDimensionAxis, index: number, shiftKey: boolean) => void;
  selectAll: () => void;
  resizeStart: (axis: SheetDimensionAxis, index: number, event: PointerEvent) => void;
  resize: (axis: SheetDimensionAxis, index: number, size: number) => void;
  quickInsert: (axis: SheetDimensionAxis, index: number) => void;
  quickInsertHover: (axis: SheetDimensionAxis, index: number | null) => void;
  axisDragStart: (axis: SheetDimensionAxis, index: number, event: PointerEvent) => void;
  openContextMenu: (
    axis: SheetDimensionAxis,
    index: number,
    clientX: number,
    clientY: number,
    trigger: HTMLElement,
  ) => void;
}>;

export type HeaderInteractionOptions = Readonly<{
  getFrame: () => SheetRenderFrame | undefined;
  getSelection: () => HeaderSelectionState;
  getQuickTools: () => HeaderQuickToolsState;
  getGeometry: () => SheetGeometry;
  callbacks: HeaderInteractionCallbacks;
  /** Formula reference picking must keep the editor focused while it consumes an axis hit. */
  canFocus?: () => boolean;
  /** Repaint headers only. This must not invalidate the body scene. */
  onInvalidate: () => void;
}>;

export type HeaderInteractionState = Readonly<{
  hovered?: HeaderHit;
  focused?: HeaderFocus;
}>;

function isAxisSelected(
  axis: SheetDimensionAxis,
  index: number,
  selection: HeaderSelectionState,
): boolean {
  // An all-sheet selection highlights both headers, but it is not an axis drag
  // selection. A pointer on either header must first convert it to that axis.
  if (selection.mode !== (axis === "row" ? "rows" : "columns")) {
    return false;
  }
  const start = axis === "row" ? selection.startRow : selection.startColumn;
  const end = axis === "row" ? selection.endRow : selection.endColumn;
  return index >= start && index <= end;
}

function shouldShowBoundary(
  axis: SheetDimensionAxis,
  index: number,
  before: boolean,
  selection: HeaderSelectionState,
): boolean {
  if (!isAxisSelected(axis, index, selection)) return true;
  const start = axis === "row" ? selection.startRow : selection.startColumn;
  const end = axis === "row" ? selection.endRow : selection.endColumn;
  return before ? index === start : index === end;
}

function isInControlRadius(point: Point, x: number, y: number): boolean {
  return Math.abs(point.x - x) <= CONTROL_HIT_RADIUS && Math.abs(point.y - y) <= CONTROL_HIT_RADIUS;
}

function equalHit(left: HeaderHit | undefined, right: HeaderHit | undefined): boolean {
  return (
    left?.axis === right?.axis &&
    left?.index === right?.index &&
    left?.ownerIndex === right?.ownerIndex &&
    left?.action === right?.action
  );
}

/**
 * Header hit testing and keyboard behavior. It deliberately only searches rendered
 * header items, so merged-cell anchors and hidden row gaps cannot corrupt an axis hit.
 */
export function useHeaderInteraction(options: HeaderInteractionOptions) {
  let state: HeaderInteractionState = {};

  function update(next: HeaderInteractionState): void {
    if (equalHit(state.hovered, next.hovered) && equalHit(state.focused, next.focused)) return;
    state = next;
    options.onInvalidate();
  }

  function hitTest(point: Point): HeaderHit | undefined {
    const frame = options.getFrame();
    if (!frame) return undefined;
    const quickTools = options.getQuickTools();
    const gutter = quickTools.gutter;
    if (
      point.x >= gutter &&
      point.y >= gutter &&
      point.x < frame.headerSize.width &&
      point.y < frame.headerSize.height
    ) {
      return { axis: "corner", action: "corner" };
    }

    const candidates: Array<{ axis: SheetDimensionAxis; panes: typeof frame.rowHeaders }> = [
      { axis: "row", panes: frame.rowHeaders },
      { axis: "column", panes: frame.columnHeaders },
    ];
    for (const { axis, panes } of candidates) {
      for (const pane of panes) {
        if (!containsPoint(pane.clip, point)) continue;
        for (const item of pane.items) {
          const itemStart = item.offset;
          const itemEnd = item.offset + item.size;
          const onAxis =
            axis === "row"
              ? point.y >= itemStart && point.y < itemEnd
              : point.x >= itemStart && point.x < itemEnd;
          if (!onAxis) continue;
          const focusedOrHovered =
            (state.focused?.axis === axis && state.focused.index === item.index) ||
            (state.hovered?.axis === axis &&
              (state.hovered.ownerIndex ?? state.hovered.index) === item.index);
          if (quickTools.enabled && focusedOrHovered) {
            const beforeX = axis === "row" ? gutter / 2 : item.offset;
            const beforeY = axis === "row" ? item.offset : gutter / 2;
            const afterX = axis === "row" ? gutter / 2 : itemEnd;
            const afterY = axis === "row" ? itemEnd : gutter / 2;
            if (
              shouldShowBoundary(axis, item.index, true, options.getSelection()) &&
              isInControlRadius(point, beforeX, beforeY)
            ) {
              return { axis, index: item.index, ownerIndex: item.index, action: "quickInsert" };
            }
            if (
              shouldShowBoundary(axis, item.index, false, options.getSelection()) &&
              isInControlRadius(point, afterX, afterY)
            ) {
              return { axis, index: item.index + 1, ownerIndex: item.index, action: "quickInsert" };
            }
          }
          const inMainArea = axis === "row" ? point.x >= gutter : point.y >= gutter;
          if (!inMainArea) {
            if (!quickTools.enabled) continue;
            const gripX = axis === "row" ? gutter / 2 : item.offset + item.size / 2;
            const gripY = axis === "row" ? item.offset + item.size / 2 : gutter / 2;
            if (isInControlRadius(point, gripX, gripY)) {
              return { axis, index: item.index, ownerIndex: item.index, action: "grip" };
            }
            continue;
          }
          // The resize target is tied to the actual rendered item's trailing edge.
          // It never infers a row from an insertion boundary, which matters with hidden rows.
          const nearTrailingEdge =
            axis === "row"
              ? point.y >= itemEnd - RESIZE_HIT_SIZE
              : point.x >= itemEnd - RESIZE_HIT_SIZE;
          if (nearTrailingEdge) return { axis, index: item.index, action: "resize" };
          return { axis, index: item.index, action: "axis" };
        }
      }
    }
    return undefined;
  }

  function setHover(point: Point | undefined): HeaderHit | undefined {
    const hovered = point ? hitTest(point) : undefined;
    const previousQuick = state.hovered?.action === "quickInsert" ? state.hovered : undefined;
    const nextQuick = hovered?.action === "quickInsert" ? hovered : undefined;
    if (previousQuick?.axis !== nextQuick?.axis || previousQuick?.index !== nextQuick?.index) {
      if (previousQuick)
        options.callbacks.quickInsertHover(previousQuick.axis as SheetDimensionAxis, null);
      if (nextQuick)
        options.callbacks.quickInsertHover(nextQuick.axis as SheetDimensionAxis, nextQuick.index!);
    }
    update({ ...state, hovered });
    return hovered;
  }

  function focus(hit: HeaderFocus | undefined): void {
    update({ ...state, focused: hit });
  }

  function getInitialFocus(): HeaderFocus | undefined {
    const selection = options.getSelection();
    if (selection.mode === "all") return { axis: "corner", action: "corner" };
    if (selection.mode === "columns") {
      return getVisibleFocus("column", selection.activeColumn ?? selection.startColumn);
    }
    // A cell selection enters the header surface through its active row. This gives
    // the single Canvas focus target a deterministic keyboard contract.
    return getVisibleFocus("row", selection.activeRow ?? selection.startRow);
  }

  function getVisibleFocus(
    axis: SheetDimensionAxis,
    preferredIndex: number,
  ): HeaderFocus | undefined {
    const frame = options.getFrame();
    if (!frame) return undefined;
    const items = (axis === "row" ? frame.rowHeaders : frame.columnHeaders).flatMap(
      (pane) => pane.items,
    );
    const index = items.some((item) => item.index === preferredIndex)
      ? preferredIndex
      : items[0]?.index;
    return index === undefined ? undefined : { axis, index, action: "axis" };
  }

  function isFocusAvailable(focused: HeaderFocus): boolean {
    if (focused.axis === "corner") return true;
    const frame = options.getFrame();
    if (!frame) return false;
    return (focused.axis === "row" ? frame.rowHeaders : frame.columnHeaders).some((pane) =>
      pane.items.some((item) => item.index === focused.index),
    );
  }

  function getAdjacentFocus(focused: HeaderFocus, direction: -1 | 1): HeaderFocus | undefined {
    if (focused.axis === "corner") return undefined;
    const frame = options.getFrame();
    if (!frame) return undefined;
    const items = (focused.axis === "row" ? frame.rowHeaders : frame.columnHeaders)
      .flatMap((pane) => pane.items)
      .sort((left, right) => left.index - right.index);
    const indexes = [...new Set(items.map((item) => item.index))];
    const at = indexes.indexOf(focused.index!);
    if (at < 0) return undefined;
    const index = indexes[at + direction];
    return index === undefined ? undefined : { axis: focused.axis, index, action: "axis" };
  }

  function getFocusClientPoint(
    focused: HeaderFocus,
    trigger: HTMLElement,
  ): { x: number; y: number } {
    const frame = options.getFrame();
    const bounds = trigger.getBoundingClientRect();
    if (!frame) return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    if (focused.axis === "corner") {
      return {
        x: bounds.left + (frame.headerSize.width / 2) * frame.scale,
        y: bounds.top + (frame.headerSize.height / 2) * frame.scale,
      };
    }
    const panes = focused.axis === "row" ? frame.rowHeaders : frame.columnHeaders;
    const item = panes
      .flatMap((pane) => pane.items)
      .find((candidate) => candidate.index === focused.index);
    if (!item) return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const gutter = options.getQuickTools().gutter;
    const point =
      focused.axis === "row"
        ? { x: gutter + (frame.headerSize.width - gutter) / 2, y: item.offset + item.size / 2 }
        : { x: item.offset + item.size / 2, y: gutter + (frame.headerSize.height - gutter) / 2 };
    return { x: bounds.left + point.x * frame.scale, y: bounds.top + point.y * frame.scale };
  }

  function onPointerMove(point: Point): HeaderHit | undefined {
    return setHover(point);
  }

  function onPointerLeave(): void {
    setHover(undefined);
  }

  function onPointerDown(
    point: Point,
    event: PointerEvent,
    trigger: HTMLElement,
  ): HeaderHit | undefined {
    if (event.button !== 0) return undefined;
    const hit = hitTest(point);
    if (!hit) return undefined;
    event.preventDefault();
    if (options.canFocus?.() ?? true) {
      trigger.focus({ preventScroll: true });
      focus(hit);
    }
    if (hit.axis === "corner") {
      options.callbacks.selectAll();
      return hit;
    }
    const axis = hit.axis;
    const index = hit.index!;
    if (hit.action === "resize") {
      options.callbacks.resizeStart(axis, index, event);
      return hit;
    }
    if (hit.action === "quickInsert") {
      options.callbacks.quickInsert(axis, index);
      return hit;
    }
    if (hit.action === "grip") {
      if (!isAxisSelected(axis, index, options.getSelection())) {
        options.callbacks.selectAxis(axis, index, false);
      }
      options.callbacks.axisDragStart(axis, index, event);
      return hit;
    }
    if (
      options.getQuickTools().enabled &&
      isAxisSelected(axis, index, options.getSelection()) &&
      !event.shiftKey
    ) {
      options.callbacks.axisDragStart(axis, index, event);
      return hit;
    }
    options.callbacks.selectAxis(axis, index, event.shiftKey);
    return hit;
  }

  function onContextMenu(
    point: Point,
    event: MouseEvent,
    trigger: HTMLElement,
  ): HeaderHit | undefined {
    const hit = hitTest(point);
    if (!hit || hit.axis === "corner" || hit.index === undefined) return undefined;
    event.preventDefault();
    focus({ axis: hit.axis, index: hit.index, action: "axis" });
    options.callbacks.openContextMenu(hit.axis, hit.index, event.clientX, event.clientY, trigger);
    return hit;
  }

  function onKeyDown(event: KeyboardEvent, trigger: HTMLElement): boolean {
    let focused = state.focused;
    if (!focused || !isFocusAvailable(focused)) {
      focused = getInitialFocus();
      if (!focused) return false;
      focus(focused);
    }
    if (focused.axis === "corner") {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        options.callbacks.selectAll();
        return true;
      }
      return false;
    }
    const axis = focused.axis;
    const index = focused.index!;
    if (focused.action === "axis") {
      const backwards = axis === "row" ? "ArrowUp" : "ArrowLeft";
      const forwards = axis === "row" ? "ArrowDown" : "ArrowRight";
      if (event.key === backwards || event.key === forwards) {
        const next = getAdjacentFocus(focused, event.key === backwards ? -1 : 1);
        event.preventDefault();
        if (next) focus(next);
        return true;
      }
    }
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const point = getFocusClientPoint(focused, trigger);
      options.callbacks.openContextMenu(axis, index, point.x, point.y, trigger);
      return true;
    }
    if (focused.action === "resize") {
      const current =
        axis === "row"
          ? options.getGeometry().getRowHeight(index)
          : options.getGeometry().getColumnWidth(index);
      let size: number | undefined;
      if (event.key === (axis === "row" ? "ArrowUp" : "ArrowLeft"))
        size = current - KEYBOARD_RESIZE_STEP;
      if (event.key === (axis === "row" ? "ArrowDown" : "ArrowRight"))
        size = current + KEYBOARD_RESIZE_STEP;
      if (event.key === "Home") size = axis === "row" ? MIN_ROW_HEIGHT : MIN_COLUMN_WIDTH;
      if (event.key === "End") size = axis === "row" ? MAX_ROW_HEIGHT : MAX_COLUMN_WIDTH;
      if (size !== undefined) {
        event.preventDefault();
        const minimum = axis === "row" ? MIN_ROW_HEIGHT : MIN_COLUMN_WIDTH;
        const maximum = axis === "row" ? MAX_ROW_HEIGHT : MAX_COLUMN_WIDTH;
        options.callbacks.resize(axis, index, Math.min(maximum, Math.max(minimum, size)));
        return true;
      }
    }
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      if (focused.action === "quickInsert") options.callbacks.quickInsert(axis, index);
      else options.callbacks.selectAxis(axis, index, event.shiftKey);
      return true;
    }
    return false;
  }

  return {
    get state(): HeaderInteractionState {
      return state;
    },
    hitTest,
    focus,
    onPointerMove,
    onPointerLeave,
    onPointerDown,
    onContextMenu,
    onKeyDown,
  };
}
