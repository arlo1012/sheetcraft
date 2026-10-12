import type { CellImage, FramedCellImage } from "./formula/types.js";
import { normalizeImageTransform } from "./image-transform.js";
import {
  normalizePictureAngle,
  normalizePictureSourceFrame,
  type PictureFrameSize,
  type PictureSourceFrame,
} from "./picture-frame.js";
import { normalizePictureProperties, PICTURE_PROPERTY_KEYS } from "./picture-properties.js";
import { normalizePictureCropShape } from "./shape-presets/contract.js";
import type { PictureCropShape } from "./shape-presets/types.js";
/** Local reference planes retain derived group/axis geometry, not manual size controls. */
export const MAX_CELL_PICTURE_REFERENCE_DIMENSION = 1_000_000_000;

export type { CellImage, FramedCellImage, LegacyCellImage } from "./formula/types.js";

/** Local reference geometry, independent of the owning cell's worksheet address. */
export type CellPictureFrame = {
  kind: "cell-picture-frame-v1";
  size: PictureFrameSize;
  source: PictureSourceFrame;
  angleDeg: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  cropShape?: PictureCropShape;
};

function dataRecord(
  value: unknown,
  keys: readonly string[],
  name: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown or conflicting ${name} field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor)) throw new TypeError(`${name} cannot contain accessors.`);
    result[key] = descriptor.value as unknown;
  }
  return result;
}

/** Existing appearance/annotation normalizers may read fields, so preflight their data tree. */
function assertOrdinaryData(value: unknown): void {
  const active = new WeakSet<object>();
  let count = 0;
  function visit(field: unknown, depth: number): void {
    if (typeof field === "function" || typeof field === "symbol")
      throw new TypeError("Cell picture data cannot contain functions or symbols.");
    if (!field || typeof field !== "object") return;
    if (depth > 32 || ++count > 10000)
      throw new RangeError("Cell picture data exceeds its depth or node budget.");
    if (active.has(field)) throw new TypeError("Cyclic cell picture data.");
    active.add(field);
    const prototype = Object.getPrototypeOf(field);
    const array = Array.isArray(field);
    if (
      array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
    )
      throw new TypeError("Cell picture data must contain ordinary data records and arrays.");
    if (array && field.length > 10000)
      throw new RangeError("Cell picture array exceeds its item budget.");
    const keys = Reflect.ownKeys(field);
    if (array && keys.length !== field.length + 1)
      throw new TypeError("Cell picture arrays must contain dense indexed data.");
    for (const key of keys) {
      if (
        typeof key !== "string" ||
        (array && key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= field.length))
      )
        throw new TypeError("Cell picture data cannot contain symbols or unknown array fields.");
      const descriptor = Object.getOwnPropertyDescriptor(field, key)!;
      if (!("value" in descriptor))
        throw new TypeError("Cell picture data cannot contain accessors.");
      visit(descriptor.value, depth + 1);
    }
    active.delete(field);
  }
  visit(value, 0);
}

/** Detect the discriminant without executing a frame getter. Normalization validates it. */
export function isFramedCellImage(image: CellImage): image is FramedCellImage {
  return !!image && typeof image === "object" && Object.hasOwn(image, "frame");
}

export function normalizeCellPictureFrame(frame: CellPictureFrame): CellPictureFrame {
  const value = dataRecord(
    frame,
    ["kind", "size", "source", "angleDeg", "flipHorizontal", "flipVertical", "cropShape"],
    "cell picture frame",
  );
  if (value.kind !== "cell-picture-frame-v1")
    throw new TypeError("Unknown cell picture frame kind.");
  const size = dataRecord(value.size, ["width", "height"], "cell picture size");
  for (const dimension of [size.width, size.height])
    if (
      typeof dimension !== "number" ||
      !Number.isFinite(dimension) ||
      dimension <= 0 ||
      dimension > MAX_CELL_PICTURE_REFERENCE_DIMENSION
    )
      throw new RangeError(
        "Cell picture reference dimensions must be positive and at most 1 billion pixels.",
      );
  const source = normalizePictureSourceFrame(
    dataRecord(
      value.source,
      ["widthRatio", "heightRatio", "offsetXRatio", "offsetYRatio"],
      "cell picture source frame",
    ) as PictureSourceFrame,
  );
  const angleDeg = normalizePictureAngle(value.angleDeg as number);
  for (const key of ["flipHorizontal", "flipVertical"] as const)
    if (value[key] !== undefined && typeof value[key] !== "boolean")
      throw new TypeError(`Invalid cell picture ${key}.`);
  let shape: PictureCropShape | undefined;
  if (value.cropShape !== undefined) {
    const fields = dataRecord(
      value.cropShape,
      ["preset", "adjustments"],
      "cell picture crop shape",
    );
    assertOrdinaryData(fields);
    // Preserve non-enumerable adjustment fields for the shared strict shape normalizer.
    if (fields.adjustments !== undefined) {
      const adjustments = fields.adjustments;
      if (!adjustments || typeof adjustments !== "object" || Array.isArray(adjustments))
        throw new TypeError("Invalid cell picture shape adjustments.");
      fields.adjustments = dataRecord(
        adjustments,
        Object.getOwnPropertyNames(adjustments),
        "cell picture shape adjustments",
      );
    }
    shape = normalizePictureCropShape(fields as PictureCropShape);
  }
  return {
    kind: "cell-picture-frame-v1",
    size: { width: size.width as number, height: size.height as number },
    source,
    angleDeg,
    ...(value.flipHorizontal ? { flipHorizontal: true } : {}),
    ...(value.flipVertical ? { flipVertical: true } : {}),
    ...(shape ? { cropShape: shape } : {}),
  };
}

export function cloneCellPictureFrame(frame: CellPictureFrame): CellPictureFrame {
  return normalizeCellPictureFrame(frame);
}

export function areCellPictureFramesEqual(
  left: CellPictureFrame,
  right: CellPictureFrame,
): boolean {
  return (
    JSON.stringify(normalizeCellPictureFrame(left)) ===
    JSON.stringify(normalizeCellPictureFrame(right))
  );
}

export function normalizeCellImage(image: CellImage): CellImage {
  if (!image || typeof image !== "object" || Array.isArray(image))
    throw new TypeError("Invalid cell image.");
  if (!isFramedCellImage(image)) {
    if ("frame" in image || "lockAspectRatio" in image)
      throw new TypeError("Cell picture frame and aspect ratio lock require an own local frame.");
    if (
      typeof image.assetId !== "string" ||
      !image.assetId.trim() ||
      typeof image.altText !== "string"
    )
      throw new TypeError("Cell image must have a non-empty asset ID and string alt text.");
    const transform = normalizeImageTransform(image.transform);
    return {
      assetId: image.assetId,
      altText: image.altText,
      ...normalizePictureProperties(image),
      ...(transform ? { transform } : {}),
    };
  }
  const value = dataRecord(
    image,
    ["assetId", "altText", "frame", "transform", "lockAspectRatio", ...PICTURE_PROPERTY_KEYS],
    "framed cell image",
  );
  if (
    typeof value.assetId !== "string" ||
    !value.assetId.trim() ||
    typeof value.altText !== "string"
  )
    throw new TypeError("Cell image must have a non-empty asset ID and string alt text.");
  if (value.lockAspectRatio !== undefined && typeof value.lockAspectRatio !== "boolean")
    throw new TypeError("Invalid cell picture aspect ratio lock.");
  let transform: FramedCellImage["transform"];
  if (value.transform !== undefined) {
    const fields = dataRecord(
      value.transform,
      ["appearance", "annotations"],
      "framed cell image transform",
    );
    assertOrdinaryData(fields);
    transform = normalizeImageTransform(
      fields as FramedCellImage["transform"],
    ) as FramedCellImage["transform"];
  }
  return {
    assetId: value.assetId,
    altText: value.altText,
    ...normalizePictureProperties(value),
    frame: normalizeCellPictureFrame(value.frame as CellPictureFrame),
    ...(transform ? { transform } : {}),
    ...(value.lockAspectRatio === undefined ? {} : { lockAspectRatio: value.lockAspectRatio }),
  };
}

export function cloneCellImage<T extends CellImage>(image: T): T {
  return normalizeCellImage(image) as T;
}

export function areCellImagesEqual(left: CellImage, right: CellImage): boolean {
  return JSON.stringify(normalizeCellImage(left)) === JSON.stringify(normalizeCellImage(right));
}
