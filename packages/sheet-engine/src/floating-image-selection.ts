import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import {
  cloneFloatingImage,
  MAX_FLOATING_IMAGE_SIZE,
  type FloatingImage,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
  resizeFloatingImageBy,
  type FloatingImageResizeDirection,
} from "./floating-image-layout.js";
import type { SheetViewportLayout } from "./viewport-layout.js";

/** Resize a temporary selection around each member's own opposite edge/corner. */
export function resizeFloatingImageSelectionBy(
  images: readonly FloatingImage[],
  activeId: string,
  direction: FloatingImageResizeDirection,
  delta: { x: number; y: number },
  layout: SheetViewportLayout,
  minActiveSize = 24,
): LegacyFloatingImage[] | null {
  if (!["n", "s", "e", "w", "nw", "ne", "sw", "se"].includes(direction))
    throw new TypeError("Invalid image selection resize handle.");
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    throw new RangeError("Image resize delta must be finite.");
  if (
    !Number.isFinite(minActiveSize) ||
    minActiveSize < 1 ||
    minActiveSize > MAX_FLOATING_IMAGE_SIZE
  )
    throw new RangeError("Invalid image selection resize minimum.");
  if (!images.length || new Set(images.map((image) => image.id)).size !== images.length)
    return null;
  if (images.some(isFramedPictureObject)) return null;
  const legacy = images as readonly LegacyFloatingImage[];
  const active = legacy.find((image) => image.id === activeId);
  if (!active) return null;
  const entries = legacy.map((image) => ({
    image,
    rect: getFloatingImageSheetRect(image, layout),
  }));
  if (entries.some((entry) => !entry.rect)) return null;
  if (delta.x === 0 && delta.y === 0) return [...legacy];
  if (
    ((direction === "e" || direction === "w") && delta.x === 0) ||
    ((direction === "n" || direction === "s") && delta.y === 0)
  )
    return [...legacy];
  const corner = direction.length === 2;
  const locked = corner && (active.lockAspectRatio ?? true);
  const resized = resizeFloatingImageBy(active, direction, delta, layout, {
    minSize: minActiveSize,
    maxSize: MAX_FLOATING_IMAGE_SIZE,
    preserveAspectRatio: locked,
  });
  if (!resized) return null;
  const west = direction.includes("w"),
    north = direction.includes("n");
  const changesWidth = corner || direction === "e" || direction === "w";
  const changesHeight = corner || direction === "n" || direction === "s";
  const range = (axis: "width" | "height") => {
    const lower = Math.max(
      ...entries.map(
        ({ image, rect }) => (image.id === activeId ? minActiveSize : 1) / rect![axis],
      ),
    );
    const upper = Math.min(
      ...entries.map(({ rect }) =>
        Math.min(
          MAX_FLOATING_IMAGE_SIZE / rect![axis],
          axis === "width" && west ? (rect!.x + rect!.width) / rect!.width : Infinity,
          axis === "height" && north ? (rect!.y + rect!.height) / rect!.height : Infinity,
        ),
      ),
    );
    // The worksheet origin can impose a tighter bound than a UI minimum.
    return { lower: Math.min(lower, upper), upper };
  };
  const rx = range("width"),
    ry = range("height");
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  let scaleX = resized.width / active.width,
    scaleY = resized.height / active.height;
  if (locked) {
    const upper = Math.min(rx.upper, ry.upper);
    scaleX = scaleY = clamp(scaleX, Math.min(Math.max(rx.lower, ry.lower), upper), upper);
  } else {
    scaleX = changesWidth ? clamp(scaleX, rx.lower, rx.upper) : 1;
    scaleY = changesHeight ? clamp(scaleY, ry.lower, ry.upper) : 1;
  }
  if (scaleX === 1 && scaleY === 1) return [...legacy];
  const next = entries.map(({ image, rect }) => {
    const width = Math.min(MAX_FLOATING_IMAGE_SIZE, Math.max(1, rect!.width * scaleX));
    const height = Math.min(MAX_FLOATING_IMAGE_SIZE, Math.max(1, rect!.height * scaleY));
    return reanchorFloatingImageAtSheetRect(
      cloneFloatingImage(image),
      {
        x: rect!.x + (west ? rect!.width - width : 0),
        y: rect!.y + (north ? rect!.height - height : 0),
        width,
        height,
      },
      layout,
    );
  });
  return next.every((image) => image !== null) ? next : null;
}
