import { formatCellValueForDisplay } from "@idea10/core/input";
import type { CellStyle } from "@idea10/core/style";
import type { CellValue } from "@idea10/core/workbook";

function formatNumericCellValue(value: number, style: Readonly<CellStyle>, locale: string): string {
  const format = style.numberFormat;
  if (!format) {
    return formatCellValueForDisplay(value);
  }

  const numericValue = Object.is(value, -0) ? 0 : value;
  const fractionDigits = {
    minimumFractionDigits: format.fractionDigits,
    maximumFractionDigits: format.fractionDigits,
  };
  if (format.kind === "currency") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: format.currency,
      ...fractionDigits,
    }).format(numericValue);
  }
  if (format.kind === "percent") {
    return new Intl.NumberFormat(locale, { style: "percent", ...fractionDigits }).format(
      numericValue,
    );
  }
  return new Intl.NumberFormat(locale, fractionDigits).format(numericValue);
}

export function formatCellValueForGrid(
  value: CellValue,
  style: Readonly<CellStyle> | undefined,
  locale: string,
): string {
  if (typeof value !== "number") {
    return formatCellValueForDisplay(value);
  }
  return formatNumericCellValue(value, style ?? {}, locale);
}
