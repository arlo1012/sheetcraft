import type { ImageAsset, ImageAssetStore } from "./imageAssetStore";

export class ImageAssetBatchError extends Error {
  constructor(
    readonly code: "invalid" | "storage",
    options?: ErrorOptions,
  ) {
    super(`Image asset batch: ${code}`, options);
    this.name = "ImageAssetBatchError";
  }
}

async function sameBytes(left: Blob, right: Blob): Promise<boolean> {
  if (left.size !== right.size) return false;
  const first = new Uint8Array(await left.arrayBuffer());
  const second = new Uint8Array(await right.arrayBuffer());
  return first.every((byte, index) => byte === second[index]);
}

/** Validate the complete batch before writes; commit only new, deduplicated assets atomically. */
export async function storeImageAssetBatch(
  assets: readonly ImageAsset[],
  store?: ImageAssetStore,
  signal?: AbortSignal,
): Promise<void> {
  try {
    signal?.throwIfAborted();
    if (!assets.length) return;
    if (!store) throw new ImageAssetBatchError("storage");
    const unique = new Map<string, ImageAsset>();
    const pending: ImageAsset[] = [];
    for (const asset of assets) {
      // Remember existing assets too, so duplicate incoming IDs are checked once against storage.
      const previous = unique.get(asset.id);
      const existing = previous ?? (await store.get(asset.id));
      signal?.throwIfAborted();
      if (existing) {
        if (!(await sameBytes(existing.blob, asset.blob)))
          throw new ImageAssetBatchError("invalid");
      } else pending.push(asset);
      unique.set(asset.id, existing ?? asset);
    }
    signal?.throwIfAborted();
    if (!pending.length) return;
    if (store.putAll) await store.putAll(pending);
    else if (pending.length === 1) await store.put(pending[0]!);
    else throw new ImageAssetBatchError("storage");
    signal?.throwIfAborted();
  } catch (cause) {
    signal?.throwIfAborted();
    if (cause instanceof ImageAssetBatchError) throw cause;
    throw new ImageAssetBatchError("storage", { cause });
  }
}
