import type { ImageAsset } from "./imageAssetStore";

import { readEncodedImageSource } from "./readEncodedImageSource";
import { ImageAssetError, assertImagePixelBudget } from "./imageAssetValidation";
export {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  ImageAssetError,
} from "./imageAssetValidation";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function contentHash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (globalThis.crypto?.subtle)
    return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  return `unhashed-${globalThis.crypto?.randomUUID?.() ?? randomId()}`;
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (!bytes.some((byte) => byte !== 0)) {
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(bytes);
}

async function dimensions(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ width: number; height: number }> {
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
        image.onload = null;
        image.onerror = null;
      };
      const onAbort = () => {
        cleanup();
        image.src = "";
        reject(signal?.reason ?? new DOMException("Image decoding was cancelled.", "AbortError"));
      };
      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new ImageAssetError("decode-failed"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      image.src = url;
    });
    return assertImagePixelBudget(image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Preflights encoded declarations, retains original bytes and derives decoded display dimensions. */
export async function prepareImageAsset(file: Blob, signal?: AbortSignal): Promise<ImageAsset> {
  signal?.throwIfAborted();
  const { bytes, blob, header } = await readEncodedImageSource(file);
  const size = await dimensions(blob, signal);
  const id = await contentHash(bytes);
  signal?.throwIfAborted();
  return { id: `image-${id}`, mimeType: header.mimeType, ...size, blob };
}
