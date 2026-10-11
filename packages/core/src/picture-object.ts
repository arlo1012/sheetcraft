import {
  normalizeFloatingImageForSheet,
  cloneFloatingImage,
  areFloatingImageCollectionsEqual,
  type LegacyFloatingImage,
} from "./workbook.js";
import {
  cloneImageTransform,
  areImageTransformsEqual,
  type ImageTransform,
} from "./image-transform.js";
import {
  clonePictureFrame,
  normalizePictureFrame,
  arePictureFramesEqual,
  type PictureFrame,
} from "./picture-frame.js";

/** Appearance and annotations remain separate from the object's single geometry source. */
export type PictureObjectAppearance = Pick<ImageTransform, "appearance" | "annotations">;
export type FramedFloatingImage = Pick<
  LegacyFloatingImage,
  "id" | "assetId" | "altText" | "hidden" | "groupId" | "lockAspectRatio"
> & {
  frame: PictureFrame;
  transform?: PictureObjectAppearance;
};
/** Consumer preparation contract. Sheet collections and snapshots still store legacy images. */
export type PictureObject = LegacyFloatingImage | FramedFloatingImage;

export function isFramedPictureObject(image: PictureObject): image is FramedFloatingImage {
  return Object.hasOwn(image, "frame");
}

export function normalizePictureObject(image: PictureObject): PictureObject {
  if (!image || typeof image !== "object" || Array.isArray(image))
    throw new TypeError("Invalid picture object.");
  if (!isFramedPictureObject(image)) return normalizeFloatingImageForSheet(image);
  const allowed = new Set([
    "id",
    "assetId",
    "altText",
    "hidden",
    "groupId",
    "lockAspectRatio",
    "frame",
    "transform",
  ]);
  if (Object.keys(image).some((key) => !allowed.has(key)))
    throw new TypeError("Unknown or conflicting framed picture field.");
  if (typeof image.id !== "string" || !image.id.trim())
    throw new TypeError("Picture ID must be non-empty.");
  if (typeof image.assetId !== "string" || !image.assetId.trim())
    throw new TypeError("Picture asset ID must be non-empty.");
  if (typeof image.altText !== "string") throw new TypeError("Picture alt text must be a string.");
  if (image.hidden !== undefined && typeof image.hidden !== "boolean")
    throw new TypeError("Invalid picture visibility.");
  if (image.lockAspectRatio !== undefined && typeof image.lockAspectRatio !== "boolean")
    throw new TypeError("Invalid picture aspect ratio lock.");
  if (image.groupId !== undefined && (typeof image.groupId !== "string" || !image.groupId.trim()))
    throw new TypeError("Invalid picture group.");
  if (
    image.transform !== undefined &&
    (!image.transform ||
      typeof image.transform !== "object" ||
      Array.isArray(image.transform) ||
      Object.keys(image.transform).some((key) => key !== "appearance" && key !== "annotations"))
  )
    throw new TypeError("Framed picture transforms may contain only appearance and annotations.");
  const transform = cloneImageTransform(image.transform);
  return {
    id: image.id,
    assetId: image.assetId,
    altText: image.altText,
    frame: normalizePictureFrame(image.frame),
    ...(transform ? { transform } : {}),
    ...(image.hidden === undefined ? {} : { hidden: image.hidden }),
    ...(image.groupId === undefined ? {} : { groupId: image.groupId }),
    ...(image.lockAspectRatio === undefined ? {} : { lockAspectRatio: image.lockAspectRatio }),
  };
}

export function clonePictureObject<T extends PictureObject>(image: T): T {
  if (!isFramedPictureObject(image)) return cloneFloatingImage(image) as T;
  const normalized = normalizePictureObject(image) as FramedFloatingImage;
  return { ...normalized, frame: clonePictureFrame(normalized.frame) } as T;
}

export function arePictureObjectsEqual(left: PictureObject, right: PictureObject): boolean {
  if (!isFramedPictureObject(left) || !isFramedPictureObject(right))
    return (
      !isFramedPictureObject(left) &&
      !isFramedPictureObject(right) &&
      areFloatingImageCollectionsEqual([left], [right])
    );
  return (
    left.id === right.id &&
    left.assetId === right.assetId &&
    left.altText === right.altText &&
    left.hidden === right.hidden &&
    left.groupId === right.groupId &&
    left.lockAspectRatio === right.lockAspectRatio &&
    arePictureFramesEqual(left.frame, right.frame) &&
    areImageTransformsEqual(left.transform, right.transform)
  );
}

export function normalizePictureObjectCollection(
  images: readonly PictureObject[],
): PictureObject[] {
  if (!Array.isArray(images)) throw new TypeError("Invalid picture collection.");
  const result = images.map(normalizePictureObject);
  if (new Set(result.map((image) => image.id)).size !== result.length)
    throw new TypeError("Duplicate picture IDs.");
  return result;
}
