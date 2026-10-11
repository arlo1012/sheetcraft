import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type FramedFloatingImage,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import {
  resolvePictureSourceLayout,
  type ResolvedPictureFrame,
} from "@sheetcraft/core/picture-frame";
import type { GroupedPicture } from "@sheetcraft/core/picture-group";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import type { FloatingImage, LegacyFloatingImage } from "@sheetcraft/core/workbook";
import {
  getFloatingImageViewportFragments,
  type FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  getFramedPictureViewportFragments,
  projectPictureFrameIntoPane,
  getPicturePaneTranslation,
  type FramedPictureViewportFragment,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getOwnedPictureGroupViewportFragments,
  type OwnedPictureGroupViewportFragment,
} from "./picture-owned-group-fragments";

/** Each fragment retains its complete object and its own geometry contract. */
export type PictureViewportFragment =
  | (FloatingImageViewportFragment & { kind: "legacy"; image: LegacyFloatingImage })
  | (FramedPictureViewportFragment & { kind: "framed"; image: FramedFloatingImage })
  | OwnedPictureGroupViewportFragment;

export type PicturePaintBoundsResolver = (
  picture: LegacyFloatingImage | FramedFloatingImage | GroupedPicture,
  geometry: ResolvedPictureFrame,
) => Rect | undefined;
function paintIntersection(bounds: Rect, clip: Rect): Rect | undefined {
  const x = Math.max(bounds.x, clip.x),
    y = Math.max(bounds.y, clip.y);
  const right = Math.min(bounds.x + bounds.width, clip.x + clip.width),
    bottom = Math.min(bounds.y + bounds.height, clip.y + clip.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
}

/** Projects each object in stacking order; a framed bound is never a legacy rect. */
export function getPictureViewportFragments(
  images: readonly StandalonePictureObject[],
  layout: SheetViewportLayout,
  frameContext?: PictureFrameLayoutContext,
  paintBounds?: PicturePaintBoundsResolver,
): Exclude<PictureViewportFragment, { kind: "group-leaf" }>[];
export function getPictureViewportFragments(
  images: readonly FloatingImage[],
  layout: SheetViewportLayout,
  frameContext?: PictureFrameLayoutContext,
  paintBounds?: PicturePaintBoundsResolver,
): PictureViewportFragment[];
export function getPictureViewportFragments(
  images: readonly FloatingImage[],
  layout: SheetViewportLayout,
  frameContext?: PictureFrameLayoutContext,
  paintBounds?: PicturePaintBoundsResolver,
): PictureViewportFragment[] {
  if (frameContext && frameContext.layout !== layout)
    throw new TypeError("Picture frame context must use the supplied viewport layout.");
  // Validate the complete collection, including hidden objects, before resolving
  // any fragments. Callers can refuse unsupported state before canvas/resource work.
  const canonical = normalizePictureObjectCollection(images);
  if (
    !frameContext &&
    canonical.some((image) => isFramedPictureObject(image) || isPictureGroup(image))
  )
    throw new TypeError("Framed picture viewport fragments require a frame context.");

  // Validate every hidden framed root and every complete group tree before a
  // visible legacy root can call into its viewport projection. Forest-wide
  // ownership budgets and ID uniqueness are enforced by the collection normalizer.
  for (const image of canonical) {
    if (isPictureGroup(image)) resolvePictureGroup(image, frameContext!.metrics);
    else if (isFramedPictureObject(image)) resolvePictureFrame(image.frame, frameContext!.metrics);
  }
  const fragments: PictureViewportFragment[] = [];
  for (let index = 0; index < canonical.length; index++) {
    const prepared = canonical[index]!;
    const image = images[index]!;
    if (isPictureGroup(prepared)) {
      for (const fragment of getOwnedPictureGroupViewportFragments(
        prepared,
        frameContext!,
        paintBounds,
      ))
        fragments.push(fragment);
    } else if (isFramedPictureObject(prepared) && isFramedPictureObject(image)) {
      if (paintBounds) {
        const resolved = resolvePictureFrame(image.frame, frameContext!.metrics);
        if (!image.hidden && !resolved.collapsed)
          for (const paneId of ["topLeft", "top", "left", "body"] as const) {
            const geometry = projectPictureFrameIntoPane(resolved, paneId, layout);
            const clippedBounds = paintIntersection(
              paintBounds(image, geometry) ?? geometry.bounds,
              layout.panes[paneId].clip,
            );
            if (clippedBounds)
              fragments.push({ kind: "framed", image, paneId, geometry, clippedBounds });
          }
      } else
        for (const fragment of getFramedPictureViewportFragments(image, frameContext!))
          fragments.push({ ...fragment, kind: "framed", image });
    } else if (!isPictureGroup(image) && !isFramedPictureObject(image) && !image.hidden) {
      if (paintBounds) {
        const sheetRect = getFloatingImageSheetRect(image, layout);
        if (sheetRect && sheetRect.width > 0 && sheetRect.height > 0)
          for (const paneId of ["topLeft", "top", "left", "body"] as const) {
            const delta = getPicturePaneTranslation(paneId, layout),
              rect = { ...sheetRect, x: sheetRect.x + delta.x, y: sheetRect.y + delta.y };
            const geometry = resolvePictureSourceLayout(rect, 0, {
              widthRatio: 1,
              heightRatio: 1,
              offsetXRatio: 0,
              offsetYRatio: 0,
            });
            const clippedRect = paintIntersection(
              paintBounds(image, geometry) ?? rect,
              layout.panes[paneId].clip,
            );
            if (clippedRect) fragments.push({ kind: "legacy", image, paneId, rect, clippedRect });
          }
      } else
        for (const fragment of getFloatingImageViewportFragments(image, layout))
          fragments.push({ ...fragment, kind: "legacy", image });
    }
  }
  return fragments;
}
