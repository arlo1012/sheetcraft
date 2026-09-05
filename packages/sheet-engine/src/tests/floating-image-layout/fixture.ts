import { createSheetGeometry } from "../../geometry.js";
import { createRowVisibilityIndex } from "../../visibility.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";

export function createLayout(options?: {
  hiddenIntervals?: Array<{ start: number; end: number }>;
  freeze?: { rows: number; columns: number };
  bodyScrollPosition?: { x: number; y: number };
}) {
  return createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount: 8, columnCount: 8, rowHeight: 20, columnWidth: 80 }),
    rows: createRowVisibilityIndex({
      rowCount: 8,
      defaultRowHeight: 20,
      hiddenIntervals: options?.hiddenIntervals,
    }),
    freeze: options?.freeze,
    bodyScrollPosition: options?.bodyScrollPosition,
    viewportSize: { width: 240, height: 80 },
  });
}
