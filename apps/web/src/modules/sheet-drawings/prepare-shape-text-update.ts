import {
  requireLegacySheetDrawing,
  isFramedShapeDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resizeShapeFrame, resolveShapeFrame } from "@sheetcraft/core/shape-frame";
import {
  resolveShapeDrawing,
  updateResolvedShapeDrawing,
  type ResolvedShapeDrawing,
} from "./resolved-shape-drawing";
import { shapeViewAtRect } from "./shape-view-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  prepareDrawingShapeTextCandidate,
  getDrawingShapeTextRect,
  layoutDrawingShapeText,
  type DrawingShapeTextRuntimeOptions,
} from "./shape-text-runtime";
import { standardShapeResizeRect } from "./standard-shape-layout";
import {
  planShapeTextPaint,
  preflightShapeTextGlyphBudgets,
  type ShapeTextPaintOptions,
} from "./shape-text-paint";
import { projectedShapeTextBounds } from "./shape-text-projection";
import { materializeDrawingShapeText, withDrawingShapeText } from "./shape-text-options";

function sameData(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
function autoFitInputs(drawing: SheetGraphicDrawing) {
  const text = materializeDrawingShapeText(drawing),
    layout = text.layout;
  return {
    family: text.fontFamily,
    direction: layout.direction,
    lineOrder: layout.lineOrder,
    margins: layout.marginsPt,
    wrap: layout.wrap,
    autoFit: layout.autoFit,
    paragraph: text.paragraph,
  };
}

/** One pre-command text/geometry candidate. Never writes history or mutates a
 * source. Canvas/font readiness failures leave the caller's draft intact. */
export function prepareShapeTextUpdate(
  candidate: SheetDrawing,
  source: SheetDrawing | undefined,
  viewport: SheetViewportLayout | undefined,
  measurement?: DrawingShapeTextRuntimeOptions,
  paint?: Pick<ShapeTextPaintOptions, "resources"> & {
    preflight?: typeof preflightShapeTextGlyphBudgets;
  },
  metrics?: PictureSheetMetrics,
): SheetDrawing {
  if (isFramedShapeDrawing(candidate)) {
    if (!metrics) throw new Error("Shape editing requires current worksheet metrics.");
    const resolved = resolveShapeDrawing(candidate, metrics);
    if (resolved.collapsed) return candidate;
    const owner = source && resolveShapeDrawing(source, metrics).view;
    const prepared = prepareShapeViewTextUpdate(
      resolved.view,
      owner,
      viewport,
      measurement,
      paint,
      resolved,
    );
    return prepared === resolved.view
      ? candidate
      : updateResolvedShapeDrawing(resolved, prepared, metrics);
  }
  return prepareShapeViewTextUpdate(candidate, source, viewport, measurement, paint);
}
function prepareShapeViewTextUpdate(
  candidate: SheetDrawing,
  source: SheetDrawing | undefined,
  viewport: SheetViewportLayout | undefined,
  measurement?: DrawingShapeTextRuntimeOptions,
  paint?: Pick<ShapeTextPaintOptions, "resources"> & {
    preflight?: typeof preflightShapeTextGlyphBudgets;
  },
  resolved?: ResolvedShapeDrawing,
): ReturnType<typeof requireLegacySheetDrawing> {
  const drawing = requireLegacySheetDrawing(candidate);
  const owner = source && requireLegacySheetDrawing(source);
  if (drawing.kind !== "shape" && drawing.kind !== "textBox") return drawing;
  // Shapes without a text area retain historical text without blocking unrelated properties.
  if (!getDrawingShapeTextRect(drawing)) return drawing;
  const manualHeightChange =
    !!owner &&
    (owner.kind === "shape" || owner.kind === "textBox") &&
    drawing.height !== owner.height &&
    sameData(drawing.shapeText, owner.shapeText);
  if (!drawing.text) {
    if (manualHeightChange && drawing.shapeText?.layout.autoFit === "resize-shape") {
      const text = materializeDrawingShapeText(drawing);
      text.layout.autoFit = "none";
      return withDrawingShapeText(drawing, text);
    }
    if (drawing.shapeText?.layout.autoFit !== "resize-shape" || !getDrawingShapeTextRect(drawing))
      return drawing;
  }
  if (!drawing.shapeText && drawing.shapeStyle?.rotation3d?.kind !== "value") return drawing;
  const unchangedLayout =
    owner &&
    (owner.kind === "shape" || owner.kind === "textBox") &&
    drawing.text === owner.text &&
    drawing.width === owner.width &&
    drawing.height === owner.height &&
    drawing.fontSize === owner.fontSize &&
    drawing.bold === owner.bold &&
    drawing.italic === owner.italic &&
    sameData(drawing.shapeGeometry, owner.shapeGeometry) &&
    sameData(drawing.shapePath, owner.shapePath) &&
    sameData(autoFitInputs(drawing), autoFitInputs(owner));
  if (
    unchangedLayout &&
    drawing.kind === owner.kind &&
    drawing.color === owner.color &&
    drawing.rotation === owner.rotation &&
    sameData(drawing.shapeStyle, owner.shapeStyle) &&
    sameData(drawing.shapeText, owner.shapeText) &&
    drawing.shapeFlipX === owner.shapeFlipX &&
    drawing.shapeFlipY === owner.shapeFlipY
  )
    return drawing;
  // Paint-only rotation/color/body changes require genuine alpha proof, but
  // cannot silently resize an already fitted frame a second time.
  const prepared = unchangedLayout
    ? {
        drawing,
        layout: layoutDrawingShapeText(drawing, measurement),
        resized: false,
      }
    : prepareDrawingShapeTextCandidate(drawing, {
        ...measurement,
        manualHeightChange,
        ...(resolved
          ? {
              normalizeView: (view: SheetGraphicDrawing) =>
                resolveShapeDrawing(
                  updateResolvedShapeDrawing(resolved, view, resolved.metrics),
                  resolved.metrics,
                ).view as SheetGraphicDrawing,
            }
          : {}),
      });
  if (prepared.drawing.text) {
    const textPlan = planShapeTextPaint({
      drawing: prepared.drawing,
      layout: prepared.layout,
      density: 1,
      resources: paint?.resources,
    });
    const proof = (paint?.preflight ?? preflightShapeTextGlyphBudgets)({
      drawing: prepared.drawing,
      layout: prepared.layout,
      density: 1,
      resources: paint?.resources,
    });
    if (proof.kind !== "ready")
      throw new Error("Shape text paint pixels are not ready; the draft has been preserved.");
    projectedShapeTextBounds(prepared.drawing, textPlan);
  }
  if (!prepared.resized) return prepared.drawing;
  if (resolved && isFramedShapeDrawing(resolved.source)) {
    const frame = resizeShapeFrame(
      resolved.source.shapeFrame,
      {
        width: prepared.drawing.width,
        height: prepared.drawing.height,
      },
      resolved.metrics,
      prepared.drawing.rotation,
    );
    return shapeViewAtRect(
      prepared.drawing,
      resolveShapeFrame(frame, resolved.metrics, prepared.drawing.rotation).rect,
      resolved.metrics,
    );
  }
  if (!viewport) throw new Error("Shape AutoFit requires the current worksheet geometry.");
  const frame = getFloatingImageSheetRect(drawing, viewport);
  if (!frame) throw new Error("Shape AutoFit anchor is unavailable.");
  const delta = prepared.drawing.height - drawing.height;
  const radians = (drawing.rotation * Math.PI) / 180;
  const rect = standardShapeResizeRect(
    frame,
    drawing.rotation,
    "s",
    { x: -Math.sin(radians) * delta, y: Math.cos(radians) * delta },
    false,
    1,
  );
  const result = rect && reanchorFloatingImageAtSheetRect(prepared.drawing, rect, viewport);
  if (!result)
    throw new Error("Shape AutoFit cannot preserve its local top edge at this worksheet boundary.");
  return result as SheetGraphicDrawing;
}
