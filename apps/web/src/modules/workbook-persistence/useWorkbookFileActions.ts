import { computed, onBeforeUnmount, onMounted, readonly, ref, shallowRef } from "vue";
import type { Workbook } from "@sheetcraft/core/workbook";
import type { ImageAssetStore } from "../image-assets/imageAssetStore";
import type { MessageKey } from "../../shared/i18n";
import type { useWorkbookPersistence } from "./useWorkbookPersistence";
import {
  downloadWorkbookBundle,
  downloadWorkbookJson,
  readWorkbookBundleFile,
  readWorkbookFile,
  WorkbookFileError,
} from "./workbookJsonTransfer";

export type WorkbookFileConfirmation = "import" | "reload" | "reset";
export type WorkbookFileFeedback = { key: MessageKey; error: boolean };

export function useWorkbookFileActions(options: {
  persistence: ReturnType<typeof useWorkbookPersistence>;
  getWorkbook: () => Workbook;
  flushPendingEdits: () => boolean;
  hasPendingEdits: () => boolean;
  isBlocked?: () => boolean;
  assetStore?: ImageAssetStore;
}) {
  const { persistence } = options;
  const busy = ref(false);
  const confirmation = ref<WorkbookFileConfirmation>();
  const pendingImport = shallowRef<Workbook>();
  const feedback = ref<WorkbookFileFeedback>();
  const canReset = computed(
    () =>
      persistence.error.value === "invalid-record" ||
      persistence.error.value === "invalid-snapshot" ||
      feedback.value?.key === "persistence.resetFailed",
  );
  let disposed = false;

  function flushEdits(): boolean {
    if (options.flushPendingEdits()) return true;
    feedback.value = { key: "persistence.finishEditing", error: true };
    return false;
  }

  async function save(): Promise<void> {
    if (options.isBlocked?.()) return;
    if (busy.value || persistence.loading.value || confirmation.value || !flushEdits()) return;
    feedback.value = undefined;
    await persistence.saveNow();
  }

  async function exportJson(): Promise<void> {
    if (options.isBlocked?.()) return;
    if (busy.value || persistence.loading.value || confirmation.value || !flushEdits()) return;
    try {
      if (options.assetStore)
        await downloadWorkbookBundle(options.getWorkbook(), options.assetStore);
      else downloadWorkbookJson(options.getWorkbook());
      feedback.value = { key: "persistence.exportStarted", error: false };
    } catch {
      feedback.value = { key: "persistence.exportFailed", error: true };
    }
  }

  async function importJson(file: Pick<File, "text">): Promise<void> {
    if (options.isBlocked?.()) return;
    if (busy.value || persistence.loading.value || confirmation.value || !flushEdits()) return;
    busy.value = true;
    feedback.value = undefined;
    try {
      const workbook = options.assetStore
        ? await readWorkbookBundleFile(file, options.assetStore)
        : await readWorkbookFile(file);
      if (disposed) return;
      pendingImport.value = workbook;
      confirmation.value = "import";
    } catch (error) {
      if (disposed) return;
      feedback.value = {
        key:
          error instanceof WorkbookFileError && error.code === "read-failed"
            ? "persistence.readFailed"
            : "persistence.invalidJson",
        error: true,
      };
    } finally {
      busy.value = false;
    }
  }

  function requestReload(): void {
    if (options.isBlocked?.()) return;
    if (busy.value || persistence.loading.value || confirmation.value || !flushEdits()) return;
    feedback.value = undefined;
    confirmation.value = "reload";
  }

  function cancel(): void {
    if (busy.value) return;
    confirmation.value = undefined;
    pendingImport.value = undefined;
  }

  function requestReset(): void {
    if (options.isBlocked?.() || !canReset.value) return;
    if (busy.value || persistence.loading.value || confirmation.value || !flushEdits()) return;
    confirmation.value = "reset";
  }

  async function confirm(): Promise<void> {
    if (options.isBlocked?.()) return;
    if (busy.value || !confirmation.value || !flushEdits()) return;
    busy.value = true;
    try {
      if (confirmation.value === "import" && pendingImport.value) {
        await persistence.replaceDocument(pendingImport.value);
        feedback.value = { key: "persistence.imported", error: false };
      } else if (confirmation.value === "reset") {
        const reset = await persistence.resetDocument();
        feedback.value = {
          key: reset ? "persistence.resetDone" : "persistence.resetFailed",
          error: !reset,
        };
      } else if (confirmation.value === "reload") {
        const loaded = await persistence.reload();
        feedback.value = {
          key: loaded ? "persistence.restored" : "persistence.reloadFailed",
          error: !loaded,
        };
      }
    } finally {
      busy.value = false;
      confirmation.value = undefined;
      pendingImport.value = undefined;
    }
  }

  function saveBeforeLeaving(): void {
    if (options.isBlocked?.()) return;
    if (!persistence.loading.value && !busy.value && options.flushPendingEdits()) {
      void persistence.saveNow();
    }
  }

  function onBeforeUnload(event: BeforeUnloadEvent): void {
    const needsWarning = persistence.dirty.value || options.hasPendingEdits();
    saveBeforeLeaving();
    if (needsWarning) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "hidden") saveBeforeLeaving();
  }

  function onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!event.repeat) void save();
    }
  }

  onMounted(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", saveBeforeLeaving);
    window.addEventListener("keydown", onKeydown, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onBeforeUnmount(() => {
    disposed = true;
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("pagehide", saveBeforeLeaving);
    window.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  return {
    busy: readonly(busy),
    confirmation: readonly(confirmation),
    feedback: readonly(feedback),
    canReset,
    save,
    exportJson,
    importJson,
    requestReload,
    requestReset,
    confirm,
    cancel,
  };
}
