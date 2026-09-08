import {
  formatCellNumberValue,
  type CellNumberFormatPresentation,
} from "@idea10/core/number-format";
import type { ExcelDateSystem, FormulaValue } from "@idea10/core/formula";
import type { CellStyle } from "@idea10/core/style";

export type GridCellValuePresentation = Readonly<{
  text: string;
  color?: string;
  fill?: CellNumberFormatPresentation["fill"];
}>;

export function getCellValuePresentationForGrid(
  value: FormulaValue,
  style: Readonly<CellStyle> | undefined,
  locale: string,
  dateSystem: ExcelDateSystem,
): GridCellValuePresentation {
  const presentation = formatCellNumberValue(value, style?.numberFormat, { locale, dateSystem });
  return presentation;
}

/** Kept for callers that only need the rendered cell text. */
export function formatCellValueForGrid(
  value: FormulaValue,
  style: Readonly<CellStyle> | undefined,
  locale: string,
  dateSystem: ExcelDateSystem = "1900",
): string {
  return getCellValuePresentationForGrid(value, style, locale, dateSystem).text;
}
