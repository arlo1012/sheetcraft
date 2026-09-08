import type { SheetDimensionAxis } from "@idea10/core/workbook";
import type { FrozenPaneId } from "./frozen-layout.js";
import type { SheetViewportLayout, ViewportAxisItem } from "./viewport-layout.js";

export type ViewportAxisBoundary = {
  /** Logical insertion position, including zero and the dimension end. */
  index: number;
  /** Boundary position in viewport coordinates. */
  offset: number;
};

type AxisBoundaryCandidate = ViewportAxisBoundary & {
  priority: number;
};

function getPaneAxisClip(
  layout: SheetViewportLayout,
  paneId: FrozenPaneId,
  axis: SheetDimensionAxis,
) {
  const clip = layout.panes[paneId].clip;
  return axis === "row"
    ? { start: clip.y, end: clip.y + clip.height }
    : { start: clip.x, end: clip.x + clip.width };
}

function getItemViewportOffset(
  layout: SheetViewportLayout,
  paneId: FrozenPaneId,
  axis: SheetDimensionAxis,
  item: ViewportAxisItem,
): number {
  const pane = layout.panes[paneId];
  const frozen = axis === "row" ? layout.frozenSize.height : layout.frozenSize.width;
  const frozenViewport = axis === "row" ? pane.clip.y : pane.clip.x;
  const bodyScroll = axis === "row" ? layout.bodyScrollPosition.y : layout.bodyScrollPosition.x;
  const isFrozenPane =
    axis === "row"
      ? paneId === "topLeft" || paneId === "top"
      : paneId === "topLeft" || paneId === "left";

  // Axis item offsets remain in sheet coordinates; panes only provide their
  // viewport clip. This mirrors SheetViewportLayout#getCellViewportRect.
  return isFrozenPane ? item.offset : frozenViewport + item.offset - frozen - bodyScroll;
}

function listVisibleAxisBoundaries(
  layout: SheetViewportLayout,
  axis: SheetDimensionAxis,
  paneIds: readonly FrozenPaneId[] = ["topLeft", "top", "left", "body"],
): AxisBoundaryCandidate[] {
  const candidates = new Map<string, AxisBoundaryCandidate>();

  for (const paneId of paneIds) {
    const pane = layout.panes[paneId];
    const clip = getPaneAxisClip(layout, paneId, axis);
    if (clip.end <= clip.start) continue;
    const items = axis === "row" ? pane.rows : pane.columns;

    for (let itemOffset = 0; itemOffset < items.length; itemOffset += 1) {
      const item = items[itemOffset]!;
      const start = getItemViewportOffset(layout, paneId, axis, item);
      const end = start + item.size;
      const nextItem = items[itemOffset + 1];

      if (start >= clip.start && start <= clip.end) {
        candidates.set(`${item.index}:${start}`, { index: item.index, offset: start, priority: 0 });
      }
      if (end >= clip.start && end <= clip.end) {
        // A hidden interval has no visual edge. Preserve the immediate logical
        // insertion point for callers that derive it from a selected header.
        candidates.set(`${item.index + 1}:${end}`, {
          index: item.index + 1,
          offset: end,
          priority: 1,
        });
        // Pointer hit-testing instead prefers the next visible logical item at
        // that same edge, which is the insertion location users can see.
        const nextIndex = nextItem?.index ?? item.index + 1;
        candidates.set(`${nextIndex}:${end}`, { index: nextIndex, offset: end, priority: 0 });
      }
    }
  }

  return [...candidates.values()].sort(
    (left, right) => left.offset - right.offset || left.index - right.index,
  );
}

function getPointerPaneIds(
  layout: SheetViewportLayout,
  axis: SheetDimensionAxis,
  position: number,
): readonly FrozenPaneId[] {
  const frozenViewport = axis === "row" ? layout.panes.body.clip.y : layout.panes.body.clip.x;
  const inFrozenSegment = position < frozenViewport;
  if (axis === "row") {
    return inFrozenSegment ? ["topLeft", "top"] : ["left", "body"];
  }
  return inFrozenSegment ? ["topLeft", "left"] : ["top", "body"];
}

/**
 * Finds the closest currently visible row or column boundary in viewport
 * coordinates. The returned index is a logical insertion index, not a visible
 * item index, so it can be passed directly to structure and freeze commands.
 */
export function getViewportAxisBoundary(
  layout: SheetViewportLayout,
  axis: SheetDimensionAxis,
  position: number,
): ViewportAxisBoundary | null {
  if (!Number.isFinite(position)) return null;
  const viewportEnd = axis === "row" ? layout.viewportSize.height : layout.viewportSize.width;
  if (position < 0 || position > viewportEnd) return null;

  const boundaries = listVisibleAxisBoundaries(
    layout,
    axis,
    getPointerPaneIds(layout, axis, position),
  );
  let closest: AxisBoundaryCandidate | null = null;
  for (const boundary of boundaries) {
    if (
      closest === null ||
      Math.abs(boundary.offset - position) < Math.abs(closest.offset - position) ||
      (Math.abs(boundary.offset - position) === Math.abs(closest.offset - position) &&
        (boundary.priority < closest.priority ||
          (boundary.priority === closest.priority && boundary.index < closest.index)))
    ) {
      closest = boundary;
    }
  }
  return closest ? { index: closest.index, offset: closest.offset } : null;
}

/** Returns the viewport position for a logical boundary when it is visible. */
export function getViewportAxisBoundaryOffset(
  layout: SheetViewportLayout,
  axis: SheetDimensionAxis,
  index: number,
): number | null {
  if (!Number.isSafeInteger(index) || index < 0) return null;
  const boundaries = listVisibleAxisBoundaries(layout, axis);
  return boundaries.find((boundary) => boundary.index === index)?.offset ?? null;
}
