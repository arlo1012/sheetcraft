import { normalizeFloatingImageForSheet, type FloatingImage } from "@idea10/core/workbook";

export const FLOATING_IMAGE_CLIPBOARD_TYPE = "application/x-idea10-floating-image";

export function readFloatingImageClipboard(
  data: Pick<DataTransfer, "getData">,
): FloatingImage | undefined {
  const value = data.getData(FLOATING_IMAGE_CLIPBOARD_TYPE);
  if (!value || value.length > 20_000) return;
  try {
    return normalizeFloatingImageForSheet(JSON.parse(value) as FloatingImage);
  } catch {
    return;
  }
}

export function writeFloatingImageClipboard(
  data: Pick<DataTransfer, "setData">,
  image: FloatingImage,
): void {
  data.setData(FLOATING_IMAGE_CLIPBOARD_TYPE, JSON.stringify(image));
  data.setData("text/plain", image.altText);
}
