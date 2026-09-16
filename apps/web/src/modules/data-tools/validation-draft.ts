import {
  datePartsToExcelSerial,
  excelSerialToDateParts,
  type ExcelDateSystem,
} from "@idea10/core/formula";
import type { DataValidationDraft, DataValidationInitial } from "./data-tools-types";

function isReference(value: string): boolean {
  return value.trim().startsWith("=");
}
function formatDate(serial: number, dateSystem: ExcelDateSystem): string {
  const parts = excelSerialToDateParts(serial, dateSystem);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
function formatTime(serial: number, dateSystem: ExcelDateSystem): string {
  const parts = excelSerialToDateParts(serial, dateSystem);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}${parts.second ? `:${String(parts.second).padStart(2, "0")}` : ""}`;
}
function display(
  value: string | undefined,
  type: DataValidationDraft["type"],
  dateSystem: ExcelDateSystem,
): string {
  if (!value || isReference(value) || (type !== "date" && type !== "time")) return value ?? "";
  const serial = Number(value);
  if (!Number.isFinite(serial)) return value;
  try {
    return type === "date" ? formatDate(serial, dateSystem) : formatTime(serial, dateSystem);
  } catch {
    return value;
  }
}
function serial(
  value: string,
  type: DataValidationDraft["type"],
  dateSystem: ExcelDateSystem,
): string {
  if (isReference(value) || (type !== "date" && type !== "time") || !value.trim()) return value;
  try {
    if (type === "date") {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
      if (!match) return value;
      return String(
        datePartsToExcelSerial(
          {
            year: Number(match[1]),
            month: Number(match[2]),
            day: Number(match[3]),
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0,
          },
          dateSystem,
        ),
      );
    }
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!match) return value;
    return String(
      datePartsToExcelSerial(
        {
          year: dateSystem === "1904" ? 1904 : 1900,
          month: 1,
          day: 1,
          hour: Number(match[1]),
          minute: Number(match[2]),
          second: Number(match[3] ?? 0),
          millisecond: 0,
        },
        dateSystem,
      ) % 1,
    );
  } catch {
    return value;
  }
}
export function displayValidationBound(
  value: string | undefined,
  type: DataValidationDraft["type"],
  dateSystem: ExcelDateSystem,
): string {
  return display(value, type, dateSystem);
}
export function serializeValidationDraft(
  draft: DataValidationDraft,
  dateSystem: ExcelDateSystem,
): DataValidationDraft {
  return {
    ...draft,
    minimum: serial(draft.minimum, draft.type, dateSystem),
    maximum: serial(draft.maximum, draft.type, dateSystem),
  };
}
export function isValidationDraftComplete(
  draft: DataValidationDraft,
  dateSystem: ExcelDateSystem,
): boolean {
  if (draft.type === "any") return true;
  if (draft.type === "list" || draft.type === "custom") {
    return draft.source.trim().replace(/^=/, "").trim().length > 0;
  }
  const values = serializeValidationDraft(draft, dateSystem);
  const validBound = (value: string) =>
    value.trim().length > 0 &&
    (value.trim().startsWith("=") ? value.trim().length > 1 : Number.isFinite(Number(value)));
  return (
    validBound(values.minimum) &&
    ((draft.operator !== "between" && draft.operator !== "notBetween") ||
      validBound(values.maximum))
  );
}
export function createValidationDraft(
  initial: DataValidationInitial | undefined,
  dateSystem: ExcelDateSystem,
  empty: () => DataValidationDraft,
): DataValidationDraft {
  if (!initial) return empty();
  const type = initial.type === "textLength" ? "text-length" : initial.type;
  return {
    type,
    operator: initial.operator ?? "between",
    minimum: display(initial.formula1, type, dateSystem),
    maximum: display(initial.formula2, type, dateSystem),
    source:
      initial.list?.join(", ") ??
      (initial.type === "list" || initial.type === "custom" ? (initial.formula1 ?? "") : ""),
    ignoreBlank: initial.allowBlank,
    showDropdown: initial.showDropdown !== false,
    inputTitle: initial.promptTitle ?? "",
    inputMessage: initial.prompt ?? "",
    showInputMessage: initial.showInput === true,
    errorTitle: initial.errorTitle ?? "",
    errorMessage: initial.error ?? "",
    errorStyle: initial.errorStyle ?? "stop",
    showErrorAlert: initial.showError !== false,
  };
}
