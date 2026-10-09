import type { WorkbookSnapshot } from "@sheetcraft/core/serialization";

export type PersistedWorkbook = {
  revision: number;
  savedAt: number;
  snapshot: unknown;
};

export type WorkbookSaveReceipt = {
  revision: number;
  savedAt: number;
};

export type WorkbookStore = {
  load: () => Promise<PersistedWorkbook | undefined>;
  save: (
    snapshot: WorkbookSnapshot,
    expectedRevision: number | undefined,
  ) => Promise<WorkbookSaveReceipt>;
  /**
   * Replaces the browser recovery record after the UI has explicitly confirmed
   * importing a document or discarding the old copy to start blank.
   * Normal automatic and manual saves must use `save`.
   */
  replace: (snapshot: WorkbookSnapshot) => Promise<WorkbookSaveReceipt>;
};

export type WorkbookStoreErrorCode = "unavailable" | "invalid-record" | "conflict" | "quota";

export class WorkbookStoreError extends Error {
  readonly code: WorkbookStoreErrorCode;

  constructor(code: WorkbookStoreErrorCode, options?: ErrorOptions) {
    super(`Workbook storage: ${code}`, options);
    this.name = "WorkbookStoreError";
    this.code = code;
  }
}
