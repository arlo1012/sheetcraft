import { normalizeImageTransform, type ImageTransform } from "@idea10/core/workbook";

export type ImagePresentation = {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  width: number;
  height: number;
  viewBox: string;
  rotationTransform?: string;
  flipTransform?: string;
};

/** Resolves normalized crop, rotation, and flip geometry for a decoded image. */
export function getImagePresentation(
  transform: ImageTransform | undefined,
  naturalWidth: number,
  naturalHeight: number,
): ImagePresentation {
  const normalized = normalizeImageTransform(transform);
  const crop = normalized?.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const rotation = normalized?.rotation ?? 0;
  const flipHorizontal = Boolean(normalized?.flipHorizontal);
  const flipVertical = Boolean(normalized?.flipVertical);
  const cropWidth = naturalWidth * crop.width;
  const cropHeight = naturalHeight * crop.height;
  const rotated = rotation === 90 || rotation === 270;
  const rotationTransform =
    rotation === 90
      ? `translate(${cropHeight} 0) rotate(90)`
      : rotation === 180
        ? `translate(${cropWidth} ${cropHeight}) rotate(180)`
        : rotation === 270
          ? `translate(0 ${cropWidth}) rotate(270)`
          : undefined;
  const flipTransform =
    flipHorizontal && flipVertical
      ? `translate(${cropWidth} ${cropHeight}) scale(-1 -1)`
      : flipHorizontal
        ? `translate(${cropWidth} 0) scale(-1 1)`
        : flipVertical
          ? `translate(0 ${cropHeight}) scale(1 -1)`
          : undefined;
  return {
    cropX: naturalWidth * crop.x,
    cropY: naturalHeight * crop.y,
    cropWidth,
    cropHeight,
    width: rotated ? cropHeight : cropWidth,
    height: rotated ? cropWidth : cropHeight,
    viewBox: rotated ? `0 0 ${cropHeight} ${cropWidth}` : `0 0 ${cropWidth} ${cropHeight}`,
    rotationTransform,
    flipTransform,
  };
}
