export type WorkbookErrorCode =
  | "invalid_command"
  | "invalid_command_payload"
  | "invalid_snapshot"
  | "last_sheet_removal"
  | "sheet_name_conflict"
  | "sheet_not_found"
  | "unsupported_snapshot_version"
  | "workbook_operation_failed";

export type WorkbookErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export type WorkbookErrorData = {
  code: WorkbookErrorCode;
  details?: WorkbookErrorDetails;
};

export class WorkbookDomainError extends Error {
  readonly data: WorkbookErrorData;

  constructor(data: WorkbookErrorData, message: string = data.code) {
    super(message);
    this.name = "WorkbookDomainError";
    this.data = data;
  }
}

export function toWorkbookErrorDetail(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toWorkbookErrorData(error: unknown): WorkbookErrorData {
  if (error instanceof WorkbookDomainError) {
    return error.data;
  }

  return {
    code: "workbook_operation_failed",
    details: {
      reason: error instanceof Error ? error.message : "Unknown workbook operation failure.",
    },
  };
}
