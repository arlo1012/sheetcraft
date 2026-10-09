import type { ImageCrop } from "@sheetcraft/core/workbook";
import type { FloatingImageResizeDirection } from "./floating-image-layout.js";

export type ImageCropGesture = "move" | FloatingImageResizeDirection;

/** Adjusts a crop in displayed-image coordinates without moving outside its frame. */
export function adjustImageCropSelection(
  crop: ImageCrop,
  direction: ImageCropGesture,
  delta: { x: number; y: number },
  minimum: { width: number; height: number },
): ImageCrop {
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  if (direction === "move") {
    return {
      ...crop,
      x: clamp(crop.x + delta.x, 0, 1 - crop.width),
      y: clamp(crop.y + delta.y, 0, 1 - crop.height),
    };
  }
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;
  const minWidth = Math.min(crop.width, minimum.width);
  const minHeight = Math.min(crop.height, minimum.height);
  if (direction.includes("w")) left = clamp(left + delta.x, 0, right - minWidth);
  if (direction.includes("e")) right = clamp(right + delta.x, left + minWidth, 1);
  if (direction.includes("n")) top = clamp(top + delta.y, 0, bottom - minHeight);
  if (direction.includes("s")) bottom = clamp(bottom + delta.y, top + minHeight, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
