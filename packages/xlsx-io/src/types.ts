import type { Workbook } from "@idea10/core/workbook";
import type { ImageTransform } from "@idea10/core/workbook";

export type AbortSignalLike = Readonly<{ aborted: boolean }>;

export type XlsxCompatibilitySeverity = "warning" | "block";

export type XlsxCompatibilityCode =
  | "archive-invalid"
  | "archive-limit"
  | "archive-encrypted"
  | "archive-unsupported-compression"
  | "archive-unsafe-path"
  | "macro-content"
  | "drawing-or-media"
  | "external-content"
  | "formula-cache-discarded"
  | "formula-not-calculated"
  | "filter-omitted"
  | "image-omitted"
  | "style-omitted"
  | "number-format-omitted"
  | "dimension-approximated"
  | "date-normalized"
  | "cell-value-omitted"
  | "feature-omitted";

export type XlsxCompatibilityIssue = Readonly<{
  code: XlsxCompatibilityCode;
  severity: XlsxCompatibilitySeverity;
  count: number;
  locations: readonly string[];
}>;

export type XlsxCompatibilityReport = Readonly<{
  issues: readonly XlsxCompatibilityIssue[];
}>;

export type XlsxDecodeOptions = Readonly<{
  signal?: AbortSignalLike;
}>;

export type XlsxDecodeResult = Readonly<{
  workbook: Workbook;
  report: XlsxCompatibilityReport;
}>;

export type XlsxEncodeResult = Readonly<{
  bytes: Uint8Array;
  report: XlsxCompatibilityReport;
}>;

/** A raster image prepared by the runtime adapter for XLSX export. */
export type XlsxImageAsset = Readonly<{
  assetId: string;
  /** Identifies the already-baked crop/rotation/flip variant. */
  transform?: ImageTransform;
  bytes: Uint8Array;
  extension: "png" | "jpeg" | "gif";
  width: number;
  height: number;
}>;

export type XlsxEncodeOptions = Readonly<{
  images?: readonly XlsxImageAsset[];
}>;

export class XlsxCompatibilityError extends Error {
  readonly report: XlsxCompatibilityReport;

  constructor(message: string, report: XlsxCompatibilityReport) {
    super(message);
    this.name = "XlsxCompatibilityError";
    this.report = report;
  }
}

export class XlsxAbortError extends Error {
  constructor() {
    super("XLSX operation was aborted.");
    this.name = "XlsxAbortError";
  }
}
