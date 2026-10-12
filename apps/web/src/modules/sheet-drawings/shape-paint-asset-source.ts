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
}) {
  const prepared = new Set<string>();
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
    prepared.add(asset.id);
    return asset.id;
  }
  return {
    load,
    has: (id: string) => prepared.has(id),
    cancel: () => {
      request++;
    },
    dispose: () => {
      disposed = true;
      request++;
      prepared.clear();
    },
  };
}
