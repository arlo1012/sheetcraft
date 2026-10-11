/** Synthetic container declarations. They are not a substitute for pixel decoding. */
export const concat = (...parts: Uint8Array[]) => {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
};
const text = (value: string) => Uint8Array.from(value, (char) => char.charCodeAt(0));
export const uint32 = (value: number, little = false) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, little);
  return bytes;
};
export const uint24 = (value: number) =>
  Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255);
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export const pngChunk = (kind: string, data: Uint8Array) => {
  const body = concat(text(kind), data);
  return concat(uint32(data.length), body, uint32(crc32(body)));
};
export function png(width = 8, height = 4, extras: Uint8Array[] = [], fields = [8, 6, 0, 0, 0]) {
  return concat(
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    pngChunk("IHDR", concat(uint32(width), uint32(height), Uint8Array.from(fields))),
    ...extras,
    pngChunk("IDAT", Uint8Array.of(1)),
    pngChunk("IEND", new Uint8Array()),
  );
}
export function jpeg(width = 8, height = 4, marker = 0xc0) {
  return Uint8Array.of(
    0xff,
    0xd8,
    0xff,
    0xe1,
    0,
    4,
    1,
    2,
    0xff,
    marker,
    0,
    11,
    8,
    height >>> 8,
    height & 255,
    width >>> 8,
    width & 255,
    1,
    1,
    0x11,
    0,
    0xff,
    0xd9,
  );
}
export function gif(width = 8, height = 4, frameWidth = width, frameHeight = height) {
  return concat(
    text("GIF89a"),
    Uint8Array.of(
      width & 255,
      width >>> 8,
      height & 255,
      height >>> 8,
      0,
      0,
      0,
      0x2c,
      0,
      0,
      0,
      0,
      frameWidth & 255,
      frameWidth >>> 8,
      frameHeight & 255,
      frameHeight >>> 8,
      0,
      2,
      2,
      0x44,
      1,
      0,
      0x3b,
    ),
  );
}
export const webpChunk = (kind: string, data: Uint8Array) =>
  concat(
    text(kind),
    uint32(data.length, true),
    data,
    data.length & 1 ? Uint8Array.of(0) : new Uint8Array(),
  );
export const webp = (...chunks: Uint8Array[]) => {
  const body = concat(text("WEBP"), ...chunks);
  return concat(text("RIFF"), uint32(body.length, true), body);
};
export const vp8l = (width = 8, height = 4, version = 0) =>
  webpChunk(
    "VP8L",
    concat(
      Uint8Array.of(0x2f),
      uint32(((width - 1) | ((height - 1) << 14) | (version << 29)) >>> 0, true),
    ),
  );
export const vp8 = (width = 8, height = 4) =>
  webpChunk(
    "VP8 ",
    Uint8Array.of(0x10, 0, 0, 0x9d, 1, 0x2a, width & 255, width >>> 8, height & 255, height >>> 8),
  );
export const vp8x = (width = 8, height = 4, animated = false) =>
  webpChunk(
    "VP8X",
    concat(Uint8Array.of(animated ? 2 : 0, 0, 0, 0), uint24(width - 1), uint24(height - 1)),
  );
export const webpFrame = (width = 8, height = 4, encoded = vp8l(width, height), x = 0, y = 0) =>
  webpChunk(
    "ANMF",
    concat(
      uint24(x / 2),
      uint24(y / 2),
      uint24(width - 1),
      uint24(height - 1),
      Uint8Array.of(0, 0, 0, 0),
      encoded,
    ),
  );

// A locally generated 8×4 RGB fixture; the PNG CRC comes from an independent encoder.
export const actualPng = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAFElEQVR4nGPUqDjBgA0wYRUlSwIAiyQBcErTX4QAAAAASUVORK5CYII=",
  ),
  (char) => char.charCodeAt(0),
);
export const actualGif = Uint8Array.from(
  atob("R0lGODdhCAAEAIEAACh4yAAAAAAAAAAAACwAAAAACAAEAAAIDAABCBxIsKDBgwQDAgA7"),
  (char) => char.charCodeAt(0),
);
export const actualWebp = Uint8Array.from(
  atob(
    "UklGRjwAAABXRUJQVlA4IDAAAADwAQCdASoIAAQAAUAmJaACdLoB+AAETAAA/uxw3/0mzxNnibPkkf/OwbEu14AAAAA=",
  ),
  (char) => char.charCodeAt(0),
);
