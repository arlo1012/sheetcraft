import type { WorkbookSnapshot } from "@sheetcraft/core/serialization";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createIndexedDbWorkbookStore } from "../../../../modules/workbook-persistence/indexedDbWorkbookStore";

type Request<T> = {
  result: T;
  onerror: ((event: Event) => unknown) | null;
  onsuccess: ((event: Event) => unknown) | null;
};

function validRecord(revision: number) {
  return { revision, savedAt: 10, snapshot: {} };
}

function installDatabase(existing: unknown) {
  const abort = vi.fn();
  const put = vi.fn(() => {
    const request = { onerror: null } as unknown as IDBRequest<IDBValidKey>;
    queueMicrotask(() => transaction.oncomplete?.(new Event("complete")));
    return request;
  });
  const store = {
    get: vi.fn(() => {
      const request: Request<unknown> = { result: existing, onerror: null, onsuccess: null };
      queueMicrotask(() => request.onsuccess?.(new Event("success")));
      return request as unknown as IDBRequest<unknown>;
    }),
    put,
  } as unknown as IDBObjectStore;
  const transaction = {
    abort,
    objectStore: vi.fn(() => store),
    onabort: null,
    oncomplete: null,
    onerror: null,
  } as unknown as IDBTransaction;
  const database = {
    close: vi.fn(),
    objectStoreNames: { contains: vi.fn(() => true) },
    transaction: vi.fn(() => transaction),
  } as unknown as IDBDatabase;
  const openRequest = {
    onblocked: null,
    onerror: null,
    onupgradeneeded: null,
    onsuccess: null,
    result: database,
  } as unknown as IDBOpenDBRequest;

  vi.stubGlobal("indexedDB", {
    open: vi.fn(() => {
      queueMicrotask(() => openRequest.onsuccess?.(new Event("success")));
      return openRequest;
    }),
  });

  return { abort, put };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("IndexedDB workbook store", () => {
  test("rejects a blocked open even when the request error getter cannot be read", async () => {
    const request = {
      onblocked: null,
      onerror: null,
      onupgradeneeded: null,
      onsuccess: null,
    } as unknown as IDBOpenDBRequest;
    Object.defineProperty(request, "error", {
      get: () => {
        throw new DOMException("Pending request", "InvalidStateError");
      },
    });
    vi.stubGlobal("indexedDB", { open: vi.fn(() => request) });

    const loading = createIndexedDbWorkbookStore().load();
    request.onblocked?.(new Event("blocked") as IDBVersionChangeEvent);

    await expect(loading).rejects.toMatchObject({ code: "unavailable" });
  });

  test("does not overflow a normal save revision", async () => {
    const { abort, put } = installDatabase(validRecord(Number.MAX_SAFE_INTEGER));

    await expect(
      createIndexedDbWorkbookStore().save({} as WorkbookSnapshot, Number.MAX_SAFE_INTEGER),
    ).rejects.toMatchObject({ code: "invalid-record" });

    expect(abort).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });

  test("recovers a maximum revision through an explicit replacement", async () => {
    const { put } = installDatabase(validRecord(Number.MAX_SAFE_INTEGER));

    const receipt = await createIndexedDbWorkbookStore().replace({} as WorkbookSnapshot);

    expect(receipt.revision).toBe(1);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }), "current");
  });
});
