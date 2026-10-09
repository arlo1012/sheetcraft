import { normalizeFloatingImageForSheet, type FloatingImage } from "@sheetcraft/core/workbook";

export const FLOATING_IMAGE_CLIPBOARD_TYPE = "application/x-sheetcraft-floating-image";

export function readFloatingImageClipboard(
  data: Pick<DataTransfer, "getData">,
): FloatingImage | undefined {
  const value = data.getData(FLOATING_IMAGE_CLIPBOARD_TYPE);
  if (!value || value.length > 2_000_000) return;
  try {
    const { clipboardImages: _images, ...image } = JSON.parse(value);
    return normalizeFloatingImageForSheet(image as FloatingImage);
  } catch {
    return;
  }
}

export function writeFloatingImageClipboard(
  data: Pick<DataTransfer, "setData">,
  image: FloatingImage,
  images?: readonly FloatingImage[],
): void {
  data.setData(FLOATING_IMAGE_CLIPBOARD_TYPE, serializeFloatingImageClipboard(image, images));
  data.setData("text/plain", image.altText);
}

export function serializeFloatingImageClipboard(
  image: FloatingImage,
  images?: readonly FloatingImage[],
): string {
  return JSON.stringify(
    images && images.length > 1 ? { ...image, clipboardImages: images } : image,
  );
}
export function readFloatingImageGroup(
  data: Pick<DataTransfer, "getData">,
): FloatingImage[] | undefined {
  const value = data.getData(FLOATING_IMAGE_CLIPBOARD_TYPE);
  if (!value || value.length > 2_000_000) return;
  try {
    const images: unknown = JSON.parse(value).clipboardImages;
    if (!Array.isArray(images) || images.length < 2 || images.length > 100) return;
    const result = images.map((image) => normalizeFloatingImageForSheet(image));
    if (new Set(result.map((image) => image.id)).size !== result.length) return;
    return result;
  } catch {
    return;
  }
}
