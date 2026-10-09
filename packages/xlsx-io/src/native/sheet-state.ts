import type { NativeSheetData, NativeSheetState } from "./model.js";

export function nativeSheetState(value: unknown): NativeSheetState {
  if (value === undefined) return "visible";
  if (value === "visible" || value === "hidden" || value === "veryHidden") return value;
  throw new RangeError("Invalid XLSX worksheet state.");
}

export function assertNativeVisibleSheets(sheets: readonly NativeSheetData[]): void {
  if (!sheets.length) throw new RangeError("The workbook contains no worksheets.");
  const states = sheets.map((sheet) => nativeSheetState(sheet.state));
  if (!states.includes("visible"))
    throw new RangeError("The XLSX workbook must contain a visible worksheet.");
}
