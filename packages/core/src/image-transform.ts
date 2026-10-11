import { normalizeImageAnnotations, type ImageAnnotation } from "./image-annotations.js";
export {
  normalizeImageAnnotations,
  type ImageAnnotation,
  type ImageAnnotationPoint,
} from "./image-annotations.js";
import { normalizeImageAppearance, type ImageAppearance } from "./image-appearance.js";
export {
  normalizeImageAppearance,
  type ImageAppearance,
  type ImageThemeEffectSuppression,
} from "./image-appearance.js";
export type ImageCrop = { x: number; y: number; width: number; height: number };
export type ImageTransform = {
  annotations?: ImageAnnotation[];
  appearance?: ImageAppearance;
  crop?: ImageCrop;
  rotation?: 0 | 90 | 180 | 270;
  /** Mirror the cropped source horizontally before applying rotation. */
  flipHorizontal?: boolean;
  /** Mirror the cropped source vertically before applying rotation. */
  flipVertical?: boolean;
};

function isFullCrop(crop: ImageCrop): boolean {
  return crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
}

export function normalizeImageTransform(
  transform: ImageTransform | null | undefined,
): ImageTransform | undefined {
  if (transform === null || transform === undefined) return undefined;
  if (!transform || typeof transform !== "object") throw new TypeError("Invalid image transform.");
  let crop: ImageCrop | undefined;
  if (transform.crop !== undefined) {
    const value = transform.crop;
    if (
      !value ||
      typeof value !== "object" ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      !Number.isFinite(value.width) ||
      !Number.isFinite(value.height) ||
      value.x < 0 ||
      value.y < 0 ||
      value.width <= 0 ||
      value.height <= 0 ||
      value.x + value.width > 1 ||
      value.y + value.height > 1
    ) {
      throw new TypeError("Image crop must be a finite normalized rectangle.");
    }
    const normalized = {
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
    };
    if (!isFullCrop(normalized)) crop = normalized;
  }
  const rotation = transform.rotation;
  if (
    rotation !== undefined &&
    rotation !== 0 &&
    rotation !== 90 &&
    rotation !== 180 &&
    rotation !== 270
  ) {
    throw new TypeError("Image rotation must be 0, 90, 180, or 270 degrees.");
  }
  if (transform.flipHorizontal !== undefined && typeof transform.flipHorizontal !== "boolean") {
    throw new TypeError("Image horizontal flip must be a boolean.");
  }
  if (transform.flipVertical !== undefined && typeof transform.flipVertical !== "boolean") {
    throw new TypeError("Image vertical flip must be a boolean.");
  }
  const annotations = normalizeImageAnnotations(transform.annotations);
  const appearance = normalizeImageAppearance(transform.appearance);
  return crop ||
    rotation ||
    transform.flipHorizontal ||
    transform.flipVertical ||
    appearance ||
    annotations
    ? {
        ...(annotations ? { annotations } : {}),
        ...(appearance ? { appearance } : {}),
        ...(crop ? { crop } : {}),
        ...(rotation ? { rotation } : {}),
        ...(transform.flipHorizontal ? { flipHorizontal: true } : {}),
        ...(transform.flipVertical ? { flipVertical: true } : {}),
      }
    : undefined;
}

export function cloneImageTransform(
  transform: ImageTransform | null | undefined,
): ImageTransform | undefined {
  const normalized = normalizeImageTransform(transform);
  return normalized
    ? {
        ...normalized,
        ...(normalized.crop ? { crop: { ...normalized.crop } } : {}),
      }
    : undefined;
}

export function areImageTransformsEqual(
  left: ImageTransform | null | undefined,
  right: ImageTransform | null | undefined,
): boolean {
  const a = normalizeImageTransform(left);
  const b = normalizeImageTransform(right);
  return (
    JSON.stringify(a?.annotations) === JSON.stringify(b?.annotations) &&
    JSON.stringify(a?.appearance) === JSON.stringify(b?.appearance) &&
    a?.rotation === b?.rotation &&
    a?.flipHorizontal === b?.flipHorizontal &&
    a?.flipVertical === b?.flipVertical &&
    a?.crop?.x === b?.crop?.x &&
    a?.crop?.y === b?.crop?.y &&
    a?.crop?.width === b?.crop?.width &&
    a?.crop?.height === b?.crop?.height
  );
}
