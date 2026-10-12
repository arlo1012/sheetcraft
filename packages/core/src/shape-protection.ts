import {
  isFramedShapeDrawing,
  normalizeSheetDrawings,
  type SheetDrawing,
} from "./sheet-drawings.js";
import { getShapeObjectProperties } from "./shape-object-properties.js";
import type { Sheet } from "./workbook.js";

/** Existing source-free objects may be edited while unlocked; insertion still requires Edit objects. */
export function canEditShapeObject(sheet: Sheet, drawing: SheetDrawing): boolean {
  if (!sheet.properties.protected || sheet.protection?.editObjects) return true;
  return isFramedShapeDrawing(drawing) && !getShapeObjectProperties(drawing.shapeProperties).locked;
}

/** Collection commands are atomic. Incoming unlocked flags never authorize a new identity. */
export function canEditSheetDrawingCollection(
  sheet: Sheet,
  values: readonly SheetDrawing[],
): boolean {
  const next = normalizeSheetDrawings(values);
  if (!sheet.properties.protected || sheet.protection?.editObjects) return true;
  const current = normalizeSheetDrawings(sheet.drawings);
  const original = new Map(current.map((drawing) => [drawing.id, drawing]));
  const proposed = new Map(next.map((drawing) => [drawing.id, drawing]));
  if (next.some((drawing) => !original.has(drawing.id))) return false;
  const locked = current.filter((drawing) => !canEditShapeObject(sheet, drawing));
  const lockedIds = new Set(locked.map((drawing) => drawing.id));
  const retained = next.filter((drawing) => lockedIds.has(drawing.id));
  if (
    retained.length !== locked.length ||
    retained.some((drawing, index) => JSON.stringify(drawing) !== JSON.stringify(locked[index]))
  )
    return false;
  for (const drawing of original.values()) {
    const target = proposed.get(drawing.id);
    if (target && JSON.stringify(target) === JSON.stringify(drawing)) continue;
    if (!canEditShapeObject(sheet, drawing)) return false;
    if (target) {
      if (
        !isFramedShapeDrawing(drawing) ||
        !isFramedShapeDrawing(target) ||
        target.kind !== drawing.kind
      )
        return false;
      // Protected unlocked editing cannot alter the lock authorization itself.
      if (
        getShapeObjectProperties(target.shapeProperties).locked !==
        getShapeObjectProperties(drawing.shapeProperties).locked
      )
        return false;
    }
  }
  return true;
}
