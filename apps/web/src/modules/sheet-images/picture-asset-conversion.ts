import type { ImageTransform } from "@sheetcraft/core/workbook";
import { readEncodedImageSource } from "../image-assets/readEncodedImageSource";
import { assertImagePixelBudget } from "../image-assets/imageAssetValidation";
import { createPictureCanvas } from "../../shared/images/imageAppearance";
export type PictureFileFormat = "png" | "jpeg" | "webp";
export type PictureCompression = {
  maxSide: number;
  quality: number;
  format: "jpeg" | "webp";
  all: boolean;
};

export async function convertPictureBlob(
  blob: Blob,
  transform: ImageTransform | undefined,
  format: PictureFileFormat,
  maxSide = 4096,
  quality = 0.9,
): Promise<Blob> {
  const source = await readEncodedImageSource(blob);
  const url = URL.createObjectURL(source.blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not decode picture."));
      image.src = url;
    });
    assertImagePixelBudget(image.naturalWidth, image.naturalHeight);
    const canvas = createPictureCanvas(image, transform, maxSide);
    try {
      if (format === "jpeg") {
        const context = canvas.getContext("2d")!;
        context.globalCompositeOperation = "destination-over";
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => {
            if (!value?.size || value.type.toLowerCase() !== `image/${format}`)
              reject(new Error("The requested picture format could not be encoded."));
            else resolve(value);
          },
          `image/${format}`,
          quality,
        ),
      );
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
