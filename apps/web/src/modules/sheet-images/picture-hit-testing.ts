import {
  getPictureCropShapeWorldBounds,
  pictureCropShapeContainsPoint,
} from "./picture-crop-shape";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isGroupedPicture } from "@sheetcraft/core/picture-group";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getPictureViewportFragments,
  type PictureViewportFragment,
} from "./picture-viewport-fragments";

export function pictureFragmentRootId(fragment: PictureViewportFragment): string {
  return fragment.kind === "group-leaf" ? fragment.rootId : fragment.image.id;
}

/** Actual source-bearing hit in global stacking order. Container boxes are not invisible hit shields. */
export function hitPictureViewportPoint(
  roots: readonly FloatingImage[],
  point: Point,
  layout: SheetViewportLayout,
  frameContext?: PictureFrameLayoutContext,
): PictureViewportFragment | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError("Picture hit coordinates must be finite.");
  const fragments = getPictureViewportFragments(roots, layout, frameContext, (picture, geometry) =>
    isGroupedPicture(picture) || isFramedPictureObject(picture)
      ? getPictureCropShapeWorldBounds(picture, geometry)
      : undefined,
  );
  for (let index = fragments.length - 1; index >= 0; index--) {
    const fragment = fragments[index]!;
    const clip = layout.panes[fragment.paneId].clip;
    if (
      point.x < clip.x ||
      point.x >= clip.x + clip.width ||
      point.y < clip.y ||
      point.y >= clip.y + clip.height
    )
      continue;
    const rect = fragment.kind === "legacy" ? fragment.clippedRect : fragment.clippedBounds;
    if (
      point.x < rect.x ||
      point.x >= rect.x + rect.width ||
      point.y < rect.y ||
      point.y >= rect.y + rect.height
    )
      continue;
    if (
      fragment.kind === "legacy" ||
      pictureCropShapeContainsPoint(fragment.image, fragment.geometry, point)
    )
      return fragment;
  }
  return null;
}
