import {
  normalizePictureFrame,
  normalizePictureAngle,
  type PictureFrame,
  type PictureFrameSize,
  type PictureSourceFrame,
} from "@sheetcraft/core/picture-frame";

const PERCENT = 100_000;
const TURN = 21_600_000;
const ANGLE_UNIT = 60_000;
export type NativePictureGeometry = {
  crop: { left: number; top: number; right: number; bottom: number };
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
};

/** OOXML integers mean 1/1000 percent; a percent suffix has a different unit. */
export function parseNativeCropPercentage(text: string): number {
  if (typeof text !== "string") throw new RangeError("Invalid picture crop percentage.");
  const percent = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$/.test(text);
  if (!percent && !/^[+-]?\d+$/.test(text))
    throw new RangeError("Invalid picture crop percentage.");
  const value = percent ? Number(text.slice(0, -1)) * 1000 : Number(text);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value >= PERCENT ||
    (value === 0 && /[1-9]/.test(text))
  )
    throw new RangeError("Negative picture crop/padding is not yet supported.");
  return value === 0 ? 0 : value;
}

export function parseNativeRotation(text: string): number {
  if (typeof text !== "string") throw new RangeError("Invalid picture rotation.");
  if (!/^[+-]?\d+$/.test(text)) throw new RangeError("Invalid picture rotation.");
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647)
    throw new RangeError("Picture rotation exceeds DrawingML angle range.");
  return ((value % TURN) + TURN) % TURN;
}

// A one-sided Core resize can represent a mathematical zero numerator as a tiny
// negative after ratio/offset division and subtraction. Repair only that arithmetic
// roundoff, scaled to the operands; this is not a crop/pixel or padding tolerance.
function containedCropEdge(ratio: number, signedDoubleOffset: number): number {
  const numerator = ratio - 1 + signedDoubleOffset;
  const roundoff = 2 * Number.EPSILON * (Math.abs(ratio) + 1 + Math.abs(signedDoubleOffset));
  return (numerator < 0 && numerator >= -roundoff ? 0 : numerator) / (2 * ratio);
}

function cropFractions(source: PictureSourceFrame): NativePictureGeometry["crop"] {
  const { widthRatio: sw, heightRatio: sh, offsetXRatio: ox, offsetYRatio: oy } = source;
  return {
    left: containedCropEdge(sw, -2 * ox),
    right: containedCropEdge(sw, 2 * ox),
    top: containedCropEdge(sh, -2 * oy),
    bottom: containedCropEdge(sh, 2 * oy),
  };
}

function validateCrop(crop: NativePictureGeometry["crop"], unit: number): void {
  if (
    Object.values(crop).some((value) => !Number.isFinite(value) || value < 0 || value >= unit) ||
    crop.left + crop.right >= unit ||
    crop.top + crop.bottom >= unit
  )
    throw new RangeError(
      "Picture crop requires a positive contained source window; padding is unsupported.",
    );
}

/** Core flips source pixels in place; DrawingML flips the crop window with the shape. */
export function encodeNativePictureGeometry(value: PictureFrame): NativePictureGeometry {
  const frame = normalizePictureFrame(value);
  if (frame.cropShape !== undefined)
    throw new RangeError("Only rectangular picture crops are supported.");
  const fractions = cropFractions(frame.source);
  validateCrop(fractions, 1);
  const crop = {
    left: Math.round(fractions.left * PERCENT),
    top: Math.round(fractions.top * PERCENT),
    right: Math.round(fractions.right * PERCENT),
    bottom: Math.round(fractions.bottom * PERCENT),
  };
  validateCrop(crop, PERCENT);
  if (frame.flipHorizontal) [crop.left, crop.right] = [crop.right, crop.left];
  if (frame.flipVertical) [crop.top, crop.bottom] = [crop.bottom, crop.top];
  return {
    crop,
    rotation: Math.round(frame.angleDeg * ANGLE_UNIT) % TURN,
    flipHorizontal: frame.flipHorizontal === true,
    flipVertical: frame.flipVertical === true,
  };
}

export function decodeNativePictureGeometry(geometry: NativePictureGeometry): {
  source: PictureSourceFrame;
  angleDeg: number;
  flipHorizontal?: true;
  flipVertical?: true;
} {
  validateCrop(geometry.crop, PERCENT);
  if (
    !Number.isSafeInteger(geometry.rotation) ||
    geometry.rotation < 0 ||
    geometry.rotation >= TURN ||
    typeof geometry.flipHorizontal !== "boolean" ||
    typeof geometry.flipVertical !== "boolean"
  )
    throw new RangeError("Invalid native picture transform.");
  let { left, right, top, bottom } = geometry.crop;
  if (geometry.flipHorizontal) [left, right] = [right, left];
  if (geometry.flipVertical) [top, bottom] = [bottom, top];
  const horizontal = PERCENT - left - right;
  const vertical = PERCENT - top - bottom;
  const source = {
    widthRatio: PERCENT / horizontal,
    heightRatio: PERCENT / vertical,
    offsetXRatio: (right - left) / (2 * horizontal),
    offsetYRatio: (bottom - top) / (2 * vertical),
  };
  if (Object.values(source).some((value) => !Number.isFinite(value)))
    throw new RangeError("Picture source cannot be reconstructed.");
  return {
    source,
    angleDeg: geometry.rotation / ANGLE_UNIT,
    ...(geometry.flipHorizontal ? { flipHorizontal: true as const } : {}),
    ...(geometry.flipVertical ? { flipVertical: true as const } : {}),
  };
}

export function isIdentityNativePictureGeometry(geometry: NativePictureGeometry): boolean {
  return (
    Object.values(geometry.crop).every((value) => value === 0) &&
    geometry.rotation === 0 &&
    !geometry.flipHorizontal &&
    !geometry.flipVertical
  );
}

/** Check quantization before registering media; asset dimensions are decoded display dimensions. */
export function assertNativePictureGeometryPrecision(
  frame: PictureFrame,
  size: PictureFrameSize,
  sourceSize?: PictureFrameSize,
): NativePictureGeometry {
  const encoded = encodeNativePictureGeometry(frame);
  const decoded = decodeNativePictureGeometry(encoded);
  if (![size.width, size.height].every((value) => Number.isFinite(value) && value > 0))
    throw new RangeError("Invalid picture frame dimensions.");
  const before = frame.source,
    after = decoded.source;
  const axisError = (
    ratio: number,
    offset: number,
    nextRatio: number,
    nextOffset: number,
    extent: number,
  ) =>
    Math.max(
      Math.abs(offset - ratio / 2 - nextOffset + nextRatio / 2),
      Math.abs(offset + ratio / 2 - nextOffset - nextRatio / 2),
    ) * extent;
  const sourceError = Math.hypot(
    axisError(
      before.widthRatio,
      before.offsetXRatio,
      after.widthRatio,
      after.offsetXRatio,
      size.width,
    ),
    axisError(
      before.heightRatio,
      before.offsetYRatio,
      after.heightRatio,
      after.offsetYRatio,
      size.height,
    ),
  );
  const delta = Math.abs(normalizePictureAngle(frame.angleDeg) - decoded.angleDeg);
  const radians = (Math.min(delta, 360 - delta) * Math.PI) / 180;
  const radius = Math.max(
    Math.hypot(size.width, size.height) / 2,
    Math.hypot(
      size.width * (Math.abs(after.offsetXRatio) + after.widthRatio / 2),
      size.height * (Math.abs(after.offsetYRatio) + after.heightRatio / 2),
    ),
  );
  const angleError = 2 * radius * Math.sin(radians / 2);
  // Conservatively reserve anchor/end-marker and extent rounding, including
  // magnification of extent error by the preserved full-source placement.
  const emuError =
    (2 / 9525) *
    Math.hypot(
      1 + Math.abs(after.offsetXRatio) + after.widthRatio / 2,
      1 + Math.abs(after.offsetYRatio) + after.heightRatio / 2,
    );
  if (!Number.isFinite(sourceError) || sourceError + angleError + emuError > 0.01)
    throw new RangeError("Picture geometry exceeds the 0.01 frame-pixel precision budget.");
  if (sourceSize) {
    if (
      ![sourceSize.width, sourceSize.height].every((value) => Number.isFinite(value) && value > 0)
    )
      throw new RangeError("Invalid decoded picture source dimensions.");
    const a = cropFractions(before),
      b = cropFractions(after);
    const x = Math.max(Math.abs(a.left - b.left), Math.abs(a.right - b.right)) * sourceSize.width;
    const y = Math.max(Math.abs(a.top - b.top), Math.abs(a.bottom - b.bottom)) * sourceSize.height;
    if (Math.hypot(x, y) > 0.5)
      throw new RangeError("Picture crop exceeds the 0.5 source-pixel precision budget.");
  }
  return encoded;
}
