import type { CellAddress } from "@idea10/core/workbook";
import type { FrozenPaneId } from "./frozen-layout.js";
import type { Rect } from "./geometry.js";
import type { SheetViewportLayout } from "./viewport-layout.js";

/** The positioning fields shared by persisted floating images and view previews. */
export type FloatingImagePlacement = {
  anchor: CellAddress;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

/** A floating-image part projected into one frozen viewport pane. */
export type FloatingImageViewportFragment = {
  paneId: FrozenPaneId;
  /** The complete image rect in viewport coordinates for this pane. */
  rect: Rect;
  /** The part of rect visible through this pane's clip. */
  clippedRect: Rect;
};

function intersectRect(left: Rect, right: Rect): Rect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return rightEdge > x && bottomEdge > y
    ? { x, y, width: rightEdge - x, height: bottomEdge - y }
    : null;
}

/**
 * Resolves an image's persisted cell anchor into continuous sheet coordinates.
 * A hidden anchor row has no coordinate in the viewport layout and is omitted.
 */
export function getFloatingImageSheetRect(
  image: FloatingImagePlacement,
  layout: SheetViewportLayout,
): Rect | null {
  const anchor = layout.getCellRect(image.anchor);
  if (!anchor) return null;
  return {
    x: anchor.x + image.offsetX,
    y: anchor.y + image.offsetY,
    width: image.width,
    height: image.height,
  };
}

/**
 * Projects and clips a free-form sheet rect through each frozen pane. Unlike a
 * cell range, an image may cross a frozen boundary, so every pane is evaluated.
 */
export function getFloatingImageViewportFragments(
  image: FloatingImagePlacement,
  layout: SheetViewportLayout,
): FloatingImageViewportFragment[] {
  const sheetRect = getFloatingImageSheetRect(image, layout);
  if (!sheetRect || sheetRect.width <= 0 || sheetRect.height <= 0) return [];

  const fragments: FloatingImageViewportFragment[] = [];
  for (const paneId of ["topLeft", "top", "left", "body"] as const) {
    const pane = layout.panes[paneId];
    if (pane.clip.width <= 0 || pane.clip.height <= 0) continue;
    const rect: Rect = {
      x:
        paneId === "topLeft" || paneId === "left"
          ? sheetRect.x
          : pane.clip.x + sheetRect.x - layout.frozenSize.width - layout.bodyScrollPosition.x,
      y:
        paneId === "topLeft" || paneId === "top"
          ? sheetRect.y
          : pane.clip.y + sheetRect.y - layout.frozenSize.height - layout.bodyScrollPosition.y,
      width: sheetRect.width,
      height: sheetRect.height,
    };
    const clippedRect = intersectRect(rect, pane.clip);
    if (clippedRect) fragments.push({ paneId, rect, clippedRect });
  }
  return fragments;
}

/**
 * Reanchors a sheet rect to its containing cell. Persisted offsets are always
 * non-negative, so moving above or left of the sheet is clamped at its origin.
 */
export function reanchorFloatingImageAtSheetRect<T extends FloatingImagePlacement>(
  image: T,
  sheetRect: Rect,
  layout: SheetViewportLayout,
): T | null {
  const x = Math.max(0, sheetRect.x);
  const y = Math.max(0, sheetRect.y);
  const anchor = layout.getCellAtSheetPoint({ x, y });
  if (!anchor) return null;
  const anchorRect = layout.getCellRect(anchor);
  if (!anchorRect) return null;
  return {
    ...image,
    anchor,
    offsetX: x - anchorRect.x,
    offsetY: y - anchorRect.y,
    width: sheetRect.width,
    height: sheetRect.height,
  };
}

/** Moves an image in continuous sheet coordinates and normalizes its anchor. */
export function moveFloatingImageBy<T extends FloatingImagePlacement>(
  image: T,
  delta: { x: number; y: number },
  layout: SheetViewportLayout,
): T | null {
  const sheetRect = getFloatingImageSheetRect(image, layout);
  if (!sheetRect) return null;
  return reanchorFloatingImageAtSheetRect(
    image,
    { ...sheetRect, x: sheetRect.x + delta.x, y: sheetRect.y + delta.y },
    layout,
  );
}
