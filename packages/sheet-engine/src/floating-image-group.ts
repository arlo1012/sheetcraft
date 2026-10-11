import { isLegacyPictureObject } from "@sheetcraft/core/picture-object";
import {
  MAX_FLOATING_IMAGE_SIZE,
  MIN_FLOATING_IMAGE_SIZE,
  cloneFloatingImage,
  normalizeImageTransform,
  type FloatingImage,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
  resizeFloatingImageBy,
  type FloatingImageResizeDirection,
} from "./floating-image-layout.js";
import { flipFloatingImage } from "./floating-image-transform.js";
import type { SheetViewportLayout } from "./viewport-layout.js";
import type { Rect } from "./geometry.js";

function members(images: readonly FloatingImage[], layout: SheetViewportLayout) {
  if (images.some((image) => !isLegacyPictureObject(image))) return null;
  const entries = (images as readonly LegacyFloatingImage[]).map((image) => ({
    image,
    rect: getFloatingImageSheetRect(image, layout),
  }));
  if (!entries.length || entries.some((entry) => !entry.rect)) return null;
  return entries as Array<{ image: LegacyFloatingImage; rect: Rect }>;
}
function bounds(entries: Array<{ rect: Rect }>): Rect {
  const x = Math.min(...entries.map(({ rect }) => rect.x));
  const y = Math.min(...entries.map(({ rect }) => rect.y));
  return {
    x,
    y,
    width: Math.max(...entries.map(({ rect }) => rect.x + rect.width)) - x,
    height: Math.max(...entries.map(({ rect }) => rect.y + rect.height)) - y,
  };
}
/** Capture every selected member in one group-relative sheet-pixel coordinate space. */
export function captureFloatingImageGroup(
  images: readonly FloatingImage[],
  layout: SheetViewportLayout,
): LegacyFloatingImage[] | null {
  if (images.length > 100 || new Set(images.map((image) => image.id)).size !== images.length)
    return null;
  const entries = members(images, layout);
  if (!entries) return null;
  const box = bounds(entries);
  return entries.map(({ image, rect }) => ({
    ...cloneFloatingImage(image),
    anchor: { row: 0, column: 0 },
    offsetX: rect.x - box.x,
    offsetY: rect.y - box.y,
  }));
}
function place(
  entries: Array<{ image: LegacyFloatingImage; rect: Rect }>,
  layout: SheetViewportLayout,
): LegacyFloatingImage[] | null {
  const box = bounds(entries);
  const dx = Math.max(0, -box.x);
  const dy = Math.max(0, -box.y);
  const next = entries.map(({ image, rect }) =>
    reanchorFloatingImageAtSheetRect(image, { ...rect, x: rect.x + dx, y: rect.y + dy }, layout),
  );
  return next.every((image) => image !== null) ? next : null;
}
/** Rotates the complete selection around its shared center, preserving relative positions. */
export function rotateFloatingImages(
  images: readonly FloatingImage[],
  turns: -1 | 1 | 2,
  layout: SheetViewportLayout,
): LegacyFloatingImage[] | null {
  const entries = members(images, layout);
  if (!entries) return null;
  const box = bounds(entries);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return place(
    entries.map(({ image, rect }) => {
      const dx = rect.x + rect.width / 2 - cx;
      const dy = rect.y + rect.height / 2 - cy;
      const width = turns === 2 ? rect.width : rect.height;
      const height = turns === 2 ? rect.height : rect.width;
      const rotation = (((((image.transform?.rotation ?? 0) + turns * 90) % 360) + 360) % 360) as
        | 0
        | 90
        | 180
        | 270;
      return {
        image: { ...image, transform: normalizeImageTransform({ ...image.transform, rotation }) },
        rect: {
          x: cx + (turns === 1 ? -dy : turns === -1 ? dy : -dx) - width / 2,
          y: cy + (turns === 1 ? dx : turns === -1 ? -dx : -dy) - height / 2,
          width,
          height,
        },
      };
    }),
    layout,
  );
}
export function flipFloatingImages(
  images: readonly FloatingImage[],
  axis: "horizontal" | "vertical",
  layout: SheetViewportLayout,
): LegacyFloatingImage[] | null {
  const entries = members(images, layout);
  if (!entries) return null;
  const box = bounds(entries);
  return place(
    entries.map(({ image, rect }) => ({
      image: flipFloatingImage(image, axis),
      rect: {
        ...rect,
        x: axis === "horizontal" ? box.x * 2 + box.width - rect.x - rect.width : rect.x,
        y: axis === "vertical" ? box.y * 2 + box.height - rect.y - rect.height : rect.y,
      },
    })),
    layout,
  );
}
/** Group resizing always preserves the group's proportions and the members' spacing. */
export function resizeFloatingImagesBy(
  images: readonly FloatingImage[],
  direction: FloatingImageResizeDirection,
  delta: { x: number; y: number },
  layout: SheetViewportLayout,
): LegacyFloatingImage[] | null {
  const entries = members(images, layout);
  if (!entries) return null;
  const box = bounds(entries);
  const proxy = reanchorFloatingImageAtSheetRect(entries[0]!.image, box, layout);
  if (!proxy) return null;
  const minScale = Math.max(
    ...entries.flatMap(({ rect }) => [
      MIN_FLOATING_IMAGE_SIZE / rect.width,
      MIN_FLOATING_IMAGE_SIZE / rect.height,
    ]),
  );
  const maxScale = Math.min(
    ...entries.flatMap(({ rect }) => [
      MAX_FLOATING_IMAGE_SIZE / rect.width,
      MAX_FLOATING_IMAGE_SIZE / rect.height,
    ]),
  );
  const resized = resizeFloatingImageBy(proxy, direction, delta, layout, {
    preserveAspectRatio: true,
    minSize: Math.min(box.width, box.height) * minScale,
    maxSize: Math.max(box.width, box.height) * maxScale,
  });
  const next = resized && getFloatingImageSheetRect(resized, layout);
  if (!next) return null;
  const scale = next.width / box.width;
  return place(
    entries.map(({ image, rect }) => ({
      image,
      rect: {
        x: next.x + (rect.x - box.x) * scale,
        y: next.y + (rect.y - box.y) * scale,
        width: rect.width * scale,
        height: rect.height * scale,
      },
    })),
    layout,
  );
}
