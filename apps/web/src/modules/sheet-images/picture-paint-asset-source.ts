import {
  PICTURE_TEXTURE_IDS,
  pictureTextureAssetId,
  type PictureTextureId,
} from "./picture-texture";
import type { ImageAsset, ImageAssetStore } from "../image-assets/imageAssetStore";
import { prepareImageAsset } from "../image-assets/prepareImageAsset";
import { pictureFormatOwnerKey, type PictureFormatSnapshot } from "./picture-format-pane-model";

/** Local, validated assets only. Late file reads cannot become a new picture's paint source. */
export function createPicturePaintAssetSource(options: {
  getSnapshot: () => PictureFormatSnapshot | null;
  store: ImageAssetStore;
  prepare?: (blob: Blob) => Promise<ImageAsset>;
}) {
  const prepared = new Set<string>();
  let operation = 0;
  let disposed = false;
  async function load(blob: Blob, texture?: PictureTextureId): Promise<string | undefined> {
    const snapshot = options.getSnapshot();
    if (!snapshot || disposed) return;
    if (texture !== undefined && !PICTURE_TEXTURE_IDS.includes(texture))
      throw new TypeError("Unknown picture texture.");
    const owner = pictureFormatOwnerKey(snapshot.owner),
      revision = snapshot.revision;
    const request = ++operation;
    const current = () => {
      const now = options.getSnapshot();
      return (
        !disposed &&
        request === operation &&
        !!now &&
        pictureFormatOwnerKey(now.owner) === owner &&
        now.revision === revision
      );
    };
    const decoded = await (options.prepare ?? prepareImageAsset)(blob);
    const asset = texture
      ? { ...decoded, id: pictureTextureAssetId(texture, decoded.id) }
      : decoded;
    if (!current()) return;
    await options.store.put(asset);
    if (!current()) return;
    prepared.add(asset.id);
    return asset.id;
  }
  return {
    load,
    has: (id: string) => prepared.has(id),
    cancel: () => {
      operation++;
    },
    dispose: () => {
      disposed = true;
      operation++;
      prepared.clear();
    },
  };
}
