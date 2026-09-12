import { isFormulaError, type FormulaValue } from "./formula/types.js";
import type { CellAddress, Sheet, SheetFilterValue } from "./workbook.js";

export function getSheetFilterValue(value: FormulaValue): SheetFilterValue {
  if (value === null) return { kind: "blank" };
  if (isFormulaError(value)) return { kind: "error", code: value.code };
  if (typeof value === "number") return { kind: "number", value };
  if (typeof value === "string") return { kind: "string", value };
  return { kind: "boolean", value };
}

export function getSheetFilterValueKey(value: SheetFilterValue): string {
  return value.kind === "blank"
    ? "blank"
    : value.kind === "error"
      ? `error:${value.code}`
      : `${value.kind}:${String(value.value)}`;
}

export function areSheetFilterValuesEqual(
  left: SheetFilterValue,
  right: SheetFilterValue,
): boolean {
  return getSheetFilterValueKey(left) === getSheetFilterValueKey(right);
}

/** Tests one data row using canonical stored criteria, independently of a rendering layer. */
export function isSheetRowFiltered(
  sheet: Sheet,
  row: number,
  getValue: (address: CellAddress) => FormulaValue,
): boolean {
  const filter = sheet.filter;
  if (!filter || row <= filter.range.start.row || row > filter.range.end.row) return false;
  return filter.columns.some((column) => {
    const value = getSheetFilterValue(getValue({ row, column: column.column }));
    return !column.allowedValues.some((allowed) => areSheetFilterValuesEqual(value, allowed));
  });
}
