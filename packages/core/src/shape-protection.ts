import {
  hasShapeObjectFrame,
  normalizeSheetDrawings,
  type SheetDrawing,
} from "./sheet-drawings.js";
import { getShapeObjectProperties } from "./shape-object-properties.js";
import { isShapeGroupDrawing, traverseShapeGroup, type ShapeGroupNode } from "./shape-group.js";
import type { Sheet } from "./workbook.js";

/** Existing source-free objects may be edited while unlocked; insertion still requires Edit objects. */
export function canEditShapeObject(sheet: Sheet, drawing: SheetDrawing): boolean {
  if (!sheet.properties.protected || sheet.protection?.editObjects) return true;
  return hasShapeObjectFrame(drawing) && !getShapeObjectProperties(drawing.shapeProperties).locked;
}

type OwnedDrawing = { node: SheetDrawing | ShapeGroupNode; root: SheetDrawing };
function ownership(values: readonly SheetDrawing[]): Map<string, OwnedDrawing> {
  const result = new Map<string, OwnedDrawing>();
  for (const root of values) {
    if (isShapeGroupDrawing(root)) {
      for (const { node } of traverseShapeGroup(root)) result.set(node.id, { node, root });
    } else result.set(root.id, { node: root, root });
  }
  return result;
}

/** Collection commands are atomic. Incoming unlocked flags never authorize a new identity. */
export function canEditSheetDrawingCollection(
  sheet: Sheet,
  values: readonly SheetDrawing[],
): boolean {
  const next = normalizeSheetDrawings(values);
  if (!sheet.properties.protected || sheet.protection?.editObjects) return true;
  const current = normalizeSheetDrawings(sheet.drawings);
  const original = ownership(current);
  const proposed = ownership(next);
  if ([...proposed.keys()].some((id) => !original.has(id))) return false;
  const locked = current.filter((drawing) => !canEditShapeObject(sheet, drawing));
  const lockedIds = new Set(locked.map((drawing) => drawing.id));
  const retained = next.filter((drawing) => lockedIds.has(drawing.id));
  if (
    retained.length !== locked.length ||
    retained.some((drawing, index) => JSON.stringify(drawing) !== JSON.stringify(locked[index]))
  )
    return false;
  for (const { node: drawing, root } of original.values()) {
    const target = proposed.get(drawing.id);
    if (
      target &&
      JSON.stringify(target.node) === JSON.stringify(drawing) &&
      target.root.id === root.id
    )
      continue;
    if (!canEditShapeObject(sheet, root)) return false;
    if (target) {
      if (
        !hasShapeObjectFrame(root) ||
        !hasShapeObjectFrame(target.root) ||
        target.node.kind !== drawing.kind
      )
        return false;
      // Authorization follows the actual outer owner, including promoted descendants.
      if (
        getShapeObjectProperties(target.root.shapeProperties).locked !==
        getShapeObjectProperties(root.shapeProperties).locked
      )
        return false;
    }
  }
  return true;
}
