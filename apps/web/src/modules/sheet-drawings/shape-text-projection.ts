import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { getPictureRasterProjection } from "../../shared/images/picture-detailed-render";
import type { PictureEffectBounds } from "../../shared/images/picture-effect-geometry";
import type { PictureRasterLayer } from "../../shared/images/picture-effect-raster";
import type { ShapeTextPaintPlan, ShapeTextPaintReady } from "./shape-text-paint";

/** KeepFlat bypasses only the body's front-plane 3D map. The owning drawing's
 * ordinary 2D rotation/flip remains outside this independent text layer. */
export function shapeTextFollowsBodyProjection(drawing: SheetGraphicDrawing): boolean {
  return (
    drawing.kind === "shape" &&
    drawing.shapeText?.layout.keepFlat !== true &&
    drawing.shapeStyle?.rotation3d?.kind === "value"
  );
}
function projection(drawing: SheetGraphicDrawing, theme?: WorkbookTheme) {
  return getPictureRasterProjection(
    { rotation3d: drawing.shapeStyle?.rotation3d },
    theme ?? DEFAULT_WORKBOOK_THEME,
  );
}
export function projectedShapeTextBounds(
  drawing: SheetGraphicDrawing,
  plan: ShapeTextPaintPlan,
  theme?: WorkbookTheme,
): PictureEffectBounds {
  if (!shapeTextFollowsBodyProjection(drawing)) return { ...plan.logicalBounds };
  const resolver = projection(drawing, theme).projectedBounds;
  if (typeof resolver !== "function") throw new Error("Shape front-plane bounds unavailable.");
  const raster = resolver(plan.actualDensity, plan.outputBoundsRaster, {
    width: drawing.width * plan.actualDensity,
    height: drawing.height * plan.actualDensity,
  });
  const width = raster.right - raster.left,
    height = raster.bottom - raster.top;
  if (
    width > 4096 ||
    height > 4096 ||
    width * height > 4_000_000 ||
    width * height * 32 + plan.widthRaster * plan.heightRaster * 8 > 64 * 1024 * 1024
  )
    throw new RangeError("Projected shape text exceeds its pixel-memory budget.");
  return {
    left: raster.left / plan.actualDensity,
    top: raster.top / plan.actualDensity,
    right: raster.right / plan.actualDensity,
    bottom: raster.bottom / plan.actualDensity,
  };
}
export function projectShapeTextSurface(
  drawing: SheetGraphicDrawing,
  text: ShapeTextPaintReady,
  theme?: WorkbookTheme,
): PictureRasterLayer {
  // Preflight before reading native pixels. Extrusion belongs to the real glyph
  // silhouette in text-own 3D, never this depth-zero body front-plane transform.
  projectedShapeTextBounds(drawing, text, theme);
  const context = text.canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Shape text pixel processing unavailable.");
  const input = {
    left: text.outputBoundsRaster.left,
    top: text.outputBoundsRaster.top,
    surface: {
      width: text.canvas.width,
      height: text.canvas.height,
      data: context.getImageData(0, 0, text.canvas.width, text.canvas.height).data,
    },
  };
  if (!shapeTextFollowsBodyProjection(drawing)) return input;
  const projector = projection(drawing, theme).projectSurface;
  if (!projector) throw new Error("Shape front-plane projector unavailable.");
  return projector(input, text.actualDensity, {
    widthPx: drawing.width * text.actualDensity,
    heightPx: drawing.height * text.actualDensity,
  });
}
