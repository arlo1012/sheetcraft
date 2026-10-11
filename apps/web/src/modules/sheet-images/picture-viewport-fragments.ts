import { isFramedPictureObject, type FramedFloatingImage } from "@sheetcraft/core/picture-object";
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

/** Each fragment retains its complete object and its own geometry contract. */
export type PictureViewportFragment =
  | (FloatingImageViewportFragment & { kind: "legacy"; image: LegacyFloatingImage })
  | (FramedPictureViewportFragment & { kind: "framed"; image: FramedFloatingImage });

/** Projects each object in stacking order; a framed bound is never a legacy rect. */
export function getPictureViewportFragments(
  images: readonly FloatingImage[],
  layout: SheetViewportLayout,
  frameContext?: PictureFrameLayoutContext,
): PictureViewportFragment[] {
  if (frameContext && frameContext.layout !== layout)
    throw new TypeError("Picture frame context must use the supplied viewport layout.");
  // Validate the complete collection, including hidden objects, before resolving
  // any fragments. Callers can refuse unsupported state before canvas/resource work.
  if (!frameContext && images.some(isFramedPictureObject))
    throw new TypeError("Framed picture viewport fragments require a frame context.");

  const fragments: PictureViewportFragment[] = [];
  for (const image of images) {
    if (isFramedPictureObject(image)) {
      for (const fragment of getFramedPictureViewportFragments(image, frameContext!))
        fragments.push({ ...fragment, kind: "framed", image });
    } else if (!image.hidden) {
      for (const fragment of getFloatingImageViewportFragments(image, layout))
        fragments.push({ ...fragment, kind: "legacy", image });
    }
  }
  return fragments;
}
