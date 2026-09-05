import type { Workbook } from "@idea10/core/workbook";
import { decodeWithExcelJs, encodeWithExcelJs } from "./codec.js";
import { mergeCompatibilityReports } from "./report.js";
import {
  XlsxAbortError,
  type XlsxDecodeOptions,
  type XlsxDecodeResult,
  type XlsxEncodeOptions,
  type XlsxEncodeResult,
} from "./types.js";
import { preflightXlsxArchive } from "./zip-preflight.js";

export {
  XlsxAbortError,
  XlsxCompatibilityError,
  type AbortSignalLike,
  type XlsxCompatibilityCode,
  type XlsxCompatibilityIssue,
  type XlsxCompatibilityReport,
  type XlsxCompatibilitySeverity,
  type XlsxDecodeOptions,
  type XlsxDecodeResult,
  type XlsxEncodeResult,
  type XlsxEncodeOptions,
  type XlsxImageAsset,
} from "./types.js";

function assertNotAborted(options: XlsxDecodeOptions | undefined): void {
  if (options?.signal?.aborted) throw new XlsxAbortError();
}

export async function decodeXlsx(
  bytes: Uint8Array,
  options?: XlsxDecodeOptions,
): Promise<XlsxDecodeResult> {
  assertNotAborted(options);
  const preflight = await preflightXlsxArchive(bytes, options?.signal);
  assertNotAborted(options);
  const decoded = await decodeWithExcelJs(bytes);
  return { ...decoded, report: mergeCompatibilityReports(preflight, decoded.report) };
}

export async function encodeXlsx(
  workbook: Workbook,
  options?: XlsxEncodeOptions,
): Promise<XlsxEncodeResult> {
  return encodeWithExcelJs(workbook, options);
}
