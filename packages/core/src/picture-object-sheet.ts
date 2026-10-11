import { isPictureGroup } from "./picture-group.js";
import { resolvePictureGroup } from "./picture-group-layout.js";
import { isFramedPictureObject } from "./picture-object.js";
import { createPictureSheetMetrics, locatePictureAxisPoint } from "./picture-axis-metrics.js";
import { resolvePictureFrame } from "./picture-frame.js";
import { MAX_SHEET_ROWS, MAX_SHEET_COLUMNS } from "./sheet-limits.js";
import type { CellAddress, FloatingImage, Sheet } from "./workbook.js";

/** Validate derived geometry before any owning command changes worksheet state. */
export function assertPictureObjectsForSheet(images: readonly FloatingImage[], sheet: Sheet): void {
  if (!images.some((image) => isFramedPictureObject(image) || isPictureGroup(image))) return;
  const metrics = createPictureSheetMetrics(sheet);
  for (const image of images) {
    if (isPictureGroup(image)) resolvePictureGroup(image, metrics);
    else if (isFramedPictureObject(image)) resolvePictureFrame(image.frame, metrics);
  }
}

/** Navigation only: never use this projection as persisted object geometry. */
export function getPictureObjectOriginCell(image: FloatingImage, sheet: Sheet): CellAddress {
  if (!isFramedPictureObject(image) && !isPictureGroup(image)) return { ...image.anchor };
  const anchor = image.frame.anchor;
  if (anchor.mode !== "fixed") {
    const point = anchor.mode === "move-only" ? anchor.origin : anchor.start;
    return {
      row: Math.min(MAX_SHEET_ROWS - 1, point.row.index),
      column: Math.min(MAX_SHEET_COLUMNS - 1, point.column.index),
    };
  }
  const metrics = createPictureSheetMetrics(sheet);
  return {
    row: Math.min(MAX_SHEET_ROWS - 1, locatePictureAxisPoint(anchor.y, metrics.rows).index),
    column: Math.min(
      MAX_SHEET_COLUMNS - 1,
      locatePictureAxisPoint(anchor.x, metrics.columns).index,
    ),
  };
}
