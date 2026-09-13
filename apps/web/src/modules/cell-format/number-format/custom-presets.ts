import { getNumberFormatLocaleCurrency, toCellNumberFormatCode } from "@idea10/core/number-format";
import { getDateFormatPresets } from "../../../shared/number-format/date-presets";

/**
 * Returns the built-in starting points shown by the Custom category.
 *
 * Date codes come directly from the regional date catalog. Callers provide
 * the other typed catalogs (time, fraction, and special) as `additionalCodes`
 * so this module does not recreate their format-code inventories or import
 * `catalog.ts` in a cycle.
 */
export function getCustomFormatPresets(
  region: string,
  additionalCodes: readonly string[] = [],
): string[] {
  const currency = getNumberFormatLocaleCurrency(region) ?? "USD";
  const currencyFormats = [0, 2].flatMap((fractionDigits) => [
    toCellNumberFormatCode({ kind: "currency", currency, fractionDigits }),
    toCellNumberFormatCode({ kind: "accounting", currency, fractionDigits }),
  ]);
  const dateCodes = getDateFormatPresets(region).map(({ code }) => code);

  return uniqueCodes([
    "General",
    "0",
    "0.0",
    "0.00",
    "0.000",
    "#,##0",
    "#,##0.0",
    "#,##0.00",
    "#,##0.000",
    "#,##0;-#,##0",
    "#,##0;[Red]-#,##0",
    "#,##0.00;-#,##0.00",
    "#,##0.00;[Red]-#,##0.00",
    "#,##0;(#,##0)",
    "#,##0;[Red](#,##0)",
    "#,##0.00;(#,##0.00)",
    "#,##0.00;[Red](#,##0.00)",
    '#,##0;[Red]-#,##0;"-"',
    '0.00;[Red](0.00);"-";@',
    "0%",
    "0.0%",
    "0.00%",
    ...currencyFormats,
    "0E+00",
    "0.0E+00",
    "0.00E+00",
    "##0.0E+0",
    "@",
    // Keep the original unlocalized starting points available for editing.
    "yyyy/m/d",
    "yyyy-mm-dd",
    "h:mm",
    "h:mm:ss",
    "h:mm AM/PM",
    "[h]:mm:ss",
    "000000",
    ...dateCodes,
    ...additionalCodes,
  ]);
}

function uniqueCodes(codes: readonly string[]): string[] {
  return [...new Set(codes)];
}
