import { COLUMN_MAX_DIGIT_WIDTH, COLUMN_PADDING_PIXELS } from "@idea10/core/dimension-units";

const MAX_DIGIT_WIDTH = COLUMN_MAX_DIGIT_WIDTH;
const CELL_PADDING_PIXELS = COLUMN_PADDING_PIXELS;
const WIDTH_SCALE = 256;

/**
 * Converts a Core column width in pixels to the XLSX width stored by Excel.
 *
 * This module deliberately uses the export baseline declared by this adapter:
 * Calibri 11 at 96 DPI, whose maximum digit width (MDW) is 7 pixels. Excel
 * stores widths in 1/256-character increments. Formula source:
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.column
 */
export function pixelsToExcelColumnWidth(pixels: number): number {
  const characters =
    Math.trunc(((pixels - CELL_PADDING_PIXELS) / MAX_DIGIT_WIDTH) * 100 + 0.5) / 100;
  return (
    Math.trunc(
      ((characters * MAX_DIGIT_WIDTH + CELL_PADDING_PIXELS) / MAX_DIGIT_WIDTH) * WIDTH_SCALE,
    ) / WIDTH_SCALE
  );
}

/**
 * Converts an XLSX column width to Core pixels using Excel's MDW rounding.
 *
 * Imports use the same MDW 7 baseline. Other Normal fonts can differ; this is
 * an adapter limitation recorded in development diagnostics. Formula source:
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.column
 */
export function excelColumnWidthToPixels(width: number): number {
  return Math.trunc(
    ((WIDTH_SCALE * width + Math.trunc(128 / MAX_DIGIT_WIDTH)) / WIDTH_SCALE) * MAX_DIGIT_WIDTH,
  );
}
