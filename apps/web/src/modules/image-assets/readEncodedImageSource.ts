import { inspectEncodedImageHeader } from "./inspectEncodedImageHeader";
import { inspectSvgImageSource } from "./inspectSvgImageSource";
import { ImageAssetError, MAX_IMAGE_BYTES } from "./imageAssetValidation";

function isXmlSource(bytes: Uint8Array): boolean {
  // Detection uses content, never a filename or an untrusted MIME declaration.
  let offset = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while ([9, 10, 13, 32].includes(bytes[offset]!)) offset++;
  return (
    bytes[offset] === 0x3c ||
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  );
}

/** Validate the actual source before exposing it to any pixel decoder. */
export async function readEncodedImageSource(file: Blob) {
  if (!Number.isSafeInteger(file.size) || file.size < 1) throw new ImageAssetError("invalid-image");
  if (file.size > MAX_IMAGE_BYTES) throw new ImageAssetError("too-large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new ImageAssetError("invalid-image");
  if (isXmlSource(bytes)) {
    const source = inspectSvgImageSource(bytes);
    if (source.bytes.length > MAX_IMAGE_BYTES) throw new ImageAssetError("too-large");
    const header = { width: source.width, height: source.height, mimeType: source.mimeType };
    const blob =
      source.bytes === bytes && file.type === header.mimeType
        ? file
        : new Blob([source.bytes], { type: header.mimeType });
    return { bytes: source.bytes, blob, header };
  }
  const header = inspectEncodedImageHeader(bytes);
  const blob = file.type === header.mimeType ? file : new Blob([bytes], { type: header.mimeType });
  return { bytes, blob, header };
}
