import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import type { ResolvedShapeFrame } from "@sheetcraft/core/shape-frame";
import {
  isShapeGroupEligibleRoot,
  resolveShapeRootLayout,
  type ShapeGroupEligibleRoot,
} from "@sheetcraft/core/shape-group-planning";
import type {
  SheetDrawing,
  SheetGraphicDrawing,
  SheetChartDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  isFramedEquationDrawing,
  type SheetFramedEquationDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { resolveShapeFrame } from "@sheetcraft/core/shape-frame";

export type DrawingClipboardEligibleRoot =
  | ShapeGroupEligibleRoot
  | SheetChartDrawing
  | SheetFramedEquationDrawing
  | (SheetGraphicDrawing & { kind: "equation" });

/** Clipboard admission preserves Chart and Equation source across independent and owned objects. */
export function isDrawingClipboardEligibleRoot(
  value: SheetDrawing,
): value is DrawingClipboardEligibleRoot {
  return isShapeGroupEligibleRoot(value) || value.kind === "equation" || value.kind === "chart";
}

/** Legacy equation/chart placement is resolved without promoting it into a shape frame or member. */
export function resolveDrawingClipboardRootLayout(
  value: DrawingClipboardEligibleRoot,
  metrics: PictureSheetMetrics,
): ResolvedShapeFrame {
  if (value.kind !== "equation" && value.kind !== "chart")
    return resolveShapeRootLayout(value, metrics);
  if (value.kind === "equation" && isFramedEquationDrawing(value))
    return resolveShapeFrame(value.shapeFrame, metrics, value.rotation);
  return resolvePictureLayout(
    {
      x: metrics.columns.visiblePrefix(value.anchor.column) + value.offsetX,
      y: metrics.rows.visiblePrefix(value.anchor.row) + value.offsetY,
      width: value.width,
      height: value.height,
    },
    value.rotation,
  );
}

/** Check all admitted roots, including unselected equation siblings in a collection proposal. */
export function assertDrawingClipboardForestLayouts(
  values: readonly SheetDrawing[],
  metrics: PictureSheetMetrics,
): void {
  for (const value of values)
    if (isDrawingClipboardEligibleRoot(value)) resolveDrawingClipboardRootLayout(value, metrics);
}
