import type { WorkbookSnapshot } from "@idea10/core/serialization";
import {
  WorkbookStoreError,
  type PersistedWorkbook,
  type WorkbookSaveReceipt,
  type WorkbookStore,
} from "./workbookStore";

const DATABASE_NAME = "idea10-workbook";
const DATABASE_VERSION = 1;
const STORE_NAME = "workbooks";
const CURRENT_WORKBOOK_KEY = "current";

function createUnavailableError(cause?: unknown): WorkbookStoreError {
  return new WorkbookStoreError("unavailable", { cause });
}

function createTransactionError(cause?: unknown): WorkbookStoreError {
  return cause instanceof DOMException && cause.name === "QuotaExceededError"
    ? new WorkbookStoreError("quota", { cause })
    : createUnavailableError(cause);
}

function isPersistedWorkbook(value: unknown): value is PersistedWorkbook {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(record.revision) &&
    (record.revision as number) >= 1 &&
    typeof record.savedAt === "number" &&
    Number.isFinite(record.savedAt) &&
    record.snapshot !== null &&
    typeof record.snapshot === "object" &&
    !Array.isArray(record.snapshot) &&
    Object.hasOwn(record, "snapshot")
  );
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(createUnavailableError());
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      callback();
    };
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      settle(() => reject(createUnavailableError(error)));
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onblocked = () => settle(() => reject(createUnavailableError()));
    request.onerror = () => settle(() => reject(createUnavailableError(request.error)));
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settle(() => resolve(request.result));
    };
  });
}

export function createIndexedDbWorkbookStore(): WorkbookStore {
  let databasePromise: Promise<IDBDatabase> | undefined;

  function getDatabase(): Promise<IDBDatabase> {
    if (!databasePromise) {
      databasePromise = openDatabase().then((database) => {
        database.onversionchange = () => {
          database.close();
          databasePromise = undefined;
        };
        return database;
      });
      void databasePromise.catch(() => {
        databasePromise = undefined;
      });
    }
    return databasePromise;
  }

  async function load(): Promise<PersistedWorkbook | undefined> {
    const database = await getDatabase();
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        callback();
      };
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(STORE_NAME, "readonly");
      } catch (error) {
        settle(() => reject(createUnavailableError(error)));
        return;
      }
      transaction.onerror = () => settle(() => reject(createTransactionError(transaction.error)));
      transaction.onabort = () => settle(() => reject(createTransactionError(transaction.error)));
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_WORKBOOK_KEY);
      request.onerror = () => settle(() => reject(createTransactionError(request.error)));
      request.onsuccess = () => {
        const record = request.result;
        if (record === undefined) {
          settle(() => resolve(undefined));
          return;
        }
        if (!isPersistedWorkbook(record)) {
          settle(() => reject(new WorkbookStoreError("invalid-record")));
          return;
        }
        settle(() =>
          resolve({
            revision: record.revision,
            savedAt: record.savedAt,
            snapshot: record.snapshot,
          }),
        );
      };
    });
  }

  async function save(
    snapshot: WorkbookSnapshot,
    expectedRevision: number | undefined,
  ): Promise<WorkbookSaveReceipt> {
    const database = await getDatabase();
    return new Promise((resolve, reject) => {
      let receipt: WorkbookSaveReceipt | undefined;
      let settled = false;
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        callback();
      };
      const fail = (error: WorkbookStoreError): void => {
        settle(() => reject(error));
        transaction.abort();
      };
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(STORE_NAME, "readwrite");
      } catch (error) {
        settle(() => reject(createUnavailableError(error)));
        return;
      }
      transaction.onerror = () => settle(() => reject(createTransactionError(transaction.error)));
      transaction.onabort = () => settle(() => reject(createTransactionError(transaction.error)));
      transaction.oncomplete = () => {
        if (receipt) {
          settle(() => resolve(receipt!));
        } else {
          settle(() => reject(createUnavailableError()));
        }
      };

      const getRequest = transaction.objectStore(STORE_NAME).get(CURRENT_WORKBOOK_KEY);
      getRequest.onerror = () => settle(() => reject(createTransactionError(getRequest.error)));
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (existing !== undefined && !isPersistedWorkbook(existing)) {
          fail(new WorkbookStoreError("invalid-record"));
          return;
        }
        const existingRevision = existing?.revision;
        if (existingRevision === Number.MAX_SAFE_INTEGER) {
          fail(new WorkbookStoreError("invalid-record"));
          return;
        }
        if (existingRevision !== expectedRevision) {
          fail(new WorkbookStoreError("conflict"));
          return;
        }
        const savedAt = Date.now();
        receipt = { revision: (existingRevision ?? 0) + 1, savedAt };
        const putRequest = transaction
          .objectStore(STORE_NAME)
          .put({ ...receipt, snapshot }, CURRENT_WORKBOOK_KEY);
        putRequest.onerror = () => settle(() => reject(createTransactionError(putRequest.error)));
      };
    });
  }

  async function replace(snapshot: WorkbookSnapshot): Promise<WorkbookSaveReceipt> {
    const database = await getDatabase();
    return new Promise((resolve, reject) => {
      let receipt: WorkbookSaveReceipt | undefined;
      let settled = false;
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        callback();
      };
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(STORE_NAME, "readwrite");
      } catch (error) {
        settle(() => reject(createUnavailableError(error)));
        return;
      }
      transaction.onerror = () => settle(() => reject(createTransactionError(transaction.error)));
      transaction.onabort = () => settle(() => reject(createTransactionError(transaction.error)));
      transaction.oncomplete = () => {
        if (receipt) {
          settle(() => resolve(receipt!));
        } else {
          settle(() => reject(createUnavailableError()));
        }
      };

      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(CURRENT_WORKBOOK_KEY);
      getRequest.onerror = () => settle(() => reject(createTransactionError(getRequest.error)));
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        const existingRevision =
          isPersistedWorkbook(existing) && existing.revision < Number.MAX_SAFE_INTEGER
            ? existing.revision
            : 0;
        const savedAt = Date.now();
        receipt = { revision: existingRevision + 1, savedAt };
        const putRequest = store.put({ ...receipt, snapshot }, CURRENT_WORKBOOK_KEY);
        putRequest.onerror = () => settle(() => reject(createTransactionError(putRequest.error)));
      };
    });
  }

  return { load, save, replace };
}
