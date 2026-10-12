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
  async function load(blob: Blob): Promise<string | undefined> {
    const snapshot = options.getSnapshot();
    if (!snapshot || disposed) return;
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
    const asset = await (options.prepare ?? prepareImageAsset)(blob);
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
