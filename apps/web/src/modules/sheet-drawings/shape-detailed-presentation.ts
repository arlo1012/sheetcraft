import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { PictureFrameRect } from "@sheetcraft/core/picture-frame";
import type { ShapePresetBounds } from "@sheetcraft/core/shape-presets";
import { planShapeDetailedPaint, type ShapeDetailedPaintRaster } from "./shape-detailed-paint";
import {
  getDrawingShapeGeometry,
  standardShapeWorldToLocal,
  standardShapeFlipPoint,
} from "./shape-geometry";
import { layoutDrawingShapeText } from "./shape-text-runtime";
import { planShapeTextPaint } from "./shape-text-paint";
import { projectedShapeTextBounds } from "./shape-text-projection";

/** This canvas is the component's own presentation copy, never an evictable shared cache entry. */
export interface ShapeDetailedPresentation {
  drawing: SheetGraphicDrawing;
  canvas: HTMLCanvasElement;
  density: number;
  bounds: ShapePresetBounds;
  /** Independent owned body/glyph surfaces; each retains its own origin/density. */
  layers?: readonly ShapeDetailedPresentation[];
  /** Text follows readable desktop flip semantics, not the body's bitmap reflection. */
  unflipped?: true;
}
export function combineShapePresentations(
  drawing: SheetGraphicDrawing,
  presentations: readonly (ShapeDetailedPresentation | undefined)[],
): ShapeDetailedPresentation | undefined {
  const layers = presentations.filter(
    (p): p is ShapeDetailedPresentation => !!p && p.drawing === drawing,
  );
  const first = layers[0];
  if (!first) return;
  if (layers.length === 1) return first;
  const left = Math.min(...layers.map((p) => p.bounds.left));
  const top = Math.min(...layers.map((p) => p.bounds.top));
  const right = Math.max(...layers.map((p) => p.bounds.left + p.bounds.width));
  const bottom = Math.max(...layers.map((p) => p.bounds.top + p.bounds.height));
  return { ...first, bounds: { left, top, width: right - left, height: bottom - top }, layers };
}
export const SHAPE_PRESENTATION_BYTE_LIMIT = 64 * 1024 * 1024;
const presentationBytes = new WeakMap<HTMLCanvasElement, number>();
let allocatedBytes = 0;
/** Read-only accounting for consumers sharing the bounded presentation pool. */
export function getShapePresentationAllocatedBytes() {
  return allocatedBytes;
}
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
  if (!drawing.shapeStyle && !drawing.shapeText) return;
  const geometry = getDrawingShapeGeometry(drawing);
  if (!geometry) return;
  const plan = planShapeDetailedPaint({ drawing, geometry, density: 1 });
  let bounds = plan.logicalBounds;
  if (drawing.shapeText && drawing.text) {
    const textPlan = planShapeTextPaint({
      drawing,
      layout: layoutDrawingShapeText(drawing),
      density: 1,
    });
    const unflippedText = projectedShapeTextBounds(drawing, textPlan);
    const text = {
      left: drawing.shapeFlipX ? drawing.width - unflippedText.right : unflippedText.left,
      right: drawing.shapeFlipX ? drawing.width - unflippedText.left : unflippedText.right,
      top: drawing.shapeFlipY ? drawing.height - unflippedText.bottom : unflippedText.top,
      bottom: drawing.shapeFlipY ? drawing.height - unflippedText.top : unflippedText.bottom,
    };
    bounds = {
      left: Math.min(bounds.left, text.left),
      top: Math.min(bounds.top, text.top),
      right: Math.max(bounds.right, text.right),
      bottom: Math.max(bounds.bottom, text.bottom),
    };
  }
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
  if (presentation.layers)
    return presentation.layers.some((layer) =>
      detailedShapeContainsWorldPoint(drawing, frame, point, layer),
    );
  const worldLocal = standardShapeWorldToLocal(frame, drawing.rotation, point);
  const local = presentation.unflipped ? worldLocal : standardShapeFlipPoint(drawing, worldLocal);
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
