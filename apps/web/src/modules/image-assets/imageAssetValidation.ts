export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Product limits, not a guarantee of browser or aggregate animation memory use. */
export const MAX_IMAGE_PIXELS = 32 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 16384;

export class ImageAssetError extends Error {
  constructor(
    readonly code:
      | "unsupported-type"
      | "too-large"
      | "pixel-limit"
      | "invalid-image"
      | "decode-failed",
  ) {
    super(`Image asset: ${code}`);
    this.name = "ImageAssetError";
  }
}
export type ImageDimensions = { width: number; height: number };
export function assertImagePixelBudget(width: number, height: number): ImageDimensions {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw new ImageAssetError("invalid-image");
  if (
    width > MAX_IMAGE_SIDE ||
    height > MAX_IMAGE_SIDE ||
    width > Math.floor(MAX_IMAGE_PIXELS / height)
  )
    throw new ImageAssetError("pixel-limit");
  return { width, height };
}
