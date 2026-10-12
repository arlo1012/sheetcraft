import { readPictureDataArray } from "./picture-data-array.js";
import { getPictureProperties } from "./picture-properties.js";
import { isPictureGroup, traversePictureGroup, MAX_PICTURE_GROUP_NODES } from "./picture-group.js";
import { arePictureObjectsEqual, normalizePictureObjectCollection } from "./picture-object.js";
import type { FloatingImage, Sheet } from "./workbook.js";

/** Pass an actual outer root, never a stored child flag. Other object/cell permissions are unchanged. */
export function canEditPictureRoot(sheet: Sheet, root: FloatingImage): boolean {
  if (!sheet.properties.protected || sheet.protection?.editObjects) return true;
  try {
    return !getPictureProperties(root).locked;
  } catch {
    return false;
  }
}
export function canChangePictureLock(sheet: Sheet): boolean {
  return !sheet.properties.protected || sheet.protection?.editObjects === true;
}
export function canEditPictureSelection(sheet: Sheet, rootIds: readonly string[]): boolean {
  try {
    const ids = readPictureDataArray(
      rootIds,
      "picture permission selection",
      MAX_PICTURE_GROUP_NODES,
    );
    if (!ids.length || new Set(ids).size !== ids.length) return false;
    return ids.every((id) => {
      const root =
        typeof id === "string" ? sheet.floatingImages.find((image) => image.id === id) : undefined;
      return !!root && canEditPictureRoot(sheet, root);
    });
  } catch {
    return false;
  }
}

/**
 * In a protected sheet without Edit objects, only existing unlocked ownership
 * may be changed or released. No new identities, effective lock changes or transfers from
 * a locked owner are admitted. Locked roots remain exact and keep mutual order;
 * editable objects may be arranged around them. One invalid member rejects all.
 */
export function canEditPictureForest(sheet: Sheet, nextValues: readonly FloatingImage[]): boolean {
  if (!sheet.properties.protected || sheet.protection?.editObjects) return true;
  try {
    const before = normalizePictureObjectCollection(sheet.floatingImages);
    const next = normalizePictureObjectCollection(nextValues);
    const owners = new Map<string, FloatingImage>();
    for (const root of before) {
      for (const node of isPictureGroup(root)
        ? traversePictureGroup(root).map((visit) => visit.node)
        : [root])
        owners.set(node.id, root);
    }
    const locked = before.filter((root) => !canEditPictureRoot(sheet, root));
    const lockedIds = new Set(locked.map((root) => root.id));
    const retained = next.filter((root) => lockedIds.has(root.id));
    if (
      retained.length !== locked.length ||
      retained.some((root, index) => !arePictureObjectsEqual(root, locked[index]!))
    )
      return false;
    for (const root of next) {
      if (lockedIds.has(root.id)) continue;
      const owner = owners.get(root.id);
      if (
        !owner ||
        !canEditPictureRoot(sheet, owner) ||
        getPictureProperties(root).locked !== getPictureProperties(owner).locked
      )
        return false;
      for (const node of isPictureGroup(root)
        ? traversePictureGroup(root).map((visit) => visit.node)
        : [root]) {
        const previousOwner = owners.get(node.id);
        if (!previousOwner || !canEditPictureRoot(sheet, previousOwner)) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
