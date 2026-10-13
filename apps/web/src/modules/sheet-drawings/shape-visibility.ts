import { isSheetDrawingVisible, type SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  isShapeGroupDrawing,
  traverseShapeGroupVisibility,
  isShapeGroupPathVisible,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";

/** Output visibility is separate from canonical geometry, ownership and asset retention. */
export function getVisibleShapeNodeIds(forest: readonly SheetDrawing[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const root of forest) {
    if (isShapeGroupDrawing(root)) {
      for (const visit of traverseShapeGroupVisibility(root)) {
        // Core validates own data descriptors first; this read also tracks reactive visibility.
        void visit.node.hidden;
        if (visit.visible) ids.add(visit.node.id);
      }
    } else {
      const visible = isSheetDrawingVisible(root);
      if (root.kind === "shape" || root.kind === "textBox") void root.hidden;
      if (visible) ids.add(root.id);
    }
  }
  return ids;
}

export function isShapeObjectPathVisible(root: SheetDrawing, path: ShapeGroupPath): boolean {
  return isShapeGroupDrawing(root)
    ? isShapeGroupPathVisible(root, path)
    : path.length === 1 && path[0] === root.id && isSheetDrawingVisible(root);
}
