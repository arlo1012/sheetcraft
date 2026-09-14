/** CSS pixels per inch. CSS absolute lengths intentionally do not depend on browser zoom. */
const CSS_PIXELS_PER_INCH = 96;
const POINTS_PER_INCH = 72;
const CENTIMETERS_PER_INCH = 2.54;
const MILLIMETERS_PER_INCH = 25.4;

/**
 * The Calibri 11 Normal-style baseline used for spreadsheet column widths.
 *
 * This is the maximum width of a digit in CSS pixels at 96 DPI.
 */
export const COLUMN_MAX_DIGIT_WIDTH = 7;

/** Padding Excel includes around text when calculating a column's pixel width. */
export const COLUMN_PADDING_PIXELS = 5;

export type DimensionUnit = "px" | "pt" | "in" | "cm" | "mm" | "char";
export type DimensionAxis = "row" | "column";

const ROW_DIMENSION_UNITS = ["px", "pt", "in", "cm", "mm"] as const;
const COLUMN_DIMENSION_UNITS = [...ROW_DIMENSION_UNITS, "char"] as const;

/** Returns the unit conventionally shown by spreadsheet applications for an axis. */
export function getDefaultDimensionUnit(axis: DimensionAxis): DimensionUnit {
  return axis === "row" ? "pt" : "char";
}

/** Returns units supported by the axis. Character widths only apply to columns. */
export function getDimensionUnits(axis: DimensionAxis): readonly DimensionUnit[] {
  return axis === "row" ? ROW_DIMENSION_UNITS : COLUMN_DIMENSION_UNITS;
}

/**
 * Converts a Core dimension (CSS pixels) to the value shown in a chosen unit.
 *
 * Physical lengths remain unrounded so callers can choose presentation precision.
 * Character widths follow the Calibri 11 / MDW 7 Excel baseline and are displayed
 * to two decimal places. The Core minimum column width is 32 px, so the narrow
 * column-width rules used by Excel below that threshold are intentionally absent.
 */
export function pixelsToDimensionValue(
  pixels: number,
  unit: DimensionUnit,
  maximumDigitWidth = COLUMN_MAX_DIGIT_WIDTH,
): number {
  assertFinite(pixels, "Pixels");

  switch (unit) {
    case "px":
      return pixels;
    case "pt":
      return (pixels * POINTS_PER_INCH) / CSS_PIXELS_PER_INCH;
    case "in":
      return pixels / CSS_PIXELS_PER_INCH;
    case "cm":
      return (pixels * CENTIMETERS_PER_INCH) / CSS_PIXELS_PER_INCH;
    case "mm":
      return (pixels * MILLIMETERS_PER_INCH) / CSS_PIXELS_PER_INCH;
    case "char":
      return roundToTwoDecimals(
        (pixels - COLUMN_PADDING_PIXELS) / assertMaximumDigitWidth(maximumDigitWidth),
      );
  }
}

/**
 * Converts a user-entered dimension to CSS pixels without applying Core bounds.
 *
 * Physical units retain their fractional result. Character widths use a rounded
 * pixel result because Excel character widths are represented by whole display
 * pixels; the command layer remains responsible for enforcing workbook limits.
 */
export function dimensionValueToPixels(
  value: number,
  unit: DimensionUnit,
  maximumDigitWidth = COLUMN_MAX_DIGIT_WIDTH,
): number {
  assertFinite(value, "Dimension value");

  switch (unit) {
    case "px":
      return value;
    case "pt":
      return (value * CSS_PIXELS_PER_INCH) / POINTS_PER_INCH;
    case "in":
      return value * CSS_PIXELS_PER_INCH;
    case "cm":
      return (value * CSS_PIXELS_PER_INCH) / CENTIMETERS_PER_INCH;
    case "mm":
      return (value * CSS_PIXELS_PER_INCH) / MILLIMETERS_PER_INCH;
    case "char":
      return Math.round(value * assertMaximumDigitWidth(maximumDigitWidth) + COLUMN_PADDING_PIXELS);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be a finite number.`);
}

function assertMaximumDigitWidth(maximumDigitWidth: number): number {
  if (!Number.isFinite(maximumDigitWidth) || maximumDigitWidth <= 0)
    throw new RangeError("Maximum digit width must be a positive, finite number.");
  return maximumDigitWidth;
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
