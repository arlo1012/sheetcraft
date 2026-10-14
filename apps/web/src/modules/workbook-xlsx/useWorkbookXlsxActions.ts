import { onScopeDispose, readonly, ref, shallowRef } from "vue";
import {
  deserializeWorkbook,
  serializeWorkbook,
  type WorkbookSnapshot,
} from "@sheetcraft/core/serialization";
import type { Workbook } from "@sheetcraft/core/workbook";
import type { ImageAssetStore } from "../image-assets/imageAssetStore";
import type { useWorkbookPersistence } from "../workbook-persistence/useWorkbookPersistence";
import { prepareXlsxImages, assertXlsxPictureGeometrySupport } from "./prepareXlsxImages";
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
  | "chart.elementExportBlocked"
  | "chart.sourceExportBlocked"
  | "chart.formatExportBlocked"
  | "xlsx.feedback.numericTableTotals"
  | "xlsx.feedback.exported"
  | "xlsx.feedback.failed"
  | "xlsx.feedback.finishEditing"
  | "xlsx.feedback.imported"
  | "xlsx.feedback.stale"
  | "xlsx.feedback.timeout"
  | "xlsx.feedback.unsupportedEncryption"
  | "xlsx.feedback.invalidEncryptedFile";

export type XlsxFeedback = { key: XlsxFeedbackKey; error: boolean; locations?: string };
export type XlsxConfirmation = "import";

type PendingImport = {
  workbook: Workbook;
  workbookAtStart: Workbook;
  revisionAtStart: number;
};

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
  assetStore?: ImageAssetStore;
  isBlocked?: () => boolean;
  workerFactory?: XlsxWorkerFactory;
  download?: (bytes: Uint8Array, filename: string) => void | Promise<void>;
  timeoutMs?: number;
}) {
  const busy = ref(false);
  const passwordRequired = ref(false);
  const passwordError = ref(false);
  let encryptedImport: { bytes: ArrayBuffer; workbook: Workbook; revision: number } | undefined;
  const confirmation = ref<XlsxConfirmation>();
  const feedback = ref<XlsxFeedback>();
  const pendingImport = shallowRef<PendingImport>();
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
      confirmation.value ||
      passwordRequired.value,
    );
  }

  function clearPending(): void {
    confirmation.value = undefined;
    pendingImport.value = undefined;
    passwordRequired.value = false;
    passwordError.value = false;
    encryptedImport = undefined;
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
    if (options.flushPendingEdits()) return true;
    feedback.value = { key: "xlsx.feedback.finishEditing", error: true };
    return false;
  }

  function setNumericTotalsFailure(report?: XlsxCompatibilityReport): boolean {
    const totals = report?.issues.find(
      (issue) => issue.code === "table-totals-numeric-constant" && issue.severity === "block",
    );
    if (totals) {
      feedback.value = {
        key: "xlsx.feedback.numericTableTotals",
        error: true,
        locations: totals.locations.join("; "),
      };
      return true;
    }
    return false;
  }

  function setChartFormatFailure(report?: XlsxCompatibilityReport): boolean {
    const locations = report?.issues.flatMap((issue) =>
      issue.code === "feature-omitted" && issue.severity === "block"
        ? issue.locations.filter((location) =>
            [".chart.format", ".chart.presentation", ".chart.stacked"].some((suffix) =>
              location.endsWith(suffix),
            ),
          )
        : [],
    );
    if (!locations?.length) return false;
    feedback.value = {
      key: "chart.formatExportBlocked",
      error: true,
      locations: locations.join("; "),
    };
    return true;
  }
  function setChartSourceFailure(report?: XlsxCompatibilityReport): boolean {
    const locations = report?.issues.flatMap((issue) =>
      issue.code === "feature-omitted" && issue.severity === "block"
        ? issue.locations.filter((location) => location.endsWith(".chart.source"))
        : [],
    );
    if (!locations?.length) return false;
    feedback.value = {
      key: "chart.sourceExportBlocked",
      error: true,
      locations: locations.join("; "),
    };
    return true;
  }

  function setChartElementFailure(report?: XlsxCompatibilityReport): boolean {
    const locations = report?.issues.flatMap((issue) =>
      issue.code === "feature-omitted" && issue.severity === "block"
        ? issue.locations.filter((location) => location.endsWith(".chart.elements"))
        : [],
    );
    if (!locations?.length) return false;
    feedback.value = {
      key: "chart.elementExportBlocked",
      error: true,
      locations: locations.join("; "),
    };
    return true;
  }

  function setFailure(error: unknown): void {
    if (error instanceof XlsxWorkerAbortError || disposed) return;
    if (
      error instanceof XlsxWorkerFailure &&
      (setNumericTotalsFailure(error.report) ||
        setChartFormatFailure(error.report) ||
        setChartSourceFailure(error.report) ||
        setChartElementFailure(error.report))
    )
      return;
    if (error instanceof XlsxWorkerFailure && error.report && hasBlockingIssue(error.report)) {
      feedback.value = { key: "xlsx.feedback.blocked", error: true };
      return;
    }
    feedback.value = {
      key:
        error instanceof XlsxWorkerTimeoutError
          ? "xlsx.feedback.timeout"
          : error instanceof XlsxWorkerFailure && error.code === "unsupported-encryption"
            ? "xlsx.feedback.unsupportedEncryption"
            : error instanceof XlsxWorkerFailure && error.code === "invalid-encrypted-file"
              ? "xlsx.feedback.invalidEncryptedFile"
              : "xlsx.feedback.failed",
      error: true,
    };
  }

  async function importXlsx(
    file: Pick<File, "arrayBuffer" | "size">,
    password?: string,
  ): Promise<void> {
    if (
      options.persistence.error?.value === "unsupported-picture-frame" ||
      options.persistence.error?.value === "unsupported-shape-frame"
    ) {
      feedback.value = { key: "xlsx.feedback.blocked", error: true };
      return;
    }
    if (password === undefined && !prepare()) return;
    const workbookAtStart = options.getWorkbook();
    const revisionAtStart = options.getRevision();
    const requestId = `xlsx-import-${++requestNumber}`;
    busy.value = true;
    feedback.value = undefined;
    abortController = new AbortController();
    try {
      if (file.size > MAX_XLSX_FILE_BYTES) {
        feedback.value = { key: "xlsx.feedback.blocked", error: true };
        return;
      }
      const bytes = await file.arrayBuffer();
      if (abortController.signal.aborted) throw new XlsxWorkerAbortError();
      encryptedImport = { bytes, workbook: workbookAtStart, revision: revisionAtStart };
      const response = await runXlsxWorker(
        workerFactory,
        { id: requestId, type: "decode", bytes: bytes.slice(0), ...(password ? { password } : {}) },
        { timeoutMs, signal: abortController.signal },
      );
      if (disposed || response.type !== "decode") return;
      encryptedImport = undefined;
      passwordRequired.value = false;
      passwordError.value = false;
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
      if (
        error instanceof XlsxWorkerFailure &&
        (error.code === "password-required" || error.code === "incorrect-password")
      ) {
        passwordRequired.value = true;
        passwordError.value = error.code === "incorrect-password";
      } else {
        encryptedImport = undefined;
        passwordRequired.value = false;
        setFailure(error);
      }
    } finally {
      abortController = undefined;
      busy.value = false;
    }
  }

  async function submitPassword(password: string): Promise<void> {
    const pending = encryptedImport;
    if (!pending || busy.value || !password) return;
    if (
      options.getWorkbook() !== pending.workbook ||
      options.getRevision() !== pending.revision ||
      options.hasPendingEdits() ||
      options.isBlocked?.()
    ) {
      clearPending();
      feedback.value = { key: "xlsx.feedback.stale", error: true };
      return;
    }
    await importXlsx(
      { size: pending.bytes.byteLength, arrayBuffer: async () => pending.bytes },
      password,
    );
  }

  async function exportXlsx(password?: string): Promise<void> {
    try {
      assertXlsxPictureGeometrySupport(options.getWorkbook());
    } catch (error) {
      setFailure(error);
      return;
    }
    if (!prepare()) return;
    const snapshot: WorkbookSnapshot = serializeWorkbook(options.getWorkbook());
    const requestId = `xlsx-export-${++requestNumber}`;
    const filename = password ? "workbook-encrypted.xlsx" : "workbook.xlsx";
    busy.value = true;
    feedback.value = undefined;
    const controller = new AbortController();
    abortController = controller;
    const startedAt = Date.now();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const images = await prepareXlsxImages(snapshot, options.assetStore, controller.signal);
      if (controller.signal.aborted) throw new XlsxWorkerAbortError();
      const response = await runXlsxWorker(
        workerFactory,
        {
          id: requestId,
          type: "encode",
          snapshot,
          images,
          filename,
          ...(password ? { password } : {}),
        },
        { timeoutMs: Math.max(1, timeoutMs - (Date.now() - startedAt)), signal: controller.signal },
      );
      clearTimeout(timeout);
      if (disposed || response.type !== "encode") return;
      if (hasBlockingIssue(response.report)) {
        if (
          !setNumericTotalsFailure(response.report) &&
          !setChartFormatFailure(response.report) &&
          !setChartSourceFailure(response.report) &&
          !setChartElementFailure(response.report)
        )
          feedback.value = { key: "xlsx.feedback.blocked", error: true };
        return;
      }
      const bytes = new Uint8Array(response.bytes);
      await download(bytes, filename);
      if (!disposed) feedback.value = { key: "xlsx.feedback.exported", error: false };
    } catch (error) {
      if (timedOut) setFailure(new XlsxWorkerTimeoutError());
      else if (!controller.signal.aborted) setFailure(error);
    } finally {
      clearTimeout(timeout);
      abortController = undefined;
      busy.value = false;
    }
  }

  async function confirm(): Promise<void> {
    if (
      options.persistence.error?.value === "unsupported-picture-frame" ||
      options.persistence.error?.value === "unsupported-shape-frame"
    ) {
      feedback.value = { key: "xlsx.feedback.blocked", error: true };
      return;
    }
    if (busy.value || !pendingImport.value) return;
    busy.value = true;
    try {
      if (!canApplyImport(pendingImport.value)) {
        feedback.value = { key: "xlsx.feedback.stale", error: true };
        return;
      }
      await options.persistence.replaceDocument(pendingImport.value.workbook);
      if (!disposed) feedback.value = { key: "xlsx.feedback.imported", error: false };
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
  }

  onScopeDispose(() => {
    disposed = true;
    abortController?.abort();
    clearPending();
  });

  return {
    busy: readonly(busy),
    passwordRequired: readonly(passwordRequired),
    passwordError: readonly(passwordError),
    submitPassword,
    confirmation: readonly(confirmation),
    feedback: readonly(feedback),
    importXlsx,
    exportXlsx,
    confirm,
    cancel,
    dismissFeedback,
  };
}
