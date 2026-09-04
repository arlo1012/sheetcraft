import { formatComputedValueForDisplay } from "@idea10/core/input";
import type { FormulaValue } from "@idea10/core/formula";
import type { CellStyle } from "@idea10/core/style";

function formatNumericCellValue(value: number, style: Readonly<CellStyle>, locale: string): string {
  const format = style.numberFormat;
  if (!format) {
    return formatComputedValueForDisplay(value);
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
  value: FormulaValue,
  style: Readonly<CellStyle> | undefined,
  locale: string,
): string {
  if (typeof value !== "number") {
    return formatComputedValueForDisplay(value);
  }
  return formatNumericCellValue(value, style ?? {}, locale);
}
