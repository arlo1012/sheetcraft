import { expect, test, vi } from "vitest";
import {
  createMemoryImageAssetStore,
  type ImageAsset,
} from "../../../../modules/image-assets/imageAssetStore";
import { createPicturePaintAssetSource } from "../../../../modules/sheet-images/picture-paint-asset-source";
import type { PictureFormatSnapshot } from "../../../../modules/sheet-images/picture-format-pane-model";
function snapshot(): PictureFormatSnapshot {
  return {
    owner: {
      workbookId: "book",
      sheetId: "sheet",
      pictureId: "picture",
      assetId: "source",
      sessionId: "session",
    },
    revision: 1,
    values: {},
  };
}
function asset(): ImageAsset {
  return {
    id: "verified-local-asset",
    blob: new Blob(["synthetic"], { type: "image/png" }),
    mimeType: "image/png",
    width: 16,
    height: 16,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
test("verified local asset is only admitted after successful storage", async () => {
  let current: PictureFormatSnapshot | null = snapshot();
  const store = createMemoryImageAssetStore(),
    ready = deferred<void>(),
    put = vi.fn(async (value: ImageAsset) => {
      await ready.promise;
      await store.put(value);
    });
  const source = createPicturePaintAssetSource({
    getSnapshot: () => current,
    store: { get: store.get, put },
    prepare: async () => asset(),
  });
  const loading = source.load(new Blob(["synthetic"]));
  await Promise.resolve();
  expect(source.has(asset().id)).toBe(false);
  ready.resolve();
  expect(await loading).toBe(asset().id);
  expect(await store.get(asset().id)).toEqual(asset());
  current = null;
  source.dispose();
  expect(source.has(asset().id)).toBe(false);
});
test.each(["owner", "revision", "close", "dispose", "cancel"] as const)(
  "%s boundary invalidates late bytes before storage",
  async (boundary) => {
    let current: PictureFormatSnapshot | null = snapshot();
    const ready = deferred<ImageAsset>(),
      store = createMemoryImageAssetStore(),
      put = vi.spyOn(store, "put");
    const source = createPicturePaintAssetSource({
      getSnapshot: () => current,
      store,
      prepare: () => ready.promise,
    });
    const loading = source.load(new Blob(["synthetic"]));
    if (boundary === "owner")
      current = { ...current, owner: { ...current.owner, pictureId: "other" } };
    else if (boundary === "revision") current = { ...current, revision: 2 };
    else if (boundary === "close") current = null;
    else if (boundary === "dispose") source.dispose();
    else source.cancel();
    ready.resolve(asset());
    expect(await loading).toBeUndefined();
    expect(put).not.toHaveBeenCalled();
    expect(source.has(asset().id)).toBe(false);
  },
);
test("a stale storage completion cannot grant a new owner's asset identity", async () => {
  let current = snapshot();
  const ready = deferred<void>(),
    source = createPicturePaintAssetSource({
      getSnapshot: () => current,
      store: { get: async () => undefined, put: () => ready.promise },
      prepare: async () => asset(),
    });
  const loading = source.load(new Blob(["synthetic"]));
  await Promise.resolve();
  current = { ...current, owner: { ...current.owner, sessionId: "new-session" } };
  ready.resolve();
  expect(await loading).toBeUndefined();
  expect(source.has(asset().id)).toBe(false);
});
test("failed validation or storage does not admit an ID", async () => {
  for (const failure of ["validation", "storage"]) {
    const source = createPicturePaintAssetSource({
      getSnapshot: snapshot,
      store: {
        get: async () => undefined,
        put: async () => {
          if (failure === "storage") throw Error("storage unavailable");
        },
      },
      prepare: async () => {
        if (failure === "validation") throw Error("invalid image");
        return asset();
      },
    });
    await expect(source.load(new Blob(["synthetic"]))).rejects.toThrow();
    expect(source.has(asset().id)).toBe(false);
  }
});
