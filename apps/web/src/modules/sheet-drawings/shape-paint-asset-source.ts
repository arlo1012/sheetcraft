import { prepareImageAsset } from "../image-assets/prepareImageAsset";
import type { ImageAssetStore, ImageAsset } from "../image-assets/imageAssetStore";
import {
  PICTURE_TEXTURE_IDS,
  pictureTextureAssetId,
  type PictureTextureId,
} from "../sheet-images/picture-texture";
import { shapeFormatOwnerKey, type ShapeFormatSnapshot } from "./shape-format-pane-model";

/** Explicit local source request; full owner/revision CAS surrounds decode and storage. */
export function createShapePaintAssetSource(options: {
  getSnapshot: () => ShapeFormatSnapshot | null;
  store: ImageAssetStore;
  prepare?: (blob: Blob) => Promise<ImageAsset>;
  preparePixels?: (asset: ImageAsset) => Promise<HTMLImageElement | undefined>;
}) {
  const prepared = new Set<string>();
  const pixels = new Map<string, HTMLImageElement>();
  let pixelBytes = 0;
  let request = 0,
    disposed = false;
  async function load(blob: Blob, texture?: PictureTextureId): Promise<string | undefined> {
    const before = options.getSnapshot();
    if (!before || disposed) return;
    if (texture !== undefined && !PICTURE_TEXTURE_IDS.includes(texture))
      throw new TypeError("Unknown shape texture.");
    const key = shapeFormatOwnerKey(before.owner),
      revision = before.revision,
      operation = ++request;
    const current = () => {
      const now = options.getSnapshot();
      return (
        !disposed &&
        request === operation &&
        !!now &&
        now.revision === revision &&
        shapeFormatOwnerKey(now.owner) === key &&
        now.drawing === before.drawing
      );
    };
    const decoded = await (options.prepare ?? prepareImageAsset)(blob);
    if (!current()) return;
    const asset = texture
      ? { ...decoded, id: pictureTextureAssetId(texture, decoded.id) }
      : decoded;
    await options.store.put(asset);
    if (!current()) return;
    const image = await options.preparePixels?.(asset);
    if (!current()) return;
    if (image) {
      const bytes = image.naturalWidth * image.naturalHeight * 4;
      if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 64 * 1024 * 1024)
        throw new RangeError("Shape paint source pixels exceed the 64MiB preview budget.");
      // The previous explicit source is not an owner of the active form draft.
      if (pixelBytes + bytes > 64 * 1024 * 1024) {
        pixels.clear();
        pixelBytes = 0;
      }
      const previous = pixels.get(asset.id);
      if (previous) pixelBytes -= previous.naturalWidth * previous.naturalHeight * 4;
      pixels.set(asset.id, image);
      pixelBytes += bytes;
    }
    prepared.add(asset.id);
    return asset.id;
  }
  return {
    load,
    has: (id: string) => prepared.has(id),
    getAssetImage: (id: string) => pixels.get(id),
    cancel: () => {
      request++;
      pixels.clear();
      pixelBytes = 0;
    },
    dispose: () => {
      disposed = true;
      request++;
      prepared.clear();
      pixels.clear();
      pixelBytes = 0;
    },
  };
}
