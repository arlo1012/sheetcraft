export type WorkbookErrorCode =
  | "invalid_command"
  | "invalid_snapshot"
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
