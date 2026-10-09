import type { ImageTransform } from "@sheetcraft/core/workbook";
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
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not decode picture."));
      image.src = url;
    });
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
          (value) => (value ? resolve(value) : reject(new Error("Could not encode picture."))),
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
