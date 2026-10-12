import {
  assertWorkbookShapeSupport,
  UnsupportedShapeFrameDocumentError,
} from "../sheet-drawings/shape-document-support";
import {
  assertWorkbookPictureSupport,
  UnsupportedPictureDocumentError,
} from "../sheet-images/picture-document-support";
import { UnsupportedPicturePaintError } from "../sheet-images/picture-paint-effects";
import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from "vue";
import { WorkbookDomainError } from "@sheetcraft/core/errors";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbook, type Workbook } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { WorkbookStoreError, type PersistedWorkbook, type WorkbookStore } from "./workbookStore";

export type WorkbookPersistenceError =
  | "unavailable"
  | "invalid-snapshot"
  | "unsupported-picture-frame"
  | "unsupported-shape-frame"
  | "invalid-record"
  | "conflict"
  | "quota";

export type WorkbookPersistenceStatus =
  | "loading"
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error";

export type UseWorkbookPersistenceOptions = {
  store: WorkbookStore;
  getWorkbook: () => Workbook;
  getRevision: () => number;
  replaceWorkbook: (workbook: Workbook) => void;
  debounceMs?: number;
};

type SaveRequest = {
  revision: number;
  snapshot: ReturnType<typeof serializeWorkbook>;
};

type LoadResult = "loaded" | "empty" | "failed";

const DEFAULT_DEBOUNCE_MS = 300;

function isPersistedWorkbook(value: unknown): value is PersistedWorkbook {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<PersistedWorkbook>;
  return (
    Number.isSafeInteger(record.revision) &&
    (record.revision ?? -1) >= 1 &&
    typeof record.savedAt === "number" &&
    Number.isFinite(record.savedAt) &&
    "snapshot" in record
  );
}

function toPersistenceError(
  error: unknown,
  fallback: WorkbookPersistenceError,
): WorkbookPersistenceError {
  if (error instanceof UnsupportedShapeFrameDocumentError) return "unsupported-shape-frame";
  if (
    error instanceof UnsupportedPictureDocumentError ||
    error instanceof UnsupportedPicturePaintError
  )
    return "unsupported-picture-frame";
  if (error instanceof WorkbookStoreError) {
    return error.code;
  }
  if (error instanceof WorkbookDomainError) {
    return "invalid-snapshot";
  }
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "quota";
  }
  return fallback;
}

export function useWorkbookPersistence(options: UseWorkbookPersistenceOptions): {
  ready: Promise<void>;
  loading: Ref<boolean>;
  dirty: Ref<boolean>;
  status: ComputedRef<WorkbookPersistenceStatus>;
  error: Ref<WorkbookPersistenceError | undefined>;
  savedAt: Ref<number | undefined>;
  saveNow: () => Promise<boolean>;
  reload: () => Promise<boolean>;
  replaceDocument: (workbook: Workbook) => Promise<void>;
  resetDocument: () => Promise<boolean>;
} {
  const loading = ref(true);
  const dirty = ref(false);
  const saving = ref(false);
  const error = ref<WorkbookPersistenceError>();
  const savedAt = ref<number>();
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const status = computed<WorkbookPersistenceStatus>(() => {
    if (loading.value) return "loading";
    if (saving.value) return "saving";
    if (error.value) return "error";
    if (dirty.value) return "pending";
    return savedAt.value === undefined ? "idle" : "saved";
  });

  let knownUnsupportedPictureRecovery:
    | "unsupported-picture-frame"
    | "unsupported-shape-frame"
    | undefined;
  let expectedRevision: number | undefined;
  let saveRequest: SaveRequest | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let drainPromise: Promise<boolean> | undefined;
  let suppressRevisionWatch = false;
  let automaticSavingBlocked = false;
  let disposed = false;
  let documentOperationTail: Promise<void> = Promise.resolve();
  const initialRevision = options.getRevision();

  function queueDocumentOperation<T>(operation: () => Promise<T>): Promise<T> {
    const task = documentOperationTail.then(operation, operation);
    documentOperationTail = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  function clearSaveTimer(): void {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
  }

  function cancelQueuedSave(): void {
    clearSaveTimer();
    saveRequest = undefined;
  }

  function queueCurrentSnapshot(): void {
    saveRequest = {
      revision: options.getRevision(),
      snapshot: serializeWorkbook(options.getWorkbook()),
    };
  }

  function blockAutomaticSaving(nextError: WorkbookPersistenceError): void {
    if (nextError === "unsupported-picture-frame" || nextError === "unsupported-shape-frame")
      knownUnsupportedPictureRecovery = nextError;
    error.value = knownUnsupportedPictureRecovery ?? nextError;
    automaticSavingBlocked = true;
    cancelQueuedSave();
  }

  function scheduleSave(): void {
    if (disposed || loading.value || automaticSavingBlocked) {
      return;
    }
    clearSaveTimer();
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      if (!dirty.value) {
        return;
      }
      queueCurrentSnapshot();
      void drainSaveQueue();
    }, debounceMs);
  }

  async function drainSaveQueue(): Promise<boolean> {
    if (drainPromise) {
      return drainPromise;
    }

    drainPromise = (async () => {
      let saved = true;
      while (saveRequest && !automaticSavingBlocked && !disposed) {
        const request = saveRequest;
        saveRequest = undefined;
        saving.value = true;
        try {
          const receipt = await options.store.save(request.snapshot, expectedRevision);
          if (disposed) {
            saved = false;
            break;
          }
          expectedRevision = receipt.revision;
          savedAt.value = receipt.savedAt;
          error.value = undefined;
          automaticSavingBlocked = false;
          if (options.getRevision() === request.revision && !saveRequest) {
            dirty.value = false;
          } else {
            dirty.value = true;
            if (!saveRequest) {
              queueCurrentSnapshot();
            }
          }
        } catch (cause) {
          saved = false;
          if (!disposed) {
            blockAutomaticSaving(toPersistenceError(cause, "unavailable"));
          }
        } finally {
          saving.value = false;
        }
      }
      return saved && !dirty.value && error.value === undefined;
    })();

    try {
      return await drainPromise;
    } finally {
      drainPromise = undefined;
    }
  }

  async function waitForActiveSave(): Promise<void> {
    if (drainPromise) {
      await drainPromise;
    }
  }

  function replaceFromPersistence(workbook: Workbook): void {
    if (disposed) {
      return;
    }
    suppressRevisionWatch = true;
    try {
      options.replaceWorkbook(workbook);
    } finally {
      suppressRevisionWatch = false;
    }
  }

  async function loadFromStore(revisionAtStart: number): Promise<LoadResult> {
    try {
      const record = await options.store.load();
      if (disposed) {
        return "failed";
      }
      if (options.getRevision() !== revisionAtStart) {
        // A local draft conflict cannot make an unsupported saved document replaceable.
        // Inspect a valid record read-only before reporting the draft conflict.
        if (isPersistedWorkbook(record)) {
          try {
            const saved = deserializeWorkbook(record.snapshot);
            assertWorkbookShapeSupport(saved);
            assertWorkbookPictureSupport(saved);
          } catch (cause) {
            if (
              cause instanceof UnsupportedShapeFrameDocumentError ||
              cause instanceof UnsupportedPictureDocumentError ||
              cause instanceof UnsupportedPicturePaintError
            )
              throw cause;
          }
        }
        blockAutomaticSaving("conflict");
        dirty.value = true;
        return "failed";
      }
      if (record === undefined) {
        knownUnsupportedPictureRecovery = undefined;
        expectedRevision = undefined;
        savedAt.value = undefined;
        error.value = undefined;
        automaticSavingBlocked = false;
        return "empty";
      }
      if (!isPersistedWorkbook(record)) {
        blockAutomaticSaving("invalid-record");
        return "failed";
      }
      expectedRevision = record.revision;
      const workbook = deserializeWorkbook(record.snapshot);
      assertWorkbookShapeSupport(workbook);
      assertWorkbookPictureSupport(workbook);
      replaceFromPersistence(workbook);
      knownUnsupportedPictureRecovery = undefined;
      expectedRevision = record.revision;
      savedAt.value = record.savedAt;
      dirty.value = false;
      error.value = undefined;
      automaticSavingBlocked = false;
      return "loaded";
    } catch (cause) {
      if (disposed) {
        return "failed";
      }
      blockAutomaticSaving(toPersistenceError(cause, "unavailable"));
      return "failed";
    }
  }

  async function initialize(): Promise<void> {
    await loadFromStore(initialRevision);
    if (!disposed) {
      loading.value = false;
    }
  }

  const ready = queueDocumentOperation(initialize);

  watch(
    () => options.getRevision(),
    (revision, previousRevision) => {
      if (suppressRevisionWatch || revision === previousRevision) {
        return;
      }
      dirty.value = true;
      scheduleSave();
    },
    { flush: "sync" },
  );

  async function saveCurrentWorkbook(): Promise<boolean> {
    if (disposed) {
      return false;
    }
    if (
      knownUnsupportedPictureRecovery ||
      error.value === "conflict" ||
      error.value === "invalid-record" ||
      error.value === "invalid-snapshot" ||
      error.value === "unsupported-picture-frame" ||
      error.value === "unsupported-shape-frame"
    ) {
      return false;
    }
    automaticSavingBlocked = false;
    clearSaveTimer();
    if (
      !dirty.value &&
      !saveRequest &&
      !drainPromise &&
      error.value === undefined &&
      (expectedRevision !== undefined || savedAt.value !== undefined)
    ) {
      return true;
    }
    queueCurrentSnapshot();
    return drainSaveQueue();
  }

  async function saveNow(): Promise<boolean> {
    await ready;
    await documentOperationTail;
    return saveCurrentWorkbook();
  }

  async function reload(): Promise<boolean> {
    return queueDocumentOperation(async () => {
      if (disposed) {
        return false;
      }
      loading.value = true;
      cancelQueuedSave();
      await waitForActiveSave();
      const result = await loadFromStore(options.getRevision());
      if (!disposed) {
        loading.value = false;
      }
      return result === "loaded";
    });
  }

  function assertStoredPictureRecoveryCanBeReplaced(): void {
    if (
      knownUnsupportedPictureRecovery === "unsupported-shape-frame" ||
      error.value === "unsupported-shape-frame"
    )
      throw new UnsupportedShapeFrameDocumentError("saved-recovery", []);
    if (knownUnsupportedPictureRecovery || error.value === "unsupported-picture-frame")
      throw new UnsupportedPictureDocumentError("saved-recovery", []);
  }

  async function replaceDocument(workbook: Workbook): Promise<void> {
    assertStoredPictureRecoveryCanBeReplaced();
    assertWorkbookShapeSupport(workbook);
    assertWorkbookPictureSupport(workbook);
    await queueDocumentOperation(async () => {
      if (disposed) {
        return;
      }
      await waitForActiveSave();
      if (disposed) return;
      assertStoredPictureRecoveryCanBeReplaced();
      assertWorkbookShapeSupport(workbook);
      assertWorkbookPictureSupport(workbook);
      loading.value = true;
      cancelQueuedSave();
      if (disposed) {
        return;
      }
      try {
        replaceFromPersistence(workbook);
        dirty.value = true;
        savedAt.value = undefined;
        const request: SaveRequest = {
          revision: options.getRevision(),
          snapshot: serializeWorkbook(options.getWorkbook()),
        };
        const receipt = await options.store.replace(request.snapshot);
        if (disposed) {
          return;
        }
        expectedRevision = receipt.revision;
        savedAt.value = receipt.savedAt;
        error.value = undefined;
        automaticSavingBlocked = false;
        if (options.getRevision() === request.revision) {
          dirty.value = false;
        } else {
          dirty.value = true;
        }
      } catch (cause) {
        if (!disposed) {
          blockAutomaticSaving(toPersistenceError(cause, "unavailable"));
          dirty.value = true;
        }
      } finally {
        if (!disposed) {
          loading.value = false;
          if (dirty.value && error.value === undefined) {
            scheduleSave();
          }
        }
      }
    });
  }

  async function resetDocument(): Promise<boolean> {
    if (knownUnsupportedPictureRecovery || error.value === "unsupported-picture-frame")
      return false;
    return queueDocumentOperation(async () => {
      if (
        disposed ||
        knownUnsupportedPictureRecovery ||
        error.value === "unsupported-picture-frame" ||
        error.value === "unsupported-shape-frame"
      )
        return false;
      loading.value = true;
      cancelQueuedSave();
      await waitForActiveSave();
      try {
        if (disposed) return false;
        const workbook = createWorkbook({ idFactory: createBrowserIdFactory() });
        const receipt = await options.store.replace(serializeWorkbook(workbook));
        if (disposed) return false;
        replaceFromPersistence(workbook);
        expectedRevision = receipt.revision;
        savedAt.value = receipt.savedAt;
        error.value = undefined;
        automaticSavingBlocked = false;
        dirty.value = false;
        return true;
      } catch (cause) {
        if (!disposed) blockAutomaticSaving(toPersistenceError(cause, "unavailable"));
        return false;
      } finally {
        if (!disposed) loading.value = false;
      }
    });
  }

  onScopeDispose(() => {
    disposed = true;
    cancelQueuedSave();
  });

  return {
    ready,
    loading,
    dirty,
    status,
    error,
    savedAt,
    saveNow,
    reload,
    replaceDocument,
    resetDocument,
  };
}
