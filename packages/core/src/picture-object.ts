import {
  normalizePictureProperties,
  arePicturePropertiesEqual,
  PICTURE_PROPERTY_KEYS,
} from "./picture-properties.js";
import { readPictureDataArray } from "./picture-data-array.js";
import {
  isPictureGroup,
  normalizePictureGroup,
  normalizePictureGroupCollection,
  clonePictureGroup,
  arePictureGroupsEqual,
  traversePictureGroup,
  MAX_PICTURE_GROUP_NODES,
  type PictureGroup,
} from "./picture-group.js";
import {
  normalizeLegacyFloatingImageForSheet,
  cloneLegacyFloatingImage,
  areLegacyFloatingImagesEqual,
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
export type PictureObjectAppearance = Pick<ImageTransform, "appearance" | "annotations"> & {
  crop?: never;
  rotation?: never;
  flipHorizontal?: never;
  flipVertical?: never;
};
export type FramedFloatingImage = Pick<
  LegacyFloatingImage,
  | "id"
  | "assetId"
  | "altText"
  | "hidden"
  | "groupId"
  | "lockAspectRatio"
  | "altTitle"
  | "locked"
  | "printObject"
> & {
  frame: PictureFrame;
  anchor?: never;
  offsetX?: never;
  offsetY?: never;
  width?: never;
  height?: never;
  transform?: PictureObjectAppearance;
};
/** Internal picture union; view consumers must declare framed-picture support. */
export type StandalonePictureObject = LegacyFloatingImage | FramedFloatingImage;
export type PictureObject = StandalonePictureObject | PictureGroup;

export function isFramedPictureObject(image: PictureObject): image is FramedFloatingImage {
  return !isPictureGroup(image) && Object.hasOwn(image, "frame");
}

export function isLegacyPictureObject(image: PictureObject): image is LegacyFloatingImage {
  return !isPictureGroup(image) && !isFramedPictureObject(image);
}

export function normalizePictureObject(image: PictureObject): PictureObject {
  if (!image || typeof image !== "object" || Array.isArray(image))
    throw new TypeError("Invalid picture object.");
  if (isPictureGroup(image)) return normalizePictureGroup(image);
  if (!isFramedPictureObject(image)) return normalizeLegacyFloatingImageForSheet(image);
  const allowed = new Set([
    ...PICTURE_PROPERTY_KEYS,
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
  const cloned = cloneImageTransform(image.transform);
  const transform: PictureObjectAppearance | undefined = cloned
    ? {
        ...(cloned.appearance ? { appearance: cloned.appearance } : {}),
        ...(cloned.annotations ? { annotations: cloned.annotations } : {}),
      }
    : undefined;
  return {
    id: image.id,
    assetId: image.assetId,
    altText: image.altText,
    ...normalizePictureProperties(image),
    frame: normalizePictureFrame(image.frame),
    ...(transform ? { transform } : {}),
    ...(image.hidden === undefined ? {} : { hidden: image.hidden }),
    ...(image.groupId === undefined ? {} : { groupId: image.groupId }),
    ...(image.lockAspectRatio === undefined ? {} : { lockAspectRatio: image.lockAspectRatio }),
  };
}

export function clonePictureObject<T extends PictureObject>(image: T): T {
  if (isPictureGroup(image)) return clonePictureGroup(image) as T;
  if (!isFramedPictureObject(image)) return cloneLegacyFloatingImage(image) as T;
  const normalized = normalizePictureObject(image) as FramedFloatingImage;
  return { ...normalized, frame: clonePictureFrame(normalized.frame) } as T;
}

export function arePictureObjectsEqual(left: PictureObject, right: PictureObject): boolean {
  if (isPictureGroup(left) || isPictureGroup(right))
    return isPictureGroup(left) && isPictureGroup(right) && arePictureGroupsEqual(left, right);
  if (!isFramedPictureObject(left) || !isFramedPictureObject(right))
    return (
      !isFramedPictureObject(left) &&
      !isFramedPictureObject(right) &&
      areLegacyFloatingImagesEqual(left, right)
    );
  return (
    left.id === right.id &&
    left.assetId === right.assetId &&
    left.altText === right.altText &&
    arePicturePropertiesEqual(left, right) &&
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
  const roots = readPictureDataArray(images, "picture collection", MAX_PICTURE_GROUP_NODES);
  // A forest-wide preflight bounds group ownership before any recursive clone.
  const groups = normalizePictureGroupCollection(roots.filter(isPictureGroup));
  let groupIndex = 0;
  const result = roots.map((image) =>
    isPictureGroup(image) ? groups[groupIndex++]! : normalizePictureObject(image),
  );
  const ids = new Set<string>();
  for (const image of result) {
    const nodes = isPictureGroup(image)
      ? traversePictureGroup(image).map((entry) => entry.node)
      : [image];
    for (const node of nodes) {
      if (ids.has(node.id))
        throw new TypeError("Duplicate picture IDs across the ownership forest.");
      ids.add(node.id);
      if (ids.size > MAX_PICTURE_GROUP_NODES) throw new RangeError("Picture node budget exceeded.");
    }
  }
  return result;
}
