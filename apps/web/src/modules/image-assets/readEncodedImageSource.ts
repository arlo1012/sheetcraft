import { inspectEncodedImageHeader } from "./inspectEncodedImageHeader";
import { ImageAssetError, MAX_IMAGE_BYTES } from "./imageAssetValidation";

/** Validate the actual source before exposing it to any pixel decoder. */
export async function readEncodedImageSource(file: Blob) {
  if (!Number.isSafeInteger(file.size) || file.size < 1) throw new ImageAssetError("invalid-image");
  if (file.size > MAX_IMAGE_BYTES) throw new ImageAssetError("too-large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new ImageAssetError("invalid-image");
  const header = inspectEncodedImageHeader(bytes);
  const blob = file.type === header.mimeType ? file : new Blob([bytes], { type: header.mimeType });
  return { bytes, blob, header };
}
