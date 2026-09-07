import type { Rect, Size } from "@idea10/sheet-engine/geometry";
import { normalizeSheetZoom } from "../../shared/sheet-view/zoom";

/** Viewport size is in screen pixels; selection, frozen panes and headers use sheet units. */
export function getSelectionFitZoom(options: {
  selectionRect: Rect;
  viewportSize: Size;
  frozenSize: Size;
  headerSize: Size;
}): number | undefined {
  const { selectionRect, viewportSize, frozenSize, headerSize } = options;
  if (selectionRect.width <= 0 || selectionRect.height <= 0) return undefined;
  const width =
    Math.min(selectionRect.x, frozenSize.width) + selectionRect.width + headerSize.width;
  const height =
    Math.min(selectionRect.y, frozenSize.height) + selectionRect.height + headerSize.height;
  // Reserve space for the selection outline rather than rounding a fitted edge out of view.
  const availableWidth = Math.max(0, viewportSize.width - 8);
  const availableHeight = Math.max(0, viewportSize.height - 8);
  return normalizeSheetZoom(
    Math.floor(Math.min(availableWidth / width, availableHeight / height) * 100),
  );
}
