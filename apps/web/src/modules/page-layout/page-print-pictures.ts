import { getPictureProperties } from "@sheetcraft/core/picture-properties";
import { getDetailedPictureStyleAssetIds } from "@sheetcraft/core/picture-detailed-style";
import { requireStandalonePictures } from "../sheet-images/picture-document-support";
import { createSheetEvaluator, type FloatingImage, type Sheet } from "@sheetcraft/core/workbook";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { getShapeStyleAssetIds } from "@sheetcraft/core/shape-style";
import { getShapeTextAssetIds } from "@sheetcraft/core/shape-text";
import { createPrintShapeMetrics, getPrintableShapeRoots } from "./page-print-shapes";
import { resolveShapeDrawing } from "../sheet-drawings/resolved-shape-drawing";

/** Printing is a separate consumer; this never changes visibility or resource ownership. */
export function getPrintablePictureRoots(sheet: Pick<Sheet, "floatingImages">): FloatingImage[] {
  return sheet.floatingImages.filter((image) => getPictureProperties(image).printObject);
}
export function getPrintPictureAssetIds(
  sheet: Sheet,
  shapeMetrics?: PictureSheetMetrics,
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
  const metrics = shapes.length
    ? (shapeMetrics ?? createPrintShapeMetrics(sheet, createSheetEvaluator(sheet)))
    : undefined;
  for (const shape of shapes) {
    if (resolveShapeDrawing(shape, metrics!).collapsed) continue;
    for (const id of getShapeStyleAssetIds(shape.shapeStyle)) ids.add(id);
    for (const id of getShapeTextAssetIds(shape.shapeText)) ids.add(id);
  }
  const watermark = sheet.pageDecoration?.watermark?.image?.assetId;
  if (watermark) ids.add(watermark);
  return ids;
}
