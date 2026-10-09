import {
  isFormulaError,
  FORMULA_ERROR_TOKENS,
  formulaErrorCodeFromToken,
  createFormulaError,
  datePartsToExcelSerial,
  type FormulaValue,
} from "@sheetcraft/core/formula";
import { xml } from "./pivot-xml.js";
export function readPivotCacheValue(
  kind: string | undefined,
  value: string,
  dateSystem: "1900" | "1904",
): FormulaValue {
  if (kind === "m") return null;
  if (kind === "n") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("Invalid cache number.");
    return number;
  }
  if (kind === "b") return value === "1" || value === "true";
  if (kind === "s") return value;
  if (kind === "e") {
    const code = formulaErrorCodeFromToken(value);
    if (!code) throw new Error("Invalid cache error.");
    return createFormulaError(code);
  }
  if (kind === "d") {
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z?$/.exec(value);
    if (!parts) throw new Error("Invalid pivot cache date.");
    return datePartsToExcelSerial(
      {
        year: Number(parts[1]),
        month: Number(parts[2]),
        day: Number(parts[3]),
        hour: Number(parts[4]),
        minute: Number(parts[5]),
        second: Number(parts[6]),
        millisecond: Number((parts[7] ?? "").padEnd(3, "0")),
      },
      dateSystem,
    );
  }
  throw new Error("Unsupported pivot cache item.");
}
export function pivotCacheValueXml(value: FormulaValue): string {
  if (value === null || value === "") return "<m/>";
  if (isFormulaError(value)) return `<e v="${xml(FORMULA_ERROR_TOKENS[value.code])}"/>`;
  if (typeof value === "boolean") return `<b v="${value ? 1 : 0}"/>`;
  if (typeof value === "number") return `<n v="${value}"/>`;
  return `<s v="${xml(value)}"/>`;
}
