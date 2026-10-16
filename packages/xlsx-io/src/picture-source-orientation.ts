/** B2 keeps encoded pixels. Orientation-bearing sources need a separate host-equivalence gate. */
function reject(): never {
  throw new RangeError("Native picture geometry cannot verify this source's orientation metadata.");
}
function exifOrientation(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (offset: number, length: number) => {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length - length) reject();
  };
  need(0, 8);
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!little && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) reject();
  if (view.getUint16(2, little) !== 42) reject();
  const offset = view.getUint32(4, little);
  if (offset < 8) reject();
  need(offset, 2);
  const count = view.getUint16(offset, little);
  need(offset + 2, count * 12 + 4);
  let seen = false;
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    if (seen || view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1)
      reject();
    seen = true;
    if (view.getUint16(entry + 8, little) !== 1) reject();
  }
  // Only IFD0 describes the primary pixels. IFD1, when present, is a thumbnail.
}

/** Check metadata, never infer display orientation from encoded width/height. */
export function assertNativePictureSourceOrientation(
  bytes: Uint8Array,
  extension: "png" | "jpeg" | "gif",
): void {
  if (bytes.length < 1 || bytes.length > 8 * 1024 * 1024) reject();
  if (extension === "gif") return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let metadata = false;
  if (extension === "jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) reject();
    let offset = 2;
    let entropy = false;
    while (offset < bytes.length) {
      // Scan marker framing, not compressed pixel values. Stuffed FF00 and restart
      // markers stay inside entropy data; APP1 between scans is still inspected.
      if (entropy) while (offset < bytes.length && bytes[offset] !== 0xff) offset++;
      if (bytes[offset++] !== 0xff) reject();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (
        entropy &&
        (marker === 0x00 || (marker !== undefined && marker >= 0xd0 && marker <= 0xd7))
      )
        continue;
      entropy = false;
      if (marker === 0xd9) {
        if (offset !== bytes.length) reject();
        return;
      }
      if (
        marker === undefined ||
        marker === 0x00 ||
        marker === 0xd8 ||
        (marker >= 0xd0 && marker <= 0xd7)
      )
        reject();
      if (marker === 0x01) continue;
      if (offset + 2 > bytes.length) reject();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) reject();
      if (marker === 0xe1) {
        // Unrecognized APP1 may contain XMP orientation; do not label it as EXIF.
        const payload = bytes.subarray(offset + 2, offset + length);
        if (
          metadata ||
          payload.length < 6 ||
          ![0x45, 0x78, 0x69, 0x66, 0, 0].every((byte, index) => payload[index] === byte)
        )
          reject();
        metadata = true;
        exifOrientation(payload.subarray(6));
      }
      offset += length;
      if (marker === 0xda) entropy = true;
    }
    reject();
  }
  if (
    bytes.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  )
    reject();
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) reject();
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (kind === "eXIf") {
      if (metadata) reject();
      metadata = true;
      exifOrientation(bytes.subarray(offset + 8, offset + 8 + length));
    }
    // XMP in a PNG text chunk has not been proven equivalent across target hosts.
    if (
      (kind === "iTXt" || kind === "tEXt" || kind === "zTXt") &&
      [..."XML:com.adobe.xmp\0"].every(
        (character, index) =>
          index < length && bytes[offset + 8 + index] === character.charCodeAt(0),
      )
    )
      reject();
    if (kind === "IEND") {
      if (length !== 0 || offset + 12 !== bytes.length) reject();
      return;
    }
    offset += length + 12;
  }
  reject();
}
