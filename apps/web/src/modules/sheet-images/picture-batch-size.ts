import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import {
  applyPictureGroupChildWorldEdit,
  leasePictureGroupNode,
} from "@sheetcraft/core/picture-group-edit";
import { normalizePictureObjectCollection } from "@sheetcraft/core/picture-object";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { capturePictureSourceSelection } from "./picture-source-selection";
import { getPictureToolGeometry, resizePictureTo } from "./picture-tool-geometry";
import { resolveOwnedPictureNode } from "./picture-group-interaction";
export type PictureBatchSize = { width: number; height: number; locked: boolean; all: boolean };
function dimensions(width: number, height: number): void {
  if ([width, height].some((size) => !Number.isFinite(size) || size < 1 || size > 10000))
    throw new RangeError("Invalid picture batch dimensions.");
}
/** Explicit All sizes the outer objects; an exact internal selection sizes only that owned node. */
export function planPictureBatchSize(
  values: readonly FloatingImage[],
  selectedIds: readonly string[],
  selectedPath: PictureGroupPath | null | undefined,
  settings: PictureBatchSize,
  context?: PictureFrameLayoutContext,
): FloatingImage[] {
  if (typeof settings.locked !== "boolean" || typeof settings.all !== "boolean")
    throw new TypeError("Invalid picture batch size policy.");
  dimensions(settings.width, settings.locked ? settings.width : settings.height);
  const scope = capturePictureSourceSelection(values, selectedIds, selectedPath, settings.all);
  const roots = normalizePictureObjectCollection(values);
  if (!settings.all && scope.path && scope.path.length > 1) {
    if (!context) throw new TypeError("Owned picture sizing requires current frame geometry.");
    const root = roots.find((root) => root.id === scope.path![0])!;
    if (!isPictureGroup(root)) throw new TypeError("Missing picture owner.");
    const resolved = resolveOwnedPictureNode(roots, scope.path, context),
      layout = resolved?.layout;
    if (!resolved || !layout || layout.collapsed || !resolved.visible)
      throw new RangeError("Expand the picture before resizing.");
    const width = settings.width,
      height = settings.locked ? (layout.rect.height * width) / layout.rect.width : settings.height;
    dimensions(width, height);
    if (width === layout.rect.width && height === layout.rect.height) return roots;
    const halfX = (width - layout.rect.width) / 2,
      halfY = (height - layout.rect.height) / 2,
      angle = (layout.angleDeg * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    const world = resolvePictureLayout(
      {
        x: layout.rect.x + (cos - 1) * halfX - sin * halfY,
        y: layout.rect.y + sin * halfX + (cos - 1) * halfY,
        width,
        height,
      },
      layout.angleDeg,
    );
    const next = applyPictureGroupChildWorldEdit(
      root,
      leasePictureGroupNode(root, scope.path),
      world,
      context.metrics,
    );
    return roots.map((entry) => (entry.id === root.id ? next : entry));
  }
  return normalizePictureObjectCollection(
    roots.map((root) => {
      if (!scope.rootIds.includes(root.id)) return root;
      const geometry = getPictureToolGeometry(root, context);
      if (!geometry) throw new RangeError("Expand the picture before resizing.");
      const width = settings.width,
        height = settings.locked ? (geometry.height * width) / geometry.width : settings.height;
      dimensions(width, height);
      if (width === geometry.width && height === geometry.height) return root;
      // The dialog's ratio policy is temporary, never a change to the object's stored lock.
      const horizontal = resizePictureTo(
        { ...root, lockAspectRatio: false },
        { axis: "width", value: width },
        context,
      );
      if (!horizontal) throw new RangeError("Collapsed picture.");
      const resized = resizePictureTo(horizontal, { axis: "height", value: height }, context);
      if (!resized) throw new RangeError("Collapsed picture.");
      return { ...resized, lockAspectRatio: root.lockAspectRatio };
    }),
  );
}
