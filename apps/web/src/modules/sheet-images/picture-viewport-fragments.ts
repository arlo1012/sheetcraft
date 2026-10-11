import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type FramedFloatingImage,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import type { FloatingImage, LegacyFloatingImage } from "@sheetcraft/core/workbook";
import {
  getFloatingImageViewportFragments,
  type FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  getFramedPictureViewportFragments,
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

/** Projects each object in stacking order; a framed bound is never a legacy rect. */
export function getPictureViewportFragments(
  images: readonly StandalonePictureObject[],
  layout: SheetViewportLayout,
  frameContext?: PictureFrameLayoutContext,
): Exclude<PictureViewportFragment, { kind: "group-leaf" }>[];
export function getPictureViewportFragments(
  images: readonly FloatingImage[],
  layout: SheetViewportLayout,
  frameContext?: PictureFrameLayoutContext,
): PictureViewportFragment[];
export function getPictureViewportFragments(
  images: readonly FloatingImage[],
  layout: SheetViewportLayout,
  frameContext?: PictureFrameLayoutContext,
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
      for (const fragment of getOwnedPictureGroupViewportFragments(prepared, frameContext!))
        fragments.push(fragment);
    } else if (isFramedPictureObject(prepared) && isFramedPictureObject(image)) {
      for (const fragment of getFramedPictureViewportFragments(image, frameContext!))
        fragments.push({ ...fragment, kind: "framed", image });
    } else if (!isPictureGroup(image) && !isFramedPictureObject(image) && !image.hidden) {
      for (const fragment of getFloatingImageViewportFragments(image, layout))
        fragments.push({ ...fragment, kind: "legacy", image });
    }
  }
  return fragments;
}
