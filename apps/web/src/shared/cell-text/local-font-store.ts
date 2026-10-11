import {
  LOCAL_FONT_MAX_BYTES,
  LocalSymbolFontError,
  type LocalSymbolFontErrorCode,
} from "./local-font-errors";

export const LOCAL_FONT_DATABASE = "sheetcraft.local-symbol-fonts.v1";
export const LOCAL_FONT_STORE = "fonts";
export const LOCAL_FONT_STORED_LIMIT = 12;
export const LOCAL_FONT_STORAGE_BYTES_LIMIT = 128 * 1024 * 1024;
export type StoredLocalSymbolFont = Readonly<{
  version: 1;
  id: string;
  source: "system" | "file";
  bytes: ArrayBuffer;
}>;

export function validStoredLocalSymbolFont(value: unknown): value is StoredLocalSymbolFont {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.id === "string" &&
    /^[a-f0-9]{64}$/.test(record.id) &&
    (record.source === "system" || record.source === "file") &&
    record.bytes instanceof ArrayBuffer &&
    record.bytes.byteLength > 0 &&
    record.bytes.byteLength <= LOCAL_FONT_MAX_BYTES
  );
}

function storageFailure(error: unknown): LocalSymbolFontError {
  if (error instanceof LocalSymbolFontError) return error;
  return new LocalSymbolFontError(
    error && typeof error === "object" && "name" in error && error.name === "QuotaExceededError"
      ? "storage-quota"
      : "storage-unavailable",
  );
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new LocalSymbolFontError("storage-unavailable"));
      return;
    }
    let request: IDBOpenDBRequest;
    let settled = false;
    try {
      request = indexedDB.open(LOCAL_FONT_DATABASE, 1);
    } catch (error) {
      reject(storageFailure(error));
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LOCAL_FONT_STORE))
        request.result.createObjectStore(LOCAL_FONT_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      settled = true;
      reject(storageFailure(request.error));
    };
    request.onblocked = () => {
      settled = true;
      reject(new LocalSymbolFontError("storage-unavailable"));
    };
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    result: (value: T) => void,
    fail: (code: LocalSymbolFontErrorCode) => void,
  ) => void,
): Promise<T> {
  const database = await openStore();
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    let value: T;
    let hasResult = false;
    let failure: LocalSymbolFontError | undefined;
    try {
      transaction = database.transaction(LOCAL_FONT_STORE, mode);
      transaction.oncomplete = () => {
        database.close();
        if (failure) reject(failure);
        else if (hasResult) resolve(value);
        else reject(new LocalSymbolFontError("storage-unavailable"));
      };
      transaction.onabort = () => {
        database.close();
        reject(failure ?? storageFailure(transaction.error));
      };
      transaction.onerror = (event) => {
        const request = event.target as IDBRequest | null;
        failure ??= storageFailure(request?.error ?? transaction.error);
      };
      operation(
        transaction.objectStore(LOCAL_FONT_STORE),
        (next) => {
          value = next;
          hasResult = true;
        },
        (code) => {
          failure = new LocalSymbolFontError(code);
          transaction.abort();
        },
      );
    } catch (error) {
      database.close();
      reject(storageFailure(error));
    }
  });
}

/** Only used after explicit opt-in; the atomic transaction also bounds concurrent tabs. */
export function saveStoredLocalSymbolFont(record: StoredLocalSymbolFont): Promise<void> {
  if (!validStoredLocalSymbolFont(record))
    return Promise.reject(new LocalSymbolFontError("storage-corrupt"));
  return transact<void>("readwrite", (store, result, fail) => {
    let count = 0;
    let total = 0;
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) {
        if (
          count + 1 > LOCAL_FONT_STORED_LIMIT ||
          total + record.bytes.byteLength > LOCAL_FONT_STORAGE_BYTES_LIMIT
        ) {
          fail("storage-limit");
          return;
        }
        store.put(record).onsuccess = () => result(undefined);
        return;
      }
      if (!validStoredLocalSymbolFont(current.value) || current.primaryKey !== current.value.id) {
        fail("storage-corrupt");
        return;
      }
      if (current.value.id !== record.id) {
        count++;
        total += current.value.bytes.byteLength;
      }
      if (count >= LOCAL_FONT_STORED_LIMIT || total > LOCAL_FONT_STORAGE_BYTES_LIMIT) {
        fail("storage-limit");
        return;
      }
      current.continue();
    };
  });
}

export function readStoredLocalSymbolFont(id: string): Promise<StoredLocalSymbolFont | undefined> {
  if (!/^[a-f0-9]{64}$/.test(id)) return Promise.resolve(undefined);
  return transact("readonly", (store, result, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result === undefined) result(undefined);
      else if (!validStoredLocalSymbolFont(request.result) || request.result.id !== id)
        fail("storage-corrupt");
      else result(request.result);
    };
  });
}

export function readStoredLocalSymbolFonts(): Promise<readonly StoredLocalSymbolFont[]> {
  return transact("readonly", (store, result, fail) => {
    const records: StoredLocalSymbolFont[] = [];
    let total = 0;
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) {
        result(records);
        return;
      }
      if (!validStoredLocalSymbolFont(current.value) || current.primaryKey !== current.value.id) {
        fail("storage-corrupt");
        return;
      }
      records.push(current.value);
      total += current.value.bytes.byteLength;
      if (records.length > LOCAL_FONT_STORED_LIMIT || total > LOCAL_FONT_STORAGE_BYTES_LIMIT) {
        fail("storage-limit");
        return;
      }
      current.continue();
    };
  });
}
