import { createPictureSheetMetrics, locatePictureAxisPoint } from "./picture-axis-metrics.js";
import { resolveShapeFrame } from "./shape-frame.js";
import { isShapeGroupDrawing } from "./shape-group.js";
import { resolveShapeGroup } from "./shape-group-layout.js";
import { hasShapeObjectFrame, type SheetDrawing } from "./sheet-drawings.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import type { CellAddress, Sheet } from "./workbook.js";

/** Derived geometry is checked before the owning workbook mutation. Hidden collapse is valid. */
export function assertShapeObjectsForSheet(
  drawings: readonly SheetDrawing[] | undefined,
  sheet: Sheet,
): void {
  const framed = drawings?.filter(hasShapeObjectFrame);
  if (!framed?.length) return;
  const metrics = createPictureSheetMetrics(sheet);
  for (const drawing of framed) {
    if (isShapeGroupDrawing(drawing)) resolveShapeGroup(drawing, metrics);
    else resolveShapeFrame(drawing.shapeFrame, metrics, drawing.rotation);
  }
}

/** Navigation only. Never persist this projection as canonical object placement. */
export function getShapeObjectOriginCell(drawing: SheetDrawing, sheet: Sheet): CellAddress {
  if (!hasShapeObjectFrame(drawing)) return { ...drawing.anchor };
  const anchor = drawing.shapeFrame.anchor;
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
