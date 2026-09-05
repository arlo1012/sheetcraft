import { deserializeWorkbook, serializeWorkbook } from "@idea10/core/serialization";
import type { Workbook } from "@idea10/core/workbook";

export type WorkbookFileErrorCode = "invalid-json" | "invalid-snapshot" | "read-failed";

export class WorkbookFileError extends Error {
  readonly code: WorkbookFileErrorCode;

  constructor(code: WorkbookFileErrorCode, options?: ErrorOptions) {
    super(`Workbook file: ${code}`, options);
    this.name = "WorkbookFileError";
    this.code = code;
  }
}

export function parseWorkbookJson(text: string): Workbook {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new WorkbookFileError("invalid-json", { cause: error });
  }
  try {
    return deserializeWorkbook(value);
  } catch (error) {
    throw new WorkbookFileError("invalid-snapshot", { cause: error });
  }
}

export async function readWorkbookFile(file: Pick<File, "text">): Promise<Workbook> {
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    throw new WorkbookFileError("read-failed", { cause: error });
  }
  return parseWorkbookJson(text);
}

export function downloadWorkbookJson(workbook: Workbook): void {
  const blob = new Blob([JSON.stringify(serializeWorkbook(workbook), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "idea10-workbook.json";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
