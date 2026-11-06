import { getPictureProperties } from "@sheetcraft/core/picture-properties";
import { getDetailedPictureStyleAssetIds } from "@sheetcraft/core/picture-detailed-style";
import { requireStandalonePictures } from "../sheet-images/picture-document-support";
import { createSheetEvaluator, type FloatingImage, type Sheet } from "@sheetcraft/core/workbook";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { ResolvedShapeForestForRender } from "../sheet-drawings/resolved-shape-render-source";
import { getShapeStyleAssetIds } from "@sheetcraft/core/shape-style";
import { getShapeTextAssetIds } from "@sheetcraft/core/shape-text";
import { doMergedCellRangesIntersect, getMergedCellRangeAtAddress } from "@sheetcraft/core";
import { isSheetDrawingVisible } from "@sheetcraft/core/sheet-drawings";
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
  resolveSheet?: (sheetId: string) => Sheet | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const image of requireStandalonePictures(getPrintablePictureRoots(sheet))) {
    ids.add(image.assetId);
    for (const id of getDetailedPictureStyleAssetIds(image.transform?.appearance?.detailedStyle))
      ids.add(id);
  }
  // A camera reproduces its visible cells, independently of each source
  // picture's direct-print flag. Prepare these sources before the final render.
  const cameraRanges = (sheet.drawings ?? []).flatMap((drawing) =>
    drawing.kind === "camera" &&
    isSheetDrawingVisible(drawing) &&
    drawing.camera.range &&
    (drawing.camera.sheetId === undefined || drawing.camera.sheetId === sheet.id)
      ? [drawing.camera.range]
      : [],
  );
  for (const drawing of sheet.drawings ?? []) {
    if (
      drawing.kind !== "camera" ||
      !isSheetDrawingVisible(drawing) ||
      !drawing.camera.range ||
      drawing.camera.sheetId === undefined ||
      drawing.camera.sheetId === sheet.id
    )
      continue;
    const source = resolveSheet?.(drawing.camera.sheetId);
    if (!source) continue;
    for (const [key, cell] of source.cells) {
      if (cell.content?.kind !== "image") continue;
      const [row, column] = key.split(":").map(Number);
      const address = { row: row!, column: column! };
      const sourceRange = getMergedCellRangeAtAddress(source.mergedCells, address) ?? {
        start: address,
        end: address,
      };
      if (!doMergedCellRangesIntersect(drawing.camera.range, sourceRange)) continue;
      ids.add(cell.content.image.assetId);
      for (const id of getDetailedPictureStyleAssetIds(
        cell.content.image.transform?.appearance?.detailedStyle,
      ))
        ids.add(id);
    }
  }
  for (const [key, cell] of sheet.cells) {
    if (cell.content?.kind !== "image") continue;
    if (!getPictureProperties(cell.content.image).printObject) {
      const [row, column] = key.split(":").map(Number);
      const address = { row: row!, column: column! };
      const sourceRange = getMergedCellRangeAtAddress(sheet.mergedCells, address) ?? {
        start: address,
        end: address,
      };
      if (!cameraRanges.some((range) => doMergedCellRangesIntersect(range, sourceRange))) continue;
    }
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
