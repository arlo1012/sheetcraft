import type { ImageTransform } from "@idea10/core/workbook";
import { getImagePresentation } from "../../shared/images/imagePresentation";

/** Maps a point in the displayed picture back into original, uncropped image coordinates. */
export function pictureAnnotationPoint(
  point: { x: number; y: number },
  transform: ImageTransform | undefined,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const geometry = getImagePresentation(transform, width, height);
  const displayedY = point.y * (transform?.appearance?.reflection ? 1.25 : 1);
  if (point.x < 0 || point.x > 1 || displayedY < 0 || displayedY > 1) return null;
  const px = point.x * geometry.width;
  const py = displayedY * geometry.height;
  const rotation = transform?.rotation ?? 0;
  let x =
    rotation === 90
      ? py
      : rotation === 180
        ? geometry.cropWidth - px
        : rotation === 270
          ? geometry.cropWidth - py
          : px;
  let y =
    rotation === 90
      ? geometry.cropHeight - px
      : rotation === 180
        ? geometry.cropHeight - py
        : rotation === 270
          ? px
          : py;
  if (transform?.flipHorizontal) x = geometry.cropWidth - x;
  if (transform?.flipVertical) y = geometry.cropHeight - y;
  return {
    x: Math.max(0, Math.min(1, (geometry.cropX + x) / width)),
    y: Math.max(0, Math.min(1, (geometry.cropY + y) / height)),
  };
}
