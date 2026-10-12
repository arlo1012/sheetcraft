import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { PictureFrameRect } from "@sheetcraft/core/picture-frame";
import type { ShapePresetBounds } from "@sheetcraft/core/shape-presets";
import { planShapeDetailedPaint, type ShapeDetailedPaintRaster } from "./shape-detailed-paint";
import {
  getDrawingShapeGeometry,
  standardShapeWorldToLocal,
  standardShapeFlipPoint,
} from "./shape-geometry";

/** This canvas is the component's own presentation copy, never an evictable shared cache entry. */
export interface ShapeDetailedPresentation {
  drawing: SheetGraphicDrawing;
  canvas: HTMLCanvasElement;
  density: number;
  bounds: ShapePresetBounds;
}
export const SHAPE_PRESENTATION_BYTE_LIMIT = 64 * 1024 * 1024;
const presentationBytes = new WeakMap<HTMLCanvasElement, number>();
let allocatedBytes = 0;
/** Aggregate viewport/preview presentation copies stay bounded independently of the paint cache. */
export function resizeShapePresentationCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const bytes = width * height * 4;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    width * height > 4_000_000 ||
    allocatedBytes - (presentationBytes.get(canvas) ?? 0) + bytes > SHAPE_PRESENTATION_BYTE_LIMIT
  )
    throw new RangeError("Shape presentation exceeds its pixel-memory budget.");
  const previous = presentationBytes.get(canvas) ?? 0;
  canvas.width = width;
  canvas.height = height;
  presentationBytes.set(canvas, bytes);
  allocatedBytes += bytes - previous;
}
export function releaseShapePresentationCanvas(canvas: HTMLCanvasElement) {
  allocatedBytes -= presentationBytes.get(canvas) ?? 0;
  presentationBytes.delete(canvas);
  canvas.width = 0;
  canvas.height = 0;
}
export function detailedShapeLocalBounds(
  drawing: SheetGraphicDrawing,
): ShapePresetBounds | undefined {
  if (!drawing.shapeStyle) return;
  const geometry = getDrawingShapeGeometry(drawing);
  if (!geometry) return;
  const plan = planShapeDetailedPaint({ drawing, geometry, density: 1 });
  const bounds = plan.logicalBounds;
  return {
    left: bounds.left,
    top: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}
export function shapePresentationBounds(result: ShapeDetailedPaintRaster): ShapePresetBounds {
  const b = result.logicalBounds;
  return {
    left: b.left,
    top: b.top,
    width: b.right - b.left,
    height: b.bottom - b.top,
  };
}
/** Actual alpha includes compound/dashed outlines, holes, tail extrusion and projected faces.
 * Empty pixels use the original pointer event to select the underlying grid cell. */
export function detailedShapeContainsWorldPoint(
  drawing: SheetGraphicDrawing,
  frame: PictureFrameRect,
  point: Readonly<{ x: number; y: number }>,
  presentation: ShapeDetailedPresentation | undefined,
): boolean {
  if (!presentation || presentation.drawing !== drawing) return false;
  const local = standardShapeFlipPoint(
    drawing,
    standardShapeWorldToLocal(frame, drawing.rotation, point),
  );
  const x = Math.floor((local.x - presentation.bounds.left) * presentation.density);
  const y = Math.floor((local.y - presentation.bounds.top) * presentation.density);
  if (x < 0 || y < 0 || x >= presentation.canvas.width || y >= presentation.canvas.height)
    return false;
  try {
    return (presentation.canvas.getContext("2d")?.getImageData(x, y, 1, 1).data[3] ?? 0) > 1;
  } catch {
    return false;
  }
}
