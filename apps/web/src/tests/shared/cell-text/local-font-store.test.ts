import { afterEach, describe, expect, test, vi } from "vitest";
import {
  LOCAL_FONT_DATABASE,
  LOCAL_FONT_STORE,
  readStoredLocalSymbolFont,
  readStoredLocalSymbolFonts,
  saveStoredLocalSymbolFont,
  validStoredLocalSymbolFont,
  type StoredLocalSymbolFont,
} from "../../../shared/cell-text/local-font-store";

function asset(index = 1, size = 4): StoredLocalSymbolFont {
  return {
    version: 1,
    id: index.toString(16).padStart(64, "0"),
    source: "file",
    bytes: new ArrayBuffer(size),
  };
}

/** Small IDB event/transaction mock, not a browser or real storage self-test. */
function indexedDb(initial: readonly unknown[] = [], putError?: DOMException) {
  const data = new Map<string, unknown>();
  for (const record of initial) data.set((record as { id: string }).id, record);
  const close = vi.fn();
  const put = vi.fn();
  const modes: string[] = [];
  let created = false;
  const database = {
    close,
    onversionchange: null,
    objectStoreNames: { contains: () => created },
    createObjectStore: vi.fn(() => {
      created = true;
    }),
    transaction: vi.fn((_name: string, mode: string) => {
      modes.push(mode);
      let pending = 0;
      let aborted = false;
      let completed = false;
      const staged = new Map(data);
      const transaction = {
        error: null as DOMException | null,
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        onerror: null as ((event: { target: unknown }) => void) | null,
        abort() {
          if (aborted || completed) return;
          aborted = true;
          queueMicrotask(() => transaction.onabort?.());
        },
        objectStore: () => store,
      };
      function complete() {
        queueMicrotask(() => {
          if (!pending && !aborted && !completed) {
            completed = true;
            if (mode === "readwrite") {
              data.clear();
              for (const [key, value] of staged) data.set(key, value);
            }
            transaction.oncomplete?.();
          }
        });
      }
      function request(result: unknown, error?: DOMException) {
        pending++;
        const request = { result, error: error ?? null, onsuccess: null as (() => void) | null };
        queueMicrotask(() => {
          if (aborted) return;
          if (error) {
            transaction.error = error;
            transaction.onerror?.({ target: request });
            transaction.abort();
          } else request.onsuccess?.();
          pending--;
          complete();
        });
        return request;
      }
      const store = {
        get: (id: string) => request(staged.get(id)),
        put: (record: StoredLocalSymbolFont) => {
          put(record);
          if (!putError) staged.set(record.id, record);
          return request(record.id, putError);
        },
        openCursor: () => {
          const entries = [...staged.entries()];
          let index = 0;
          const cursorRequest = {
            result: undefined as unknown,
            onsuccess: null as (() => void) | null,
          };
          function advance() {
            pending++;
            queueMicrotask(() => {
              if (aborted) return;
              const entry = entries[index++];
              cursorRequest.result = entry
                ? { primaryKey: entry[0], value: entry[1], continue: advance }
                : null;
              cursorRequest.onsuccess?.();
              pending--;
              complete();
            });
          }
          advance();
          return cursorRequest;
        },
      };
      return transaction;
    }),
  };
  const open = vi.fn(() => {
    const request = {
      result: database,
      error: null,
      onupgradeneeded: null as (() => void) | null,
      onsuccess: null as (() => void) | null,
      onerror: null,
      onblocked: null,
    };
    queueMicrotask(() => {
      if (!created) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  });
  vi.stubGlobal("indexedDB", { open });
  return { data, close, put, modes, open, database };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bounded opt-in local font device storage", () => {
  test("does not touch IndexedDB until an explicit read/write call", () => {
    const db = indexedDb();
    expect(validStoredLocalSymbolFont(asset())).toBe(true);
    expect(db.open).not.toHaveBeenCalled();
  });

  test("writes only versioned font bytes/source/hash, in an atomic bounded transaction", async () => {
    const db = indexedDb();
    const record = asset();
    await saveStoredLocalSymbolFont(record);
    expect(db.open).toHaveBeenCalledWith(LOCAL_FONT_DATABASE, 1);
    expect(db.database.createObjectStore).toHaveBeenCalledWith(LOCAL_FONT_STORE, { keyPath: "id" });
    expect(db.modes).toEqual(["readwrite"]);
    expect(db.put).toHaveBeenCalledWith(record);
    expect(db.data.get(record.id)).toEqual(record);
    expect(db.close).toHaveBeenCalledOnce();
  });

  test("reads only the exact saved digest alias and returns missing aliases without guessing", async () => {
    const record = asset();
    const db = indexedDb([record]);
    expect(await readStoredLocalSymbolFont("font-family")).toBeUndefined();
    expect(db.open).not.toHaveBeenCalled();
    expect(await readStoredLocalSymbolFont(record.id)).toEqual(record);
    expect(await readStoredLocalSymbolFont(asset(2).id)).toBeUndefined();
    expect(db.modes).toEqual(["readonly", "readonly"]);
    expect(db.put).not.toHaveBeenCalled();
  });

  test("restores only valid bounded versioned records without rewriting them", async () => {
    const records = [asset(1), asset(2)];
    const db = indexedDb(records);
    expect(await readStoredLocalSymbolFonts()).toEqual(records);
    expect(db.modes).toEqual(["readonly"]);
    expect(db.put).not.toHaveBeenCalled();
  });

  test("rejects a thirteenth remembered face but allows replacing an existing face", async () => {
    const records = Array.from({ length: 12 }, (_, index) => asset(index + 1));
    const db = indexedDb(records);
    await expect(saveStoredLocalSymbolFont(asset(13))).rejects.toMatchObject({
      code: "storage-limit",
    });
    expect(db.put).not.toHaveBeenCalled();
    await saveStoredLocalSymbolFont(asset(2, 8));
    expect(db.data.size).toBe(12);
    expect((db.data.get(asset(2).id) as StoredLocalSymbolFont).bytes.byteLength).toBe(8);
  });

  test("enforces 128 MiB aggregate storage and 64 MiB per asset", async () => {
    const db = indexedDb([asset(1, 64 * 1024 * 1024), asset(2, 64 * 1024 * 1024)]);
    await expect(saveStoredLocalSymbolFont(asset(3))).rejects.toMatchObject({
      code: "storage-limit",
    });
    expect(db.put).not.toHaveBeenCalled();
    expect(validStoredLocalSymbolFont(asset(3, 64 * 1024 * 1024 + 1))).toBe(false);
  });

  test("corrupt remembered record/version rejects rather than supplying fake font coverage", async () => {
    const invalid = { ...asset(), version: 2 };
    const db = indexedDb([invalid]);
    await expect(readStoredLocalSymbolFonts()).rejects.toMatchObject({ code: "storage-corrupt" });
    await expect(readStoredLocalSymbolFont(asset().id)).rejects.toMatchObject({
      code: "storage-corrupt",
    });
    await expect(saveStoredLocalSymbolFont(asset(2))).rejects.toMatchObject({
      code: "storage-corrupt",
    });
    expect(db.put).not.toHaveBeenCalled();
  });

  test("quota failures stay distinct and leave previously stored records unchanged", async () => {
    const db = indexedDb([asset(1)], new DOMException("Full", "QuotaExceededError"));
    await expect(saveStoredLocalSymbolFont(asset(2))).rejects.toMatchObject({
      code: "storage-quota",
    });
    expect(db.data.size).toBe(1);
    expect(db.data.has(asset(2).id)).toBe(false);
  });

  test("unavailable/blocked storage reports a stable error without polling or new permissions", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(readStoredLocalSymbolFonts()).rejects.toMatchObject({
      code: "storage-unavailable",
    });
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
    await expect(saveStoredLocalSymbolFont(asset())).rejects.toMatchObject({
      code: "storage-unavailable",
    });
  });
});
