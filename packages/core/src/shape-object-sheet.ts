import { createPictureSheetMetrics, locatePictureAxisPoint } from "./picture-axis-metrics.js";
import { resolveShapeFrame } from "./shape-frame.js";
import { isShapeGroupDrawing, traverseShapeGroup } from "./shape-group.js";
import { resolveShapeGroup } from "./shape-group-layout.js";
import { resolveSheetShapeConnections } from "./shape-connector-layout.js";
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
  let hasConnector = false;
  for (const drawing of framed) {
    if (isShapeGroupDrawing(drawing)) {
      resolveShapeGroup(drawing, metrics);
      hasConnector ||= traverseShapeGroup(drawing).some(
        ({ node }) => node.kind === "shape" && "shapeConnector" in node,
      );
    } else {
      resolveShapeFrame(drawing.shapeFrame, metrics, drawing.rotation);
      hasConnector ||= drawing.kind === "shape" && "shapeConnector" in drawing;
    }
  }
  // The stored carrier can stay within budget while its derived route does not.
  // Apply connector budgets only to forests that actually use this feature.
  if (hasConnector) resolveSheetShapeConnections(drawings!, metrics);
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
