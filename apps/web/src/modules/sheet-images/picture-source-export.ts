import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { getDetailedPictureStyleAssetIds } from "@sheetcraft/core/picture-detailed-style";
import {
  assertImagePixelBudget,
  ImageAssetError,
  MAX_IMAGE_PIXELS,
} from "../image-assets/imageAssetValidation";
import { readEncodedImageSource } from "../image-assets/readEncodedImageSource";
import {
  createPictureSourcePresentationCanvas,
  capturePictureSourcePresentation,
  type PictureSourcePresentation,
} from "./picture-source-presentation";
import type { PictureFileFormat } from "./picture-asset-conversion";

/** Save the actual framed leaf, using the worksheet painter and local validated sources. */
export async function exportPictureSourceBlob(
  blob: Blob,
  presentation: PictureSourcePresentation,
  format: PictureFileFormat,
  theme: WorkbookTheme | undefined,
  readAsset: (id: string) => Promise<Blob | undefined>,
  shouldContinue: () => boolean,
): Promise<Blob | undefined> {
  const snapshot = capturePictureSourcePresentation(presentation.picture, presentation.geometry);
  const urls: string[] = [];
  const images: HTMLImageElement[] = [];
  let canvas: HTMLCanvasElement | undefined;
  let decodedPixels = 0;
  async function decode(input: Blob): Promise<HTMLImageElement | undefined> {
    if (!shouldContinue()) return;
    const source = await readEncodedImageSource(input);
    if (!shouldContinue()) return;
    decodedPixels += source.header.width * source.header.height;
    if (decodedPixels > MAX_IMAGE_PIXELS) throw new ImageAssetError("pixel-limit");
    const url = URL.createObjectURL(source.blob);
    urls.push(url);
    const image = new Image();
    images.push(image);
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not decode picture source."));
      image.src = url;
    });
    if (!shouldContinue()) return;
    assertImagePixelBudget(image.naturalWidth, image.naturalHeight);
    return image;
  }
  try {
    const image = await decode(blob);
    if (!image) return;
    const auxiliary = new Map<string, HTMLImageElement>([[snapshot.picture.assetId, image]]);
    for (const id of getDetailedPictureStyleAssetIds(
      snapshot.picture.transform?.appearance?.detailedStyle,
    )) {
      if (auxiliary.has(id)) continue;
      const source = await readAsset(id);
      if (!shouldContinue()) return;
      if (!source) throw new Error("Picture fill source is unavailable.");
      const decoded = await decode(source);
      if (!decoded) return;
      auxiliary.set(id, decoded);
    }
    if (!shouldContinue()) return;
    // Preserve source sampling rather than saving only worksheet display pixels.
    const sourceRect = snapshot.geometry.sourceRect;
    if (!sourceRect) throw new Error("Picture source geometry is unavailable.");
    const density = Math.min(
      64,
      Math.max(image.naturalWidth / sourceRect.width, image.naturalHeight / sourceRect.height),
    );
    canvas = createPictureSourcePresentationCanvas(
      image,
      snapshot,
      theme,
      {
        theme,
        getAssetSize: (id) => {
          const decoded = auxiliary.get(id);
          return decoded
            ? { width: decoded.naturalWidth, height: decoded.naturalHeight }
            : undefined;
        },
        getAssetImage: (id) => auxiliary.get(id),
      },
      4096,
      density,
    );
    if (format === "jpeg") {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Picture rendering is unavailable.");
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    const encoded = await new Promise<Blob>((resolve, reject) =>
      canvas!.toBlob(
        (value) => {
          if (!value?.size || value.type.toLowerCase() !== `image/${format}`)
            reject(new Error("The requested picture format could not be encoded."));
          else resolve(value);
        },
        `image/${format}`,
        0.9,
      ),
    );
    return shouldContinue() ? encoded : undefined;
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    for (const image of images) {
      image.onload = null;
      image.onerror = null;
      image.src = "";
    }
    for (const url of urls) URL.revokeObjectURL(url);
  }
}
