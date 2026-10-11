import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createIndexedDbImageAssetStore,
  type ImageAsset,
} from "../../../modules/image-assets/imageAssetStore";

const asset: ImageAsset = {
  id: "image-original",
  mimeType: "image/png",
  width: 2,
  height: 1,
  blob: new Blob(["original"], { type: "image/png" }),
};
function fixture() {
  const requests: IDBOpenDBRequest[] = [];
  const transactions: IDBTransaction[] = [];
  const requestFor = (result: unknown) =>
    ({ result, onsuccess: null, onerror: null }) as unknown as IDBRequest;
  const db = {
    close: vi.fn(),
    onversionchange: null,
    objectStoreNames: { contains: () => true },
    createObjectStore: vi.fn(),
    transaction: vi.fn(() => {
      const read = requestFor(asset);
      const transaction = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        error: null,
        objectStore: () => ({ get: () => read, put: vi.fn() }),
      } as unknown as IDBTransaction;
      Object.assign(transaction, { read });
      transactions.push(transaction);
      return transaction;
    }),
  } as unknown as IDBDatabase;
  const open = vi.fn(() => {
    const request = {
      result: db,
      error: new Error("temporary"),
      onsuccess: null,
      onerror: null,
      onblocked: null,
      onupgradeneeded: null,
    } as unknown as IDBOpenDBRequest;
    requests.push(request);
    return request;
  });
  vi.stubGlobal("indexedDB", { open });
  const store = createIndexedDbImageAssetStore();
  const opened = async (index = requests.length - 1) => {
    requests[index]!.onsuccess?.(new Event("success"));
    await Promise.resolve();
    await Promise.resolve();
  };
  const finishRead = (transaction = transactions.at(-1)!) => {
    (transaction as unknown as { read: IDBRequest }).read.onsuccess?.(new Event("success"));
    transaction.oncomplete?.(new Event("complete"));
  };
  return { store, requests, transactions, db, open, opened, finishRead };
}
afterEach(() => vi.unstubAllGlobals());
describe("recoverable picture asset storage", () => {
  test.each(["error", "blocked"] as const)(
    "retries a temporary %s opening without losing assets",
    async (failure) => {
      const f = fixture();
      const first = f.store.get(asset.id);
      const rejected = expect(first).rejects.toThrow();
      if (failure === "error") f.requests[0]!.onerror?.(new Event("error"));
      else f.requests[0]!.onblocked?.(new Event("blocked") as IDBVersionChangeEvent);
      await rejected;
      const second = f.store.get(asset.id);
      expect(f.open).toHaveBeenCalledTimes(2);
      await f.opened();
      f.finishRead();
      await expect(second).resolves.toEqual(asset);
    },
  );
  test("closes a late successful connection after blocked rejection", async () => {
    const f = fixture();
    const read = f.store.get(asset.id);
    const rejected = expect(read).rejects.toThrow();
    f.requests[0]!.onblocked?.(new Event("blocked") as IDBVersionChangeEvent);
    await rejected;
    f.requests[0]!.onsuccess?.(new Event("success"));
    expect(f.db.close).toHaveBeenCalledOnce();
    expect(f.db.transaction).not.toHaveBeenCalled();
  });
  test("coalesces concurrent opening and keeps both independent transactions", async () => {
    const f = fixture();
    const first = f.store.get(asset.id);
    const second = f.store.get(asset.id);
    expect(f.open).toHaveBeenCalledOnce();
    await f.opened();
    for (const tx of f.transactions) f.finishRead(tx);
    await expect(Promise.all([first, second])).resolves.toEqual([asset, asset]);
  });
  test("a read request success is not success if its transaction later aborts", async () => {
    const f = fixture();
    const read = f.store.get(asset.id);
    const rejected = expect(read).rejects.toThrow();
    await f.opened();
    const tx = f.transactions[0]!;
    (tx as unknown as { read: IDBRequest }).read.onsuccess?.(new Event("success"));
    tx.onabort?.(new Event("abort"));
    await rejected;
  });
  test("a write resolves only on transaction completion", async () => {
    const f = fixture();
    let finished = false;
    const saving = f.store.put(asset).then(() => {
      finished = true;
    });
    await f.opened();
    await Promise.resolve();
    expect(finished).toBe(false);
    f.transactions[0]!.oncomplete?.(new Event("complete"));
    await saving;
    expect(finished).toBe(true);
  });
  test.each(["abort", "error"] as const)(
    "a transaction %s never reports saved",
    async (failure) => {
      const f = fixture();
      const saved = f.store.put(asset);
      const rejected = expect(saved).rejects.toThrow();
      await f.opened();
      if (failure === "abort") f.transactions[0]!.onabort?.(new Event("abort"));
      else f.transactions[0]!.onerror?.(new Event("error"));
      await rejected;
    },
  );
  test("version changes close the old connection and allow a clean reopen", async () => {
    const f = fixture();
    const first = f.store.get(asset.id);
    await f.opened();
    f.finishRead();
    await first;
    f.db.onversionchange?.(new Event("versionchange") as IDBVersionChangeEvent);
    expect(f.db.close).toHaveBeenCalledOnce();
    const second = f.store.get(asset.id);
    expect(f.open).toHaveBeenCalledTimes(2);
    await f.opened();
    f.finishRead();
    await expect(second).resolves.toEqual(asset);
  });
});
