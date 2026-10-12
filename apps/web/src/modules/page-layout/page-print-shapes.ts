import {
  isFramedShapeDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import {
  type PictureAxisMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { shapeFrameLocalToWorld, type ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  DEFAULT_ROW_HEIGHT,
  getDefaultColumnWidth,
  type Sheet,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { createPicturePaintResources } from "../../shared/images/picture-paint-resources";
import {
  getPicturePaintDensity,
  type PicturePaintResources,
} from "../../shared/images/picture-detailed-render";
import type { CanvasImageCache } from "../sheet-grid/canvas/image-painter";
import {
  createSheetHiddenColumnIntervals,
  createSheetHiddenRowIntervals,
} from "../sheet-grid/data-visibility";
import { resolveShapeDrawing } from "../sheet-drawings/resolved-shape-drawing";
import {
  getDrawingShapeGeometry,
  getStandardShapeGeometry,
} from "../sheet-drawings/shape-geometry";
import { getLegacyShapeGeometry } from "../sheet-drawings/legacy-shape-geometry";
import {
  planShapeDetailedPaint,
  prepareShapeDetailedPaint,
  ShapePaintUnavailableError,
} from "../sheet-drawings/shape-detailed-paint";
import {
  ensureDrawingShapeTextFont,
  layoutDrawingShapeText,
  ShapeTextRuntimeError,
} from "../sheet-drawings/shape-text-runtime";
import { planShapeTextPaint, prepareShapeTextPaint } from "../sheet-drawings/shape-text-paint";
import {
  projectedShapeTextBounds,
  projectShapeTextSurface,
  shapeTextFollowsBodyProjection,
} from "../sheet-drawings/shape-text-projection";
import {
  resizeShapePresentationCanvas,
  releaseShapePresentationCanvas,
} from "../sheet-drawings/shape-detailed-presentation";

type PrintableShape = SheetGraphicDrawing | SheetFramedGraphicDrawing;
type Bounds = { left: number; top: number; right: number; bottom: number };

/** Preserve the real owners and their sheet drawing order. Other graphic kinds are separate consumers. */
export function getPrintableShapeRoots(sheet: Pick<Sheet, "drawings">): PrintableShape[] {
  if (sheet.drawings?.some((drawing) => drawing.kind === "shapeGroup"))
    throw new ShapeTextRuntimeError(
      "unsupported-drawing",
      "Shape group printing is not yet enabled.",
    );
  return (sheet.drawings ?? []).filter(
    (drawing): drawing is PrintableShape =>
      (drawing.kind === "shape" || drawing.kind === "textBox") &&
      (!isFramedShapeDrawing(drawing) ||
        getShapeObjectProperties(drawing.shapeProperties).printObject),
  );
}

/** Sparse continuous worksheet geometry, including actual filter/outline visibility, never page gaps. */
export function createPrintShapeMetrics(
  sheet: Sheet,
  evaluator: SheetEvaluator,
): PictureSheetMetrics {
  const geometry = createSheetGeometry({
    rowCount: MAX_SHEET_ROWS,
    columnCount: MAX_SHEET_COLUMNS,
    rowHeight: DEFAULT_ROW_HEIGHT,
    columnWidth: getDefaultColumnWidth(sheet),
    rowHeights: sheet.rowHeights,
    columnWidths: sheet.columnWidths,
    hiddenRows: sheet.hiddenRows,
    hiddenColumns: [
      ...(sheet.hiddenColumns ?? []),
      ...createSheetHiddenColumnIntervals(sheet).flatMap(({ start, end }) =>
        Array.from({ length: end - start + 1 }, (_, index) => start + index),
      ),
    ],
  });
  const rows = createRowVisibilityIndex({
    rowCount: MAX_SHEET_ROWS,
    defaultRowHeight: DEFAULT_ROW_HEIGHT,
    rowHeights: sheet.rowHeights,
    hiddenRows: sheet.hiddenRows,
    hiddenIntervals: createSheetHiddenRowIntervals(sheet, evaluator),
  });
  return createPictureViewMetrics(sheet, geometry, rows);
}

export class ShapePrintError extends Error {
  readonly code = "shape-print-unavailable";
  constructor(
    readonly drawingId: string,
    cause: unknown,
  ) {
    super(
      `Cannot print shape ${JSON.stringify(drawingId)}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "ShapePrintError";
  }
}
function checked<T>(id: string, work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw error instanceof ShapePrintError ? error : new ShapePrintError(id, error);
  }
}
function geometryFor(drawing: SheetGraphicDrawing) {
  const geometry =
    getDrawingShapeGeometry(drawing) ??
    (!drawing.shapeGeometry && !drawing.shapePath
      ? drawing.kind === "textBox"
        ? getStandardShapeGeometry({ preset: "rect" }, drawing.width, drawing.height)
        : getLegacyShapeGeometry(drawing.shape, drawing.width, drawing.height)
      : undefined);
  if (!geometry) throw new Error("The actual numeric shape geometry is unavailable.");
  return geometry;
}
function worldBounds(
  drawing: SheetGraphicDrawing,
  rect: ShapeFrameRect,
  local: Bounds,
  flip: boolean,
): Bounds {
  const points = [
    { x: local.left, y: local.top },
    { x: local.right, y: local.top },
    { x: local.right, y: local.bottom },
    { x: local.left, y: local.bottom },
  ].map((point) =>
    shapeFrameLocalToWorld(rect, drawing.rotation, {
      x: flip && drawing.shapeFlipX ? drawing.width - point.x : point.x,
      y: flip && drawing.shapeFlipY ? drawing.height - point.y : point.y,
    }),
  );
  return {
    left: Math.min(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    right: Math.max(...points.map((p) => p.x)),
    bottom: Math.max(...points.map((p) => p.y)),
  };
}
function union(left: Bounds, right: Bounds): Bounds {
  return {
    left: Math.min(left.left, right.left),
    top: Math.min(left.top, right.top),
    right: Math.max(left.right, right.right),
    bottom: Math.max(left.bottom, right.bottom),
  };
}
function axisCount(position: number, metrics: PictureAxisMetrics): number {
  let low = 0,
    high = metrics.count;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (metrics.visiblePrefix(middle) < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Real body/path tails and ready native glyph bounds determine shape-only pagination.
 * Pending fonts defer only their bounds; the final print owner awaits readiness and
 * recreates the document before choosing pages. Paint itself never suppresses failure. */
export function getPrintShapeContentExtent(
  sheet: Sheet,
  metrics: PictureSheetMetrics,
  theme?: WorkbookTheme,
) {
  let rowCount = 0,
    columnCount = 0;
  for (const source of getPrintableShapeRoots(sheet))
    checked(source.id, () => {
      const resolved = resolveShapeDrawing(source, metrics);
      if (resolved.collapsed) return;
      const drawing = resolved.view as SheetGraphicDrawing;
      const plan = planShapeDetailedPaint({
        drawing,
        geometry: geometryFor(drawing),
        density: 1,
        resources: { theme },
      });
      let bounds = worldBounds(
        drawing,
        resolved.rect,
        union(plan.logicalBounds, {
          left: 0,
          top: 0,
          right: drawing.width,
          bottom: drawing.height,
        }),
        true,
      );
      if (drawing.text) {
        try {
          const textPlan = planShapeTextPaint({
            drawing,
            layout: layoutDrawingShapeText(drawing),
            density: 1,
            resources: { theme },
          });
          bounds = union(
            bounds,
            worldBounds(
              drawing,
              resolved.rect,
              projectedShapeTextBounds(drawing, textPlan, theme),
              false,
            ),
          );
        } catch (error) {
          if (!(error instanceof ShapeTextRuntimeError) || error.code !== "font-not-ready")
            throw error;
        }
      }
      columnCount = Math.max(columnCount, axisCount(bounds.right, metrics.columns));
      rowCount = Math.max(rowCount, axisCount(bounds.bottom, metrics.rows));
    });
  return { rowCount, columnCount };
}

export async function preparePrintShapeFonts(
  sheet: Sheet,
  metrics: PictureSheetMetrics,
): Promise<void> {
  for (const source of getPrintableShapeRoots(sheet)) {
    const resolved = checked(source.id, () => resolveShapeDrawing(source, metrics));
    if (resolved.collapsed || !resolved.view.text) continue;
    try {
      await ensureDrawingShapeTextFont(resolved.view as SheetGraphicDrawing);
    } catch (error) {
      throw new ShapePrintError(source.id, error);
    }
  }
}

/** The genuine shape raster pipeline. It owns no document assets or source geometry mutations. */
export function paintPrintShapes(
  context: CanvasRenderingContext2D,
  options: {
    sheet: Sheet;
    metrics: PictureSheetMetrics;
    viewport: ShapeFrameRect;
    theme?: WorkbookTheme;
    assetUrls?: ReadonlyMap<string, string>;
    images: CanvasImageCache;
    density?: number;
  },
): void {
  const resources = createPicturePaintResources(options.theme, options.assetUrls, options.images);
  const density = options.density ?? getPicturePaintDensity(context);
  context.save();
  try {
    context.beginPath();
    context.rect(0, 0, options.viewport.width, options.viewport.height);
    context.clip();
    for (const source of getPrintableShapeRoots(options.sheet))
      checked(source.id, () => {
        const resolved = resolveShapeDrawing(source, options.metrics);
        if (resolved.collapsed) return;
        const drawing = resolved.view as SheetGraphicDrawing;
        const bodyOptions = {
          drawing,
          geometry: geometryFor(drawing),
          density,
          resources,
          sourceIdentity: source,
        };
        const bodyPlan = planShapeDetailedPaint(bodyOptions);
        if (bodyPlan.kind !== "ready") throw new ShapePaintUnavailableError(bodyPlan);
        let bounds = worldBounds(drawing, resolved.rect, bodyPlan.logicalBounds, true);
        // Resolve every printable text source before culling. Unknown/missing fonts
        // cannot be silently hidden by a page clip or replaced with fallback glyphs.
        const layout = drawing.text ? layoutDrawingShapeText(drawing) : undefined;
        if (layout) {
          const textPlan = planShapeTextPaint({ drawing, layout, density, resources });
          if (textPlan.kind !== "ready") throw new ShapePaintUnavailableError(textPlan);
          bounds = union(
            bounds,
            worldBounds(
              drawing,
              resolved.rect,
              projectedShapeTextBounds(drawing, textPlan, options.theme),
              false,
            ),
          );
        }
        if (
          bounds.right <= options.viewport.x ||
          bounds.bottom <= options.viewport.y ||
          bounds.left >= options.viewport.x + options.viewport.width ||
          bounds.top >= options.viewport.y + options.viewport.height
        )
          return;
        context.save();
        try {
          context.translate(
            resolved.rect.x + drawing.width / 2 - options.viewport.x,
            resolved.rect.y + drawing.height / 2 - options.viewport.y,
          );
          context.rotate((drawing.rotation * Math.PI) / 180);
          context.translate(-drawing.width / 2, -drawing.height / 2);
          const body = prepareShapeDetailedPaint(bodyOptions);
          if (body.kind !== "ready") throw new ShapePaintUnavailableError(body);
          context.save();
          try {
            context.translate(
              drawing.shapeFlipX ? drawing.width : 0,
              drawing.shapeFlipY ? drawing.height : 0,
            );
            context.scale(drawing.shapeFlipX ? -1 : 1, drawing.shapeFlipY ? -1 : 1);
            drawRaster(context, body.canvas, body.logicalBounds, body.actualDensity);
          } finally {
            context.restore();
          }
          if (layout)
            paintText(context, drawing, layout, density, resources, options.theme, source);
        } finally {
          context.restore();
        }
      });
  } finally {
    context.restore();
  }
}
function drawRaster(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  bounds: Bounds,
  density: number,
): void {
  if (canvas.width <= 0 || canvas.height <= 0 || !Number.isFinite(density) || density <= 0)
    throw new Error("The prepared shape pixel surface is unavailable.");
  context.drawImage(
    canvas,
    bounds.left,
    bounds.top,
    canvas.width / density,
    canvas.height / density,
  );
}
function paintText(
  context: CanvasRenderingContext2D,
  drawing: SheetGraphicDrawing,
  layout: ReturnType<typeof layoutDrawingShapeText>,
  density: number,
  resources: PicturePaintResources,
  theme: WorkbookTheme | undefined,
  source: PrintableShape,
): void {
  const text = prepareShapeTextPaint({
    drawing,
    layout,
    density,
    resources,
    sourceIdentity: source,
  });
  if (text.kind !== "ready") throw new ShapePaintUnavailableError(text);
  try {
    if (!shapeTextFollowsBodyProjection(drawing)) {
      drawRaster(context, text.canvas, text.logicalBounds, text.actualDensity);
      return;
    }
    const projected = projectShapeTextSurface(drawing, text, theme);
    const canvas = document.createElement("canvas");
    try {
      resizeShapePresentationCanvas(canvas, projected.surface.width, projected.surface.height);
      const paint = canvas.getContext("2d");
      if (!paint) throw new Error("Projected shape text canvas is unavailable.");
      const pixels = paint.createImageData(projected.surface.width, projected.surface.height);
      pixels.data.set(projected.surface.data);
      paint.putImageData(pixels, 0, 0);
      drawRaster(
        context,
        canvas,
        {
          left: projected.left / text.actualDensity,
          top: projected.top / text.actualDensity,
          right: 0,
          bottom: 0,
        },
        text.actualDensity,
      );
    } finally {
      releaseShapePresentationCanvas(canvas);
    }
  } finally {
    text.dispose();
  }
}
