import type { WorkbookSnapshot } from "@idea10/core/serialization";

export type XlsxCompatibilitySeverity = "warning" | "block";

export type XlsxCompatibilityIssue = {
  code: string;
  severity: XlsxCompatibilitySeverity;
  count: number;
  locations: readonly string[];
};

export type XlsxCompatibilityReport = {
  issues: readonly XlsxCompatibilityIssue[];
};

export type XlsxWorkerRequest =
  | { id: string; type: "decode"; bytes: ArrayBuffer }
  | { id: string; type: "encode"; snapshot: WorkbookSnapshot };

export type XlsxWorkerResponse =
  | {
      id: string;
      ok: true;
      type: "decode";
      snapshot: WorkbookSnapshot;
      report: XlsxCompatibilityReport;
    }
  | {
      id: string;
      ok: true;
      type: "encode";
      bytes: ArrayBuffer;
      report: XlsxCompatibilityReport;
    }
  | { id: string; ok: false; error: XlsxWorkerError };

export type XlsxWorkerError = {
  message: string;
  report?: XlsxCompatibilityReport;
};
