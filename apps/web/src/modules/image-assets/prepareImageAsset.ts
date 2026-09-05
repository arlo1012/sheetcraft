import type { ImageAsset } from "./imageAssetStore";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export class ImageAssetError extends Error {
  constructor(readonly code: "unsupported-type" | "too-large" | "invalid-image" | "decode-failed") {
    super(`Image asset: ${code}`);
    this.name = "ImageAssetError";
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function detectedMimeType(bytes: Uint8Array): string | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.slice(0, 6)) in { GIF87a: true, GIF89a: true }
  )
    return "image/gif";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return undefined;
}

async function contentHash(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
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

async function dimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new ImageAssetError("decode-failed"));
      image.src = url;
    });
    if (
      !Number.isFinite(image.naturalWidth) ||
      !Number.isFinite(image.naturalHeight) ||
      image.naturalWidth < 1 ||
      image.naturalHeight < 1
    )
      throw new ImageAssetError("invalid-image");
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Validates encoded bytes and derives every persisted field from the decoded payload. */
export async function prepareImageAsset(file: Blob): Promise<ImageAsset> {
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > MAX_IMAGE_BYTES)
    throw new ImageAssetError("too-large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectedMimeType(bytes);
  if (!mimeType || !ACCEPTED_TYPES.has(mimeType)) throw new ImageAssetError("unsupported-type");
  const blob = file.type === mimeType ? file : new Blob([bytes], { type: mimeType });
  const [id, size] = await Promise.all([contentHash(blob), dimensions(blob)]);
  return { id: `image-${id}`, mimeType, ...size, blob };
}
