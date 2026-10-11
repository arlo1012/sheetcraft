import {
  assertImagePixelBudget,
  ImageAssetError,
  type ImageDimensions,
} from "./imageAssetValidation";
export type EncodedImageHeader = ImageDimensions & {
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
};
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
function invalid(): never {
  throw new ImageAssetError("invalid-image");
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Bounded container/header preflight; compressed pixel data is still decoded by the platform. */
export function inspectEncodedImageHeader(bytes: Uint8Array): EncodedImageHeader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (offset: number, length: number, end = bytes.length) => {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      end > bytes.length ||
      offset > end - length
    )
      invalid();
  };
  const ascii = (offset: number, length: number) => {
    need(offset, length);
    return String.fromCharCode(...bytes.subarray(offset, offset + length));
  };
  const u24 = (offset: number) => {
    need(offset, 3);
    return bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65536;
  };
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
    need(8, 25);
    if (
      view.getUint32(8) !== 13 ||
      ascii(12, 4) !== "IHDR" ||
      view.getUint32(29) !== crc32(bytes.subarray(12, 29))
    )
      invalid();
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width > 0x7fffffff || height > 0x7fffffff) invalid();
    const dimensions = assertImagePixelBudget(width, height);
    const depth = bytes[24]!;
    const color = bytes[25]!;
    const validDepth =
      color === 0
        ? [1, 2, 4, 8, 16]
        : color === 3
          ? [1, 2, 4, 8]
          : [2, 4, 6].includes(color)
            ? [8, 16]
            : [];
    if (!validDepth.includes(depth) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28]! > 1)
      invalid();
    let offset = 33;
    let data = false;
    while (offset < bytes.length) {
      need(offset, 12);
      const length = view.getUint32(offset);
      need(offset + 8, length + 4);
      const kind = ascii(offset + 4, 4);
      if (kind === "IHDR") invalid();
      if (kind === "fcTL") {
        if (length !== 26) invalid();
        const frame = assertImagePixelBudget(
          view.getUint32(offset + 12),
          view.getUint32(offset + 16),
        );
        if (
          view.getUint32(offset + 20) > width - frame.width ||
          view.getUint32(offset + 24) > height - frame.height
        )
          invalid();
      }
      if (kind === "IDAT") data = true;
      if (kind === "IEND") {
        if (length !== 0 || !data || offset + 12 !== bytes.length) invalid();
        return { ...dimensions, mimeType: "image/png" };
      }
      offset += length + 12;
    }
    return invalid();
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) invalid();
      while (bytes[offset] === 0xff) offset++;
      need(offset, 1);
      const marker = bytes[offset++]!;
      if (marker === 0 || marker === 0xd8 || marker === 0xd9 || marker === 0xda) invalid();
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      need(offset, 2);
      const length = view.getUint16(offset);
      if (length < 2) invalid();
      need(offset, length);
      if (JPEG_SOF.has(marker)) {
        if (
          length < 8 ||
          bytes[offset + 2]! < 1 ||
          bytes[offset + 2]! > 16 ||
          bytes[offset + 7] === 0 ||
          length !== 8 + bytes[offset + 7]! * 3
        )
          invalid();
        return {
          ...assertImagePixelBudget(view.getUint16(offset + 5), view.getUint16(offset + 3)),
          mimeType: "image/jpeg",
        };
      }
      offset += length;
    }
    return invalid();
  }
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) {
    need(0, 13);
    let dimensions = assertImagePixelBudget(view.getUint16(6, true), view.getUint16(8, true));
    let offset = 13;
    let frames = 0;
    const skipTable = (packed: number) => {
      if (packed & 0x80) {
        const length = 3 * 2 ** ((packed & 7) + 1);
        need(offset, length);
        offset += length;
      }
    };
    const skipBlocks = () => {
      while (true) {
        need(offset, 1);
        const length = bytes[offset++]!;
        if (!length) return;
        need(offset, length);
        offset += length;
      }
    };
    skipTable(bytes[10]!);
    while (offset < bytes.length) {
      const kind = bytes[offset++]!;
      if (kind === 0x3b) {
        if (!frames) invalid();
        return { ...dimensions, mimeType: "image/gif" };
      }
      if (kind === 0x21) {
        need(offset++, 1);
        skipBlocks();
        continue;
      }
      if (kind !== 0x2c) invalid();
      need(offset, 9);
      const frame = assertImagePixelBudget(
        view.getUint16(offset + 4, true),
        view.getUint16(offset + 6, true),
      );
      // Some platform GIF decoders expand the logical screen to include the
      // first frame. Budget the union as well as each frame before any decode.
      dimensions = assertImagePixelBudget(
        Math.max(dimensions.width, view.getUint16(offset, true) + frame.width),
        Math.max(dimensions.height, view.getUint16(offset + 2, true) + frame.height),
      );
      const packed = bytes[offset + 8]!;
      offset += 9;
      skipTable(packed);
      need(offset, 1);
      const codeSize = bytes[offset++]!;
      // Keep legacy literal widths 0/1 for the platform decoder to interpret.
      // They do not change the verified canvas/frame memory dimensions.
      if (codeSize > 8) invalid();
      skipBlocks();
      frames++;
    }
    return invalid();
  }
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const end = view.getUint32(4, true) + 8;
    if (end !== bytes.length || end < 20) invalid();
    const chunks = (
      start: number,
      limit: number,
      visitor: (kind: string, offset: number, length: number) => void,
    ) => {
      let offset = start;
      while (offset < limit) {
        need(offset, 8, limit);
        const length = view.getUint32(offset + 4, true);
        need(offset + 8, length + (length & 1), limit);
        visitor(ascii(offset, 4), offset + 8, length);
        offset += 8 + length + (length & 1);
      }
    };
    const bitstream = (
      kind: string,
      offset: number,
      length: number,
    ): ImageDimensions | undefined => {
      if (kind === "VP8L") {
        if (length < 5 || bytes[offset] !== 0x2f) invalid();
        const bits = view.getUint32(offset + 1, true);
        if (bits >>> 29) invalid();
        return assertImagePixelBudget((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      }
      if (kind === "VP8 ") {
        if (length < 10 || bytes[offset]! & 1 || ascii(offset + 3, 3) !== "\x9d\x01\x2a") invalid();
        return assertImagePixelBudget(
          view.getUint16(offset + 6, true) & 0x3fff,
          view.getUint16(offset + 8, true) & 0x3fff,
        );
      }
      return undefined;
    };
    let canvas: ImageDimensions | undefined;
    let still: ImageDimensions | undefined;
    let animated = false;
    let animationHeader = false;
    let frames = 0;
    let count = 0;
    chunks(12, end, (kind, offset, length) => {
      count++;
      if (kind === "VP8X") {
        if (count !== 1 || length !== 10) invalid();
        canvas = assertImagePixelBudget(u24(offset + 4) + 1, u24(offset + 7) + 1);
        animated = !!(bytes[offset]! & 2);
      } else if (kind === "ANIM") {
        if (!animated || animationHeader || length !== 6) invalid();
        animationHeader = true;
      } else if (kind === "ANMF") {
        if (!animated || !animationHeader || !canvas || length < 16) invalid();
        const frame = assertImagePixelBudget(u24(offset + 6) + 1, u24(offset + 9) + 1);
        if (
          u24(offset) * 2 > canvas.width - frame.width ||
          u24(offset + 3) * 2 > canvas.height - frame.height
        )
          invalid();
        let encoded: ImageDimensions | undefined;
        chunks(offset + 16, offset + length, (type, start, size) => {
          const dimensions = bitstream(type, start, size);
          if (dimensions) {
            if (encoded) invalid();
            encoded = dimensions;
          }
        });
        if (!encoded || encoded.width !== frame.width || encoded.height !== frame.height) invalid();
        frames++;
      } else {
        const dimensions = bitstream(kind, offset, length);
        if (dimensions) {
          if (animated || still) invalid();
          still = dimensions;
        }
      }
    });
    if (animated) {
      if (!frames || !canvas) invalid();
    } else if (
      !still ||
      (canvas && (still.width !== canvas.width || still.height !== canvas.height))
    )
      invalid();
    return { ...(canvas ?? still!), mimeType: "image/webp" };
  }
  throw new ImageAssetError("unsupported-type");
}
