import {
  assertImagePixelBudget,
  ImageAssetError,
  type ImageDimensions,
} from "./imageAssetValidation";

function invalid(): never {
  throw new ImageAssetError("invalid-image");
}
export class BmpImageSourceError extends ImageAssetError {
  constructor(readonly reason: "unsupported-feature" | "external-profile") {
    super("unsupported-type");
    this.name = "BmpImageSourceError";
  }
}
function unsupported(reason: BmpImageSourceError["reason"] = "unsupported-feature"): never {
  throw new BmpImageSourceError(reason);
}

/** Preflight standalone, uncompressed BMP declarations before a platform decoder. */
export function inspectBmpImageHeader(bytes: Uint8Array): ImageDimensions & {
  mimeType: "image/bmp";
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (offset: number, length: number) => {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset > bytes.length - length
    )
      invalid();
  };
  need(0, 18);
  if (
    bytes[0] !== 0x42 ||
    bytes[1] !== 0x4d ||
    view.getUint32(2, true) !== bytes.length ||
    view.getUint16(6, true) !== 0 ||
    view.getUint16(8, true) !== 0
  )
    invalid();
  const pixelOffset = view.getUint32(10, true),
    headerSize = view.getUint32(14, true);
  if (![12, 40, 108, 124].includes(headerSize)) unsupported();
  need(14, headerSize);
  const core = headerSize === 12;
  const width = core ? view.getUint16(18, true) : view.getInt32(18, true);
  const signedHeight = core ? view.getUint16(20, true) : view.getInt32(22, true);
  const dimensions = assertImagePixelBudget(width, Math.abs(signedHeight));
  const planes = view.getUint16(core ? 22 : 26, true);
  const depth = view.getUint16(core ? 24 : 28, true);
  if (planes !== 1 || !(core ? [1, 4, 8, 24] : [1, 4, 8, 16, 24, 32]).includes(depth)) invalid();
  const compression = core ? 0 : view.getUint32(30, true);
  if (compression !== 0 && compression !== 3) unsupported();
  if (compression === 3 && depth !== 16 && depth !== 32) invalid();
  let metadataEnd = 14 + headerSize;
  if (compression === 3) {
    const maskOffset = headerSize === 40 ? metadataEnd : 54;
    need(maskOffset, 12);
    if (headerSize === 40) metadataEnd += 12;
    const masks = [0, 1, 2].map((index) => view.getUint32(maskOffset + index * 4, true));
    if (headerSize >= 108) masks.push(view.getUint32(66, true));
    let occupied = 0;
    for (let index = 0; index < masks.length; index++) {
      const mask = masks[index]!;
      if (!mask && index === 3) continue;
      if (!mask || (depth === 16 && mask > 0xffff) || (mask & occupied) !== 0) invalid();
      let compact = mask;
      while ((compact & 1) === 0) compact >>>= 1;
      if ((compact & (compact + 1)) !== 0) invalid();
      occupied = (occupied | mask) >>> 0;
    }
  }
  // Linked color profiles may name an external file. Embedded ICC profiles are
  // outside this bounded BMP subset rather than passed to a second decoder.
  if (headerSize >= 108) {
    const colorSpace = view.getUint32(70, true);
    if (colorSpace === 0x4c494e4b) unsupported("external-profile");
    if (![0, 0x73524742, 0x57696e20].includes(colorSpace)) unsupported();
    if (headerSize === 124 && (view.getUint32(126, true) || view.getUint32(130, true)))
      unsupported();
  }
  const colorsUsed = core ? 0 : view.getUint32(46, true);
  const colors = depth <= 8 ? colorsUsed || 2 ** depth : colorsUsed;
  if (depth <= 8 && colors > 2 ** depth) invalid();
  const paletteStride = core ? 3 : 4;
  need(metadataEnd, colors * paletteStride);
  metadataEnd += colors * paletteStride;
  if (pixelOffset < metadataEnd) invalid();
  const stride = Math.ceil((width * depth) / 32) * 4;
  const pixelBytes = stride * dimensions.height;
  need(pixelOffset, pixelBytes);
  const declaredPixelBytes = core ? 0 : view.getUint32(34, true);
  if (declaredPixelBytes && declaredPixelBytes !== pixelBytes) invalid();
  // Partial palettes must cover every used index, not just fit in the header.
  if (depth <= 8 && colors < 2 ** depth) {
    const mask = (1 << depth) - 1;
    for (let y = 0; y < dimensions.height; y++) {
      const row = pixelOffset + y * stride;
      for (let x = 0; x < width; x++) {
        const bit = x * depth;
        const index = (bytes[row + Math.floor(bit / 8)]! >>> (8 - depth - (bit % 8))) & mask;
        if (index >= colors) invalid();
      }
    }
  }
  return { ...dimensions, mimeType: "image/bmp" };
}
