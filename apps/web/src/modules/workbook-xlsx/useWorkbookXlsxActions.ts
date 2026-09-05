import { onScopeDispose, readonly, ref, shallowRef } from "vue";
import {
  deserializeWorkbook,
  serializeWorkbook,
  type WorkbookSnapshot,
} from "@idea10/core/serialization";
import type { Workbook } from "@idea10/core/workbook";
import type { useWorkbookPersistence } from "../workbook-persistence/useWorkbookPersistence";
import type { XlsxCompatibilityReport } from "./xlsxWorkerProtocol";
import {
  createWorkbookXlsxWorker,
  runXlsxWorker,
  XlsxWorkerAbortError,
  XlsxWorkerFailure,
  XlsxWorkerTimeoutError,
  type XlsxWorkerFactory,
} from "./workbookXlsxWorker";

export type XlsxFeedbackKey =
  | "xlsx.feedback.blocked"
  | "xlsx.feedback.exported"
  | "xlsx.feedback.failed"
  | "xlsx.feedback.finishEditing"
  | "xlsx.feedback.imported"
  | "xlsx.feedback.stale"
  | "xlsx.feedback.timeout";

export type XlsxFeedback = { key: XlsxFeedbackKey; error: boolean };
export type XlsxConfirmation = "import" | "export";

type PendingImport = {
  workbook: Workbook;
  workbookAtStart: Workbook;
  revisionAtStart: number;
};

type PendingExport = { bytes: Uint8Array };

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_XLSX_FILE_BYTES = 25 * 1024 * 1024;

function hasBlockingIssue(report: XlsxCompatibilityReport): boolean {
  return report.issues.some((issue) => issue.severity === "block");
}

function downloadXlsx(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useWorkbookXlsxActions(options: {
  persistence: ReturnType<typeof useWorkbookPersistence>;
  getWorkbook: () => Workbook;
  getRevision: () => number;
  flushPendingEdits: () => boolean;
  hasPendingEdits: () => boolean;
  isBlocked?: () => boolean;
  workerFactory?: XlsxWorkerFactory;
  download?: (bytes: Uint8Array, filename: string) => void | Promise<void>;
  timeoutMs?: number;
}) {
  const busy = ref(false);
  const confirmation = ref<XlsxConfirmation>();
  const feedback = ref<XlsxFeedback>();
  const report = ref<XlsxCompatibilityReport>();
  const pendingImport = shallowRef<PendingImport>();
  const pendingExport = shallowRef<PendingExport>();
  const workerFactory = options.workerFactory ?? createWorkbookXlsxWorker;
  const download = options.download ?? downloadXlsx;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let requestNumber = 0;
  let disposed = false;
  let abortController: AbortController | undefined;

  function isBlocked(): boolean {
    return Boolean(
      options.isBlocked?.() ||
      options.persistence.loading.value ||
      busy.value ||
      confirmation.value,
    );
  }

  function clearPending(): void {
    confirmation.value = undefined;
    pendingImport.value = undefined;
    pendingExport.value = undefined;
  }

  function canApplyImport(pending: PendingImport): boolean {
    return (
      !disposed &&
      !options.isBlocked?.() &&
      options.getWorkbook() === pending.workbookAtStart &&
      options.getRevision() === pending.revisionAtStart &&
      !options.hasPendingEdits()
    );
  }

  function prepare(): boolean {
    if (isBlocked()) return false;
    feedback.value = undefined;
    report.value = undefined;
    if (options.flushPendingEdits()) return true;
    feedback.value = { key: "xlsx.feedback.finishEditing", error: true };
    return false;
  }

  function setFailure(error: unknown): void {
    if (error instanceof XlsxWorkerAbortError || disposed) return;
    if (error instanceof XlsxWorkerFailure && error.report) report.value = error.report;
    feedback.value = {
      key:
        error instanceof XlsxWorkerTimeoutError ? "xlsx.feedback.timeout" : "xlsx.feedback.failed",
      error: true,
    };
  }

  async function importXlsx(file: Pick<File, "arrayBuffer" | "size">): Promise<void> {
    if (!prepare()) return;
    const workbookAtStart = options.getWorkbook();
    const revisionAtStart = options.getRevision();
    const requestId = `xlsx-import-${++requestNumber}`;
    busy.value = true;
    feedback.value = undefined;
    report.value = undefined;
    abortController = new AbortController();
    try {
      if (file.size > MAX_XLSX_FILE_BYTES) {
        report.value = {
          issues: [
            {
              code: "archive-limit",
              severity: "block",
              count: 1,
              locations: [],
            },
          ],
        };
        feedback.value = { key: "xlsx.feedback.blocked", error: true };
        return;
      }
      const bytes = await file.arrayBuffer();
      if (abortController.signal.aborted) throw new XlsxWorkerAbortError();
      const response = await runXlsxWorker(
        workerFactory,
        { id: requestId, type: "decode", bytes },
        { timeoutMs, signal: abortController.signal },
      );
      if (disposed || response.type !== "decode") return;
      report.value = response.report;
      if (hasBlockingIssue(response.report)) {
        feedback.value = { key: "xlsx.feedback.blocked", error: true };
        return;
      }
      const pending = {
        workbook: deserializeWorkbook(response.snapshot),
        workbookAtStart,
        revisionAtStart,
      } satisfies PendingImport;
      if (!canApplyImport(pending)) {
        feedback.value = { key: "xlsx.feedback.stale", error: true };
        return;
      }
      pendingImport.value = pending;
      confirmation.value = "import";
    } catch (error) {
      setFailure(error);
    } finally {
      abortController = undefined;
      busy.value = false;
    }
  }

  async function exportXlsx(): Promise<void> {
    if (!prepare()) return;
    const snapshot: WorkbookSnapshot = serializeWorkbook(options.getWorkbook());
    const requestId = `xlsx-export-${++requestNumber}`;
    busy.value = true;
    feedback.value = undefined;
    report.value = undefined;
    abortController = new AbortController();
    try {
      const response = await runXlsxWorker(
        workerFactory,
        { id: requestId, type: "encode", snapshot },
        { timeoutMs, signal: abortController.signal },
      );
      if (disposed || response.type !== "encode") return;
      report.value = response.report;
      if (hasBlockingIssue(response.report)) {
        feedback.value = { key: "xlsx.feedback.blocked", error: true };
        return;
      }
      const bytes = new Uint8Array(response.bytes);
      if (response.report.issues.length > 0) {
        pendingExport.value = { bytes };
        confirmation.value = "export";
        return;
      }
      await download(bytes, "workbook.xlsx");
      feedback.value = { key: "xlsx.feedback.exported", error: false };
    } catch (error) {
      setFailure(error);
    } finally {
      abortController = undefined;
      busy.value = false;
    }
  }

  async function confirm(): Promise<void> {
    if (busy.value || !confirmation.value) return;
    const nextConfirmation = confirmation.value;
    busy.value = true;
    try {
      if (nextConfirmation === "import" && pendingImport.value) {
        if (!canApplyImport(pendingImport.value)) {
          feedback.value = { key: "xlsx.feedback.stale", error: true };
          return;
        }
        await options.persistence.replaceDocument(pendingImport.value.workbook);
        if (!disposed) feedback.value = { key: "xlsx.feedback.imported", error: false };
      } else if (nextConfirmation === "export" && pendingExport.value) {
        await download(pendingExport.value.bytes, "workbook.xlsx");
        feedback.value = { key: "xlsx.feedback.exported", error: false };
      }
    } catch (error) {
      setFailure(error);
    } finally {
      busy.value = false;
      clearPending();
    }
  }

  function cancel(): void {
    abortController?.abort();
    if (!busy.value) {
      clearPending();
      dismissFeedback();
    }
  }

  function dismissFeedback(): void {
    if (busy.value || confirmation.value) return;
    feedback.value = undefined;
    report.value = undefined;
  }

  onScopeDispose(() => {
    disposed = true;
    abortController?.abort();
    clearPending();
  });

  return {
    busy: readonly(busy),
    confirmation: readonly(confirmation),
    feedback: readonly(feedback),
    report: readonly(report),
    importXlsx,
    exportXlsx,
    confirm,
    cancel,
    dismissFeedback,
  };
}
