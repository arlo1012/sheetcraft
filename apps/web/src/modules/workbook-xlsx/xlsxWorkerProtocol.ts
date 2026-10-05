import type { WorkbookSnapshot } from "@idea10/core/serialization";
import type { ImageTransform } from "@idea10/core/workbook";

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

/** Ready-to-embed bytes; transform identifies the already-rendered asset variant. */
export type XlsxWorkerImage = {
  assetId: string;
  transform?: ImageTransform;
  bytes: ArrayBuffer;
  extension: "png" | "jpeg" | "gif";
  width: number;
  height: number;
};

export type XlsxWorkerRequest =
  | { id: string; type: "decode"; bytes: ArrayBuffer; password?: string }
  | {
      id: string;
      type: "encode";
      snapshot: WorkbookSnapshot;
      password?: string;
      images?: readonly XlsxWorkerImage[];
    };

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
  code?:
    | "password-required"
    | "incorrect-password"
    | "unsupported-encryption"
    | "invalid-encrypted-file";
  message: string;
  report?: XlsxCompatibilityReport;
};
