import { expect, test, vi } from "vitest";
import {
  createMemoryImageAssetStore,
  type ImageAsset,
} from "../../../modules/image-assets/imageAssetStore";
import { storeImageAssetBatch } from "../../../modules/image-assets/storeImageAssetBatch";

const asset = (id: string, value = "bytes"): ImageAsset => ({
  id,
  mimeType: "image/png",
  width: 1,
  height: 1,
  blob: new Blob([value]),
});

test("deduplicates same-batch and existing bytes without overwriting existing assets", async () => {
  const store = createMemoryImageAssetStore();
  await store.put(asset("existing"));
  const get = vi.spyOn(store, "get"),
    put = vi.spyOn(store, "put"),
    putAll = vi.spyOn(store, "putAll");
  await storeImageAssetBatch(
    [asset("new"), asset("new"), asset("existing"), asset("existing")],
    store,
  );
  expect(get).toHaveBeenCalledTimes(2);
  expect(put).not.toHaveBeenCalled();
  expect(putAll).toHaveBeenCalledOnce();
  expect(putAll.mock.calls[0]![0].map((item) => item.id)).toEqual(["new"]);
});

test.each(["batch", "existing"])(
  "rejects %s byte collisions before committing any pending asset",
  async (kind) => {
    const store = createMemoryImageAssetStore();
    if (kind === "existing") await store.put(asset("collision"));
    const putAll = vi.spyOn(store, "putAll"),
      put = vi.spyOn(store, "put");
    await expect(
      storeImageAssetBatch(
        [asset("pending"), asset("collision"), asset("collision", "wrong")],
        store,
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(putAll).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(await store.get("pending")).toBeUndefined();
  },
);

test("old stores reject multi-asset batches without a partial write and allow one new asset", async () => {
  const store = { get: vi.fn(async () => undefined), put: vi.fn(async () => {}) };
  await expect(storeImageAssetBatch([asset("a"), asset("b")], store)).rejects.toMatchObject({
    code: "storage",
  });
  expect(store.put).not.toHaveBeenCalled();
  await storeImageAssetBatch([asset("a"), asset("a")], store);
  expect(store.put).toHaveBeenCalledOnce();
});

test("failed atomic stores never fall back to individual writes", async () => {
  const store = {
    get: vi.fn(async () => undefined),
    put: vi.fn(async () => {}),
    putAll: vi.fn(async () => {
      throw Error("transaction aborted");
    }),
  };
  await expect(storeImageAssetBatch([asset("a"), asset("b")], store)).rejects.toMatchObject({
    code: "storage",
  });
  expect(store.putAll).toHaveBeenCalledOnce();
  expect(store.put).not.toHaveBeenCalled();
});

test("abort after a read prevents the batch commit", async () => {
  const controller = new AbortController();
  const store = {
    get: vi.fn(async () => {
      controller.abort();
      return undefined;
    }),
    put: vi.fn(),
    putAll: vi.fn(),
  };
  await expect(storeImageAssetBatch([asset("a")], store, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(store.putAll).not.toHaveBeenCalled();
  expect(store.put).not.toHaveBeenCalled();
});

test("abort after a completed atomic commit reports cancellation without rolling back stored bytes", async () => {
  const controller = new AbortController(),
    store = createMemoryImageAssetStore();
  await store.put(asset("existing"));
  const commit = store.putAll!;
  store.putAll = vi.fn(async (assets) => {
    await commit(assets);
    controller.abort();
  });
  const put = vi.spyOn(store, "put");
  await expect(
    storeImageAssetBatch([asset("a"), asset("b")], store, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(await store.get("existing")).toBeDefined();
  expect(await store.get("a")).toBeDefined();
  expect(await store.get("b")).toBeDefined();
  expect(put).not.toHaveBeenCalled();
  expect(store.putAll).toHaveBeenCalledOnce();
});
