import { getPictureProperties } from "@sheetcraft/core/picture-properties";
import { getDetailedPictureStyleAssetIds } from "@sheetcraft/core/picture-detailed-style";
import { requireStandalonePictures } from "../sheet-images/picture-document-support";
import { createSheetEvaluator, type FloatingImage, type Sheet } from "@sheetcraft/core/workbook";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { ResolvedShapeForestForRender } from "../sheet-drawings/resolved-shape-render-source";
import { getShapeStyleAssetIds } from "@sheetcraft/core/shape-style";
import { getShapeTextAssetIds } from "@sheetcraft/core/shape-text";
import {
  createPrintShapeMetrics,
  getPrintableShapeLeaves,
  getPrintableShapeRoots,
} from "./page-print-shapes";

/** Printing is a separate consumer; this never changes visibility or resource ownership. */
export function getPrintablePictureRoots(sheet: Pick<Sheet, "floatingImages">): FloatingImage[] {
  return sheet.floatingImages.filter((image) => getPictureProperties(image).printObject);
}
export function getPrintPictureAssetIds(
  sheet: Sheet,
  shapeMetrics?: PictureSheetMetrics,
  renderPass?: ResolvedShapeForestForRender,
): Set<string> {
  const ids = new Set<string>();
  for (const image of requireStandalonePictures(getPrintablePictureRoots(sheet))) {
    ids.add(image.assetId);
    for (const id of getDetailedPictureStyleAssetIds(image.transform?.appearance?.detailedStyle))
      ids.add(id);
  }
  for (const cell of sheet.cells.values()) {
    if (cell.content?.kind !== "image" || !getPictureProperties(cell.content.image).printObject)
      continue;
    ids.add(cell.content.image.assetId);
    for (const id of getDetailedPictureStyleAssetIds(
      cell.content.image.transform?.appearance?.detailedStyle,
    ))
      ids.add(id);
  }
  const shapes = getPrintableShapeRoots(sheet);
  const metrics =
    shapes.length || renderPass
      ? (shapeMetrics ??
        renderPass?.metrics ??
        createPrintShapeMetrics(sheet, createSheetEvaluator(sheet)))
      : undefined;
  if (metrics)
    for (const { drawing } of getPrintableShapeLeaves(sheet, metrics, renderPass)) {
      for (const id of getShapeStyleAssetIds(drawing.shapeStyle)) ids.add(id);
      for (const id of getShapeTextAssetIds(drawing.shapeText, drawing.text)) ids.add(id);
    }
  const watermark = sheet.pageDecoration?.watermark?.image?.assetId;
  if (watermark) ids.add(watermark);
  return ids;
}
