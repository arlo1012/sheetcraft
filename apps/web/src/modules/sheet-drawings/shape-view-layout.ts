import {
  normalizeSheetDrawing,
  type SheetGraphicDrawing,
  type SheetFramedGraphicDrawing,
  type SheetLegacyDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { anchorShapeFrameRect, type ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { locatePictureAxisPoint } from "@sheetcraft/core/picture-axis-metrics";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";

/** A disposable shape view may retain a hidden/terminal logical origin. */
export function shapeViewLayout(
  viewport: SheetViewportLayout,
  metrics: PictureSheetMetrics,
): SheetViewportLayout {
  return {
    ...viewport,
    getCellRect(address) {
      if (
        !Number.isInteger(address.column) ||
        !Number.isInteger(address.row) ||
        address.column < 0 ||
        address.column > metrics.columns.count ||
        address.row < 0 ||
        address.row > metrics.rows.count
      )
        return null;
      return {
        x: metrics.columns.visiblePrefix(address.column),
        y: metrics.rows.visiblePrefix(address.row),
        width:
          address.column === metrics.columns.count
            ? 0
            : metrics.columns.visibleSize(address.column),
        height: address.row === metrics.rows.count ? 0 : metrics.rows.visibleSize(address.row),
      };
    },
    getCellAtSheetPoint(point) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      return {
        column: locatePictureAxisPoint(point.x, metrics.columns).index,
        row: locatePictureAxisPoint(point.y, metrics.rows).index,
      };
    },
  };
}

/** No legacy normalization: zero/subpixel/negative view geometry is intentional. */
export function shapeViewAtRect<T extends SheetLegacyDrawing>(
  view: T,
  rect: ShapeFrameRect,
  metrics: PictureSheetMetrics,
): T {
  return {
    ...view,
    offsetX: rect.x - metrics.columns.visiblePrefix(view.anchor.column),
    offsetY: rect.y - metrics.rows.visiblePrefix(view.anchor.row),
    width: rect.width,
    height: rect.height,
  };
}

/** Only explicit insertion/property edits opt a legacy graphic into canonical placement. */
export function frameShapeView(
  view: SheetGraphicDrawing,
  metrics: PictureSheetMetrics,
  mode: "move-only" | "move-and-size" | "fixed" = "move-and-size",
): SheetFramedGraphicDrawing {
  if (view.kind !== "shape" && view.kind !== "textBox")
    throw new TypeError("Only source-free shapes have a shape frame.");
  const { anchor, offsetX, offsetY, width, height, ...appearance } = view;
  return normalizeSheetDrawing({
    ...appearance,
    kind: view.kind,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: anchorShapeFrameRect(
        mode,
        {
          x: metrics.columns.visiblePrefix(anchor.column) + offsetX,
          y: metrics.rows.visiblePrefix(anchor.row) + offsetY,
          width,
          height,
        },
        metrics,
      ),
    },
  });
}
