import { normalizeFloatingImageForSheet, type FloatingImage } from "@sheetcraft/core/workbook";

export const FLOATING_IMAGE_CLIPBOARD_TYPE = "application/x-sheetcraft-floating-image";
const GROUP_COORDINATE_SPACE = "group-relative-sheet-pixels-v1";
export type FloatingImageTransfer = {
  floatingImage?: FloatingImage;
  floatingImages?: FloatingImage[];
  invalidFloatingImage?: boolean;
};

/** A shared anchor makes relative pixel gaps provable without source sheet metrics. */
export function normalizeClipboardImageGroup(images: readonly FloatingImage[]): FloatingImage[] {
  if (images.length < 2 || images.length > 100) throw new Error("Invalid picture group size.");
  const result = images.map((image) => normalizeFloatingImageForSheet(image));
  const anchor = result[0]!.anchor;
  if (
    new Set(result.map((image) => image.id)).size !== result.length ||
    result.some((image) => image.anchor.row !== anchor.row || image.anchor.column !== anchor.column)
  )
    throw new Error("Picture group requires complete members in one coordinate space.");
  return result.map((image) => ({
    ...image,
    anchor: { row: 0, column: 0 },
  }));
}

export function readFloatingImageTransfer(
  data: Pick<DataTransfer, "getData">,
): FloatingImageTransfer {
  const value = data.getData(FLOATING_IMAGE_CLIPBOARD_TYPE);
  if (!value) return {};
  if (value.length > 2_000_000) return { invalidFloatingImage: true };
  try {
    const { clipboardImages, clipboardCoordinateSpace, ...image } = JSON.parse(value);
    const floatingImage = normalizeFloatingImageForSheet(image as FloatingImage);
    if (clipboardImages === undefined) return { floatingImage };
    if (
      !Array.isArray(clipboardImages) ||
      (clipboardCoordinateSpace !== undefined &&
        clipboardCoordinateSpace !== GROUP_COORDINATE_SPACE)
    )
      throw new Error("Invalid group payload.");
    const floatingImages = normalizeClipboardImageGroup(clipboardImages);
    if (
      !floatingImages.some(
        (member) => member.id === floatingImage.id && member.assetId === floatingImage.assetId,
      )
    )
      throw new Error("The primary picture is missing from the group.");
    return { floatingImage, floatingImages };
  } catch {
    return { invalidFloatingImage: true };
  }
}

export function readFloatingImageClipboard(
  data: Pick<DataTransfer, "getData">,
): FloatingImage | undefined {
  return readFloatingImageTransfer(data).floatingImage;
}

export function readFloatingImageGroup(
  data: Pick<DataTransfer, "getData">,
): FloatingImage[] | undefined {
  return readFloatingImageTransfer(data).floatingImages;
}

export function serializeFloatingImageClipboard(
  image: FloatingImage,
  images?: readonly FloatingImage[],
): string {
  return JSON.stringify(
    images && images.length > 1
      ? {
          ...image,
          clipboardImages: normalizeClipboardImageGroup(images),
          clipboardCoordinateSpace: GROUP_COORDINATE_SPACE,
        }
      : image,
  );
}

export function writeFloatingImageClipboard(
  data: Pick<DataTransfer, "setData">,
  image: FloatingImage,
  images?: readonly FloatingImage[],
): void {
  data.setData(FLOATING_IMAGE_CLIPBOARD_TYPE, serializeFloatingImageClipboard(image, images));
  data.setData("text/plain", image.altText);
}
